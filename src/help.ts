// ── help text ─────────────────────────────────────────────────────────────────
// Per-verb help sections (VERB_HELP), the usageError() helper that prints a
// verb's help on a malformed command, and the full help screen (printHelp).

import { c } from "./lib/colors.ts";

export const VERB_HELP: Record<string, () => void> = {
  host: () => console.log(`
  ${c("bold", "Remote Hosts")}
  ${c("cyan", "complex host")}                      list all configured hosts
  ${c("cyan", "complex host")} ${c("magenta", "<host>")}             list sessions on a remote host
  ${c("cyan", "complex host")} ${c("magenta", "<host>")} ${c("yellow", "<session>")}   attach to session on that host
  ${c("gray", "  <host> can be a name, alias, or spoken alias (e.g. minitwo → mini2)")}
  ${c("gray", "  complex config host add <name> <address>  to register a host")}
  ${c("gray", "  complex config host <name> alias <word>   to add a spoken alias")}
`),

  attach: () => console.log(`
  ${c("bold", "Attach")}
  ${c("cyan", "complex attach")}                    list sessions on default host
  ${c("cyan", "complex attach")} ${c("yellow", "<session>")}         attach to session on default host
  ${c("cyan", "complex attach")} ${c("magenta", "<host>")} ${c("yellow", "<session>")}  attach to session on a specific host
  ${c("gray", "  Inside tmux: switch-client.  Outside: attach-session.")}
  ${c("gray", "  Remote: opens ssh/mosh connection and attaches in one command.")}
  ${c("gray", "  complex config set default <host>  to change the default host")}
`),

  new: () => console.log(`
  ${c("bold", "New session")}
  ${c("cyan", "complex new")} ${c("yellow", "<name>")}             create and switch to a new tmux session
  ${c("gray", "  Spaces become hyphens: complex new my project → my-project")}
  ${c("gray", "  If the session already exists, switches to it instead")}
`),

  kill: () => console.log(`
  ${c("bold", "Kill session")}
  ${c("cyan", "complex kill")} ${c("yellow", "<number>")}          kill session by list number
  ${c("cyan", "complex kill")} ${c("yellow", "<name>")}            kill session by name (fuzzy)
`),

  rename: () => console.log(`
  ${c("bold", "Rename window")}
  ${c("cyan", "complex rename")} ${c("yellow", "<name>")}          rename the current tmux window
  ${c("gray", "  Spaces become hyphens")}
`),

  split: () => console.log(`
  ${c("bold", "Split pane")}
  ${c("cyan", "complex split")}                     split pane downward (horizontal)
  ${c("cyan", "complex split right")}               split pane to the right (vertical)
`),

  alias: () => console.log(`
  ${c("bold", "Session aliases  (map hard-to-say names to spoken words)")}
  ${c("cyan", "complex alias")}                     list all session aliases
  ${c("cyan", "complex alias")} ${c("yellow", "<word> <session>")}   map a spoken word to a session name
  ${c("cyan", "complex unalias")} ${c("yellow", "<word>")}           remove a session alias
  ${c("gray", "  Example: complex alias yolo my-long-session-name")}
`),

  unalias: () => VERB_HELP["alias"](),

  config: () => console.log(`
  ${c("bold", "Config")}
  ${c("cyan", "complex config")}                            show all config
  ${c("cyan", "complex config set connect")} ${c("yellow", "<cmd>")}         set global connect command (ssh, mosh, …)
  ${c("cyan", "complex config set default")} ${c("yellow", "<host|local>")}  set default host shown by ${c("cyan", "complex")}
  ${c("cyan", "complex config hosts")}                       list configured hosts
  ${c("cyan", "complex config aliases")}                     list host aliases

  ${c("bold", "  Host management")}
  ${c("cyan", "complex config host add")} ${c("yellow", "<name> <addr>")}    add a remote host
  ${c("cyan", "complex config host")} ${c("yellow", "<name>")} ${c("cyan", "alias")} ${c("yellow", "<word>")}       add spoken alias for host
  ${c("cyan", "complex config host")} ${c("yellow", "<name>")} ${c("cyan", "set connect")} ${c("yellow", "<cmd>")}  per-host connect override
  ${c("cyan", "complex config host")} ${c("yellow", "<name>")} ${c("cyan", "set user")} ${c("yellow", "<user>")}    set ssh user for host
  ${c("cyan", "complex config host")} ${c("yellow", "<name>")} ${c("cyan", "remove")}             remove host
`),
};

export function usageError(verb: string, msg: string): never {
  console.error(c("red", `  ${msg}`));
  const helpFn = VERB_HELP[verb];
  if (helpFn) { console.log(); helpFn(); }
  process.exit(1);
}

export function printHelp() {
  console.log(`\n${c("cyan", c("bold", "  complex — voice-friendly tmux"))}\n`);
  console.log(`  ${c("bold", "List & Switch (local or default host)")}`);
  console.log(`  ${c("cyan", "complex")}                           list sessions on default host`);
  console.log(`  ${c("cyan", "complex")} ${c("yellow", "<number>")}               switch/attach by list number`);
  console.log(`  ${c("cyan", "complex")} ${c("yellow", "<name>")}                 switch/attach by name (fuzzy)`);
  console.log(`  ${c("cyan", "complex windows")}                   list windows in current session`);
  VERB_HELP["host"]();
  VERB_HELP["attach"]();
  VERB_HELP["new"]();
  VERB_HELP["kill"]();
  VERB_HELP["rename"]();
  console.log(`  ${c("cyan", "complex detach")}                    detach current client\n`);
  console.log(`  ${c("bold", "Navigate")}`);
  console.log(`  ${c("cyan", "complex left")}  ${c("cyan", "right")}  ${c("cyan", "up")}  ${c("cyan", "down")}      move between panes`);
  console.log(`  ${c("cyan", "complex next")}  ${c("cyan", "prev")}              next / previous window`);
  console.log(`  ${c("cyan", "complex zoom")}                       toggle zoom on current pane`);
  VERB_HELP["split"]();
  VERB_HELP["alias"]();
  VERB_HELP["config"]();
}
