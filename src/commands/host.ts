// ── host — browse or attach to a remote machine ───────────────────────────────
// Handles the `host` verb: no args lists configured hosts; <host> lists that
// host's sessions; <host> <session> attaches.

import { c } from "../lib/colors.ts";
import { wordToNum } from "../lib/words.ts";
import { getRemoteSessions, resolveSession } from "../sessions.ts";
import { resolveHost, attachRemote } from "../hosts.ts";
import { printSessions } from "../display.ts";
import { usageError } from "../help.ts";
import type { ComplexConfig } from "../config.ts";

export function handle(rest: string[], cfg: ComplexConfig): never {
  const [hostArg, sessionArg] = rest;

  if (!hostArg) {
    // List configured hosts
    const hosts = Object.entries(cfg.hosts);
    if (hosts.length === 0) {
      console.log(c("gray", "  No remote hosts. complex config host add <name> <address>"));
    } else {
      console.log();
      console.log(c("cyan", c("bold", "  complex — remote hosts")));
      console.log();
      for (const [name, h] of hosts.sort()) {
        const isDefault = name === cfg.default_host;
        const marker = isDefault ? c("magenta", " ◆ default") : "";
        const connect = h.connect ?? cfg.connect;
        console.log(`  ${c("magenta", name.padEnd(14))} ${h.address}  ${c("gray", connect)}${marker}`);
      }
      console.log();
      console.log(c("gray", "  complex host <name>  to list sessions on that machine"));
    }
    process.exit(0);
  }

  const resolved = resolveHost(hostArg, cfg);
  if (!resolved) usageError("host", `unknown host "${hostArg}" — add it with: complex config host add ${hostArg} <address>`);
  const [hostName, hostCfg] = resolved;

  if (!sessionArg) {
    // List sessions on that host
    console.log();
    console.log(c("cyan", c("bold", `  complex — tmux sessions${c("magenta", ` [${hostName}]`)}`)));
    console.log();
    const sessions = getRemoteSessions(hostCfg);
    if (sessions.length === 0) {
      console.log(c("yellow", `  No tmux sessions on ${hostName}, or host unreachable.`));
      const userAt = hostCfg.user ? `${hostCfg.user}@` : "";
      console.log(c("gray", `  ${hostCfg.connect ?? cfg.connect} ${userAt}${hostCfg.address}`));
    } else {
      printSessions(sessions, {}, hostName);
    }
    process.exit(0);
  }

  // Attach to a specific session on the host
  const sessions = getRemoteSessions(hostCfg);
  const target = resolveSession(wordToNum(sessionArg), sessions);
  if (!target) {
    console.error(c("red", `  complex: no session matching "${sessionArg}" on ${hostName}`));
    process.exit(1);
  }
  console.log(c("green", `  Attaching to "${target.name}" on ${hostName}…`));
  attachRemote(hostCfg, target.name, cfg);
  process.exit(0);
}
