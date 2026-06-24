#!/usr/bin/env bun
// complex — voice-friendly tmux wrapper. No dashes required anywhere.
// Usage: complex [<N> | <name> | <verb> [args...]]
// Default (no args): numbered session list for voice selection.
//
// This entry point is a thin router: parse argv, dispatch to a command handler,
// then fall through to the local session-switch. All logic lives under src/.

import { c } from "./src/lib/colors.ts";
import { wordToNum } from "./src/lib/words.ts";
import { tmux } from "./src/lib/tmux.ts";
import { printSuggestions } from "./src/lib/suggest.ts";
import { loadConfig } from "./src/config.ts";
import { loadAliases } from "./src/aliases.ts";
import { getLocalSessions, getRemoteSessions, resolveSession } from "./src/sessions.ts";
import { printSessions } from "./src/display.ts";
import { printHelp } from "./src/help.ts";
import * as aliasCmd from "./src/commands/alias.ts";
import * as hostCmd from "./src/commands/host.ts";
import * as configCmd from "./src/commands/config.ts";
import * as attachCmd from "./src/commands/attach.ts";
import * as navCmd from "./src/commands/nav.ts";

const argv = process.argv.slice(2).map((w) => w.toLowerCase());
const [verb, ...rest] = argv;

const aliases = loadAliases();
const cfg     = loadConfig();

// ── default: no args → sessions on default host ───────────────────────────────
if (!verb) {
  console.log();
  if (cfg.default_host === "local" || !cfg.hosts[cfg.default_host]) {
    console.log(c("cyan", c("bold", "  complex — tmux sessions")));
    console.log();
    printSessions(getLocalSessions(), aliases);
  } else {
    const hostName = cfg.default_host;
    const host = cfg.hosts[hostName];
    console.log(c("cyan", c("bold", `  complex — tmux sessions${c("magenta", ` [${hostName}]`)}`)));
    console.log();
    const sessions = getRemoteSessions(host);
    if (sessions.length === 0 && !host) {
      console.log(c("red", `  Could not reach "${hostName}" or no tmux sessions running there.`));
    } else {
      printSessions(sessions, aliases, hostName);
    }
  }
  process.exit(0);
}

// ── verb routing ──────────────────────────────────────────────────────────────
if (verb === "help") { printHelp(); process.exit(0); }
if (verb === "host") hostCmd.handle(rest, cfg);
if (verb === "config") configCmd.handle(rest, cfg);
if (verb === "alias" || verb === "aliases" || verb === "unalias") aliasCmd.handle(verb, rest, aliases);
if (navCmd.NAV_VERBS.has(verb)) navCmd.handle(verb, rest, aliases);
if (verb === "attach") attachCmd.handle(rest, aliases, cfg);

// ── switch by number or name (local fallthrough) ──────────────────────────────
const localSessions = getLocalSessions();
const target = resolveSession(wordToNum(verb), localSessions, aliases);
if (target) {
  if (target.attached) {
    console.log(c("yellow", `  Already attached to "${target.name}".`));
  } else {
    tmux(["switch-client", "-t", target.name]);
    console.log(c("green", `  Switched to "${target.name}".`));
  }
  process.exit(0);
}

console.error(c("red", `  complex: unknown command or session "${verb}"`));
printSuggestions(verb, localSessions, aliases);
console.error(c("gray", "  complex help  for usage"));
process.exit(1);
