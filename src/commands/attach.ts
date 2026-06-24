// ── attach ────────────────────────────────────────────────────────────────────
// Handles the `attach` verb. Two forms:
//   complex attach <session>          → attach on default host (or local)
//   complex attach <host> <session>   → attach on specific host
// No args → show the default host's session list.

import { spawnSync } from "child_process";
import { c } from "../lib/colors.ts";
import { wordToNum } from "../lib/words.ts";
import { tmux } from "../lib/tmux.ts";
import { printSuggestions } from "../lib/suggest.ts";
import { getLocalSessions, getRemoteSessions, resolveSession } from "../sessions.ts";
import { resolveHost, attachRemote } from "../hosts.ts";
import { printSessions } from "../display.ts";
import type { ComplexConfig } from "../config.ts";

export function handle(rest: string[], aliases: Record<string, string>, cfg: ComplexConfig): never {
  const [first, second] = rest;

  if (!first) {
    // No args — show default host session list
    console.log();
    if (cfg.default_host !== "local" && cfg.hosts[cfg.default_host]) {
      const hostName = cfg.default_host;
      console.log(c("cyan", c("bold", `  complex — sessions${c("magenta", ` [${hostName}]`)}`)));
      console.log();
      printSessions(getRemoteSessions(cfg.hosts[hostName]), aliases, hostName);
    } else {
      console.log(c("cyan", c("bold", "  complex — tmux sessions")));
      console.log();
      printSessions(getLocalSessions(), aliases);
    }
    process.exit(0);
  }

  // Check if first arg is a known host
  const hostMatch = resolveHost(first, cfg);
  if (hostMatch && second) {
    const [hostName, hostCfg] = hostMatch;
    const sessions = getRemoteSessions(hostCfg);
    const target = resolveSession(wordToNum(second), sessions);
    if (!target) {
      console.error(c("red", `  complex: no session matching "${second}" on ${hostName}`));
      process.exit(1);
    }
    console.log(c("green", `  Attaching to "${target.name}" on ${hostName}…`));
    attachRemote(hostCfg, target.name, cfg);
    process.exit(0);
  }

  // Single arg or first arg isn't a host → treat as local session (or default host)
  const sessionArg = wordToNum(first);

  if (cfg.default_host !== "local" && cfg.hosts[cfg.default_host]) {
    // Default host is remote
    const hostName = cfg.default_host;
    const hostCfg  = cfg.hosts[hostName];
    const sessions = getRemoteSessions(hostCfg);
    const target   = resolveSession(sessionArg, sessions, aliases);
    if (!target) {
      console.error(c("red", `  complex: no session matching "${first}" on ${hostName}`));
      process.exit(1);
    }
    console.log(c("green", `  Attaching to "${target.name}" on ${hostName}…`));
    attachRemote(hostCfg, target.name, cfg);
  } else {
    // Local
    const localSessions = getLocalSessions();
    const s = resolveSession(sessionArg, localSessions, aliases);
    if (!s) {
      console.error(c("red", `  complex: no session matching "${first}"`));
      printSuggestions(sessionArg, localSessions, aliases);
      process.exit(1);
    }
    if (process.env.TMUX) {
      tmux(["switch-client", "-t", s.name]);
      console.log(c("green", `  Switched to "${s.name}".`));
    } else {
      spawnSync("tmux", ["attach-session", "-t", s.name], { stdio: "inherit" });
    }
  }
  process.exit(0);
}
