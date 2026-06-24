// ── host resolution & remote attach ───────────────────────────────────────────
// resolveHost maps an argument (alias → exact → prefix → substring) to a host.
// attachRemote opens an ssh/mosh connection and attaches to a session in one go.

import { spawnSync } from "child_process";
import type { ComplexConfig, HostConfig } from "./config.ts";

// Checks host_aliases first, then exact name, prefix, fuzzy.
export function resolveHost(arg: string, cfg: ComplexConfig): [string, HostConfig] | null {
  const dealiased = cfg.host_aliases[arg] ?? arg;
  if (cfg.hosts[dealiased]) return [dealiased, cfg.hosts[dealiased]];
  const prefix = Object.entries(cfg.hosts).find(([n]) => n.startsWith(dealiased));
  if (prefix) return prefix as [string, HostConfig];
  const incl = Object.entries(cfg.hosts).find(([n]) => n.includes(dealiased));
  if (incl) return incl as [string, HostConfig];
  return null;
}

export function attachRemote(host: HostConfig, session: string, cfg: ComplexConfig) {
  const userAt = host.user ? `${host.user}@` : "";
  const target = `${userAt}${host.address}`;
  const cmd = host.connect ?? cfg.connect;

  let spawnArgs: string[];
  if (cmd === "mosh") {
    spawnArgs = [target, "--", "tmux", "attach-session", "-t", session];
  } else {
    // ssh and any ssh-compatible command
    spawnArgs = ["-t", target, `tmux attach-session -t '${session}'`];
  }

  spawnSync(cmd, spawnArgs, { stdio: "inherit" });
}
