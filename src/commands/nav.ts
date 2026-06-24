// ── navigation & session ops ──────────────────────────────────────────────────
// Handles the local tmux verbs: windows/wins, new, kill, detach, split, pane
// navigation (left/right/up/down), next/prev, zoom/focus, rename, pane, send.
//
// NAV_VERBS lets the router decide whether this group owns the verb before
// falling through to the session-switch fallback.

import { c } from "../lib/colors.ts";
import { tmux, tmuxOk } from "../lib/tmux.ts";
import { printSuggestions } from "../lib/suggest.ts";
import { getLocalSessions, resolveSession } from "../sessions.ts";
import { printWindows } from "../display.ts";
import { usageError } from "../help.ts";

// pane direction verb → tmux select-pane flag letter
const DIR: Record<string, string> = { left: "L", right: "R", up: "U", down: "D" };

export const NAV_VERBS: ReadonlySet<string> = new Set([
  "windows", "wins", "new", "kill", "detach", "split",
  "left", "right", "up", "down",
  "next", "prev", "previous", "back",
  "zoom", "focus", "rename", "pane", "send",
]);

export function handle(verb: string, rest: string[], aliases: Record<string, string>): never {
  // ── windows ─────────────────────────────────────────────────────────────────
  if (verb === "windows" || verb === "wins") {
    console.log();
    console.log(c("cyan", c("bold", "  complex — windows in current session")));
    console.log();
    printWindows();
    process.exit(0);
  }

  // ── new session ─────────────────────────────────────────────────────────────
  if (verb === "new") {
    const name = rest.join("-") || "unnamed";
    if (tmuxOk("has-session", "-t", name)) {
      console.log(c("yellow", `  Session "${name}" already exists — switching to it.`));
      tmux(["switch-client", "-t", name]);
    } else {
      tmux(["new-session", "-d", "-s", name]);
      console.log(c("green", `  Created session "${name}".`));
      tmux(["switch-client", "-t", name]);
    }
    process.exit(0);
  }

  // ── kill ────────────────────────────────────────────────────────────────────
  if (verb === "kill") {
    const target = rest[0];
    if (!target) usageError("kill", "kill needs a session number or name");
    const killSessions = getLocalSessions();
    const s = resolveSession(target, killSessions, aliases);
    if (!s) {
      console.error(c("red", `  complex: no session matching "${target}"`));
      printSuggestions(target, killSessions, aliases);
      process.exit(1);
    }
    tmux(["kill-session", "-t", s.name]);
    console.log(c("green", `  Killed "${s.name}".`));
    process.exit(0);
  }

  // ── detach ──────────────────────────────────────────────────────────────────
  if (verb === "detach") { tmux(["detach-client"]); process.exit(0); }

  // ── split ───────────────────────────────────────────────────────────────────
  if (verb === "split") {
    const dir = rest[0];
    tmux(dir === "right" || dir === "vertical" ? ["split-window", "-h"] : ["split-window", "-v"]);
    process.exit(0);
  }

  // ── pane navigation ─────────────────────────────────────────────────────────
  if (DIR[verb]) { tmux(["select-pane", "-" + DIR[verb]]); process.exit(0); }

  // ── window navigation ───────────────────────────────────────────────────────
  if (verb === "next") { tmux(["next-window"]); process.exit(0); }
  if (verb === "prev" || verb === "previous" || verb === "back") {
    tmux(["previous-window"]); process.exit(0);
  }

  // ── zoom ────────────────────────────────────────────────────────────────────
  if (verb === "zoom" || verb === "focus") { tmux(["resize-pane", "-Z"]); process.exit(0); }

  // ── rename window ───────────────────────────────────────────────────────────
  if (verb === "rename") {
    const name = rest.join("-");
    if (!name) usageError("rename", "rename needs a name");
    tmux(["rename-window", name]);
    console.log(c("green", `  Window renamed to "${name}".`));
    process.exit(0);
  }

  // ── pane: switch to named window or create it ───────────────────────────────
  if (verb === "pane") {
    const name = rest.join("-");
    if (!name) usageError("pane", "pane needs a name");
    const raw = tmux(["list-windows", "-F", "#{window_name}"], { silent: true });
    const windowNames = raw ? raw.split("\n") : [];
    const match =
      windowNames.find((w) => w === name) ??
      windowNames.find((w) => w.startsWith(name)) ??
      windowNames.find((w) => w.includes(name));
    if (match) {
      tmux(["select-window", "-t", match]);
      console.log(c("green", `  Switched to window "${match}".`));
    } else {
      tmux(["new-window", "-n", name]);
      console.log(c("green", `  Created window "${name}".`));
    }
    process.exit(0);
  }

  // ── send keys ───────────────────────────────────────────────────────────────
  if (verb === "send") { tmux(["send-keys", ...rest]); process.exit(0); }

  // Unreachable when callers gate on NAV_VERBS, but keep the contract honest.
  usageError(verb, `complex: unknown navigation verb "${verb}"`);
}
