#!/usr/bin/env bun
// complex — voice-friendly tmux wrapper. No dashes required anywhere.
// Usage: complex [<N> | <name> | <verb> [args...]]
// Default (no args): numbered session list for voice selection.

import { spawnSync } from "child_process";

// ── ANSI ──────────────────────────────────────────────────────────────────────
const C = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  cyan: "\x1b[36m", yellow: "\x1b[33m", green: "\x1b[32m",
  red: "\x1b[31m", white: "\x1b[97m", gray: "\x1b[90m",
};
const c = (col: keyof typeof C, s: string) => `${C[col]}${s}${C.reset}`;

// ── spoken number → digit ──────────────────────────────────────────────────────
const WORD_TO_NUM: Record<string, number> = {
  one: 1, two: 2, too: 2, to: 2,
  three: 3, four: 4, "for": 4,
  five: 5, six: 6, seven: 7, eight: 8, ate: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20,
};
function wordToNum(s: string): string {
  return s in WORD_TO_NUM ? String(WORD_TO_NUM[s]) : s;
}

// ── tmux helpers ──────────────────────────────────────────────────────────────
function tmux(args: string[], opts: { silent?: boolean } = {}): string {
  const r = spawnSync("tmux", args, { encoding: "utf8" });
  if (r.status !== 0 && !opts.silent) {
    const msg = (r.stderr || "").trim() || r.error?.message || "unknown error";
    console.error(c("red", `tmux: ${msg}`));
    process.exit(1);
  }
  return (r.stdout || "").trim();
}

function tmuxOk(...args: string[]): boolean {
  return spawnSync("tmux", args, { encoding: "utf8" }).status === 0;
}

// ── alias store ───────────────────────────────────────────────────────────────
// Maps spoken word → tmux session name. Persisted to ~/.config/complex/aliases.json
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const ALIAS_DIR  = join(process.env.HOME!, ".config", "complex");
const ALIAS_FILE = join(ALIAS_DIR, "aliases.json");

function loadAliases(): Record<string, string> {
  if (!existsSync(ALIAS_FILE)) return {};
  try { return JSON.parse(readFileSync(ALIAS_FILE, "utf8")); }
  catch { return {}; }
}

function saveAliases(aliases: Record<string, string>) {
  mkdirSync(ALIAS_DIR, { recursive: true });
  writeFileSync(ALIAS_FILE, JSON.stringify(aliases, null, 2) + "\n");
}

// ── session model ─────────────────────────────────────────────────────────────
interface Session { index: number; name: string; windows: number; attached: boolean; }

function getSessions(): Session[] {
  const raw = tmux(
    ["list-sessions", "-F", "#{session_name}|#{session_windows}|#{session_attached}"],
    { silent: true }
  );
  if (!raw) return [];
  return raw.split("\n").map((line, i) => {
    const [name, wins, att] = line.split("|");
    return { index: i + 1, name, windows: parseInt(wins, 10), attached: att === "1" };
  });
}

// Resolve <N> (1-based list position) or <spoken> (alias → exact → prefix → fuzzy).
// Aliases are checked first so hard-to-say names always have a voice-friendly form.
function resolveSession(arg: string, sessions: Session[], aliases: Record<string, string> = {}): Session | null {
  const n = parseInt(arg, 10);
  if (!isNaN(n) && n >= 1 && n <= sessions.length) return sessions[n - 1];
  // alias lookup — maps spoken word to real session name, then resolves that
  const aliasTarget = aliases[arg];
  if (aliasTarget) {
    const byAlias = sessions.find((s) => s.name === aliasTarget);
    if (byAlias) return byAlias;
  }
  return (
    sessions.find((s) => s.name === arg) ??
    sessions.find((s) => s.name.startsWith(arg)) ??
    sessions.find((s) => s.name.includes(arg)) ??
    null
  );
}

// ── fuzzy suggestions ─────────────────────────────────────────────────────────
function levenshtein(a: string, b: string): number {
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[a.length][b.length];
}

interface Suggestion { display: string; score: number; }

function suggestSessions(arg: string, sessions: Session[], aliases: Record<string, string>): Suggestion[] {
  const out: Suggestion[] = [];
  for (const s of sessions) {
    const d = levenshtein(arg, s.name);
    const norm = d / Math.max(arg.length, s.name.length, 1);
    if (norm <= 0.6) out.push({ display: s.name, score: d });
  }
  for (const [spoken, target] of Object.entries(aliases)) {
    const d = levenshtein(arg, spoken);
    const norm = d / Math.max(arg.length, spoken.length, 1);
    if (norm <= 0.6) out.push({ display: `${spoken} ${c("gray", `(alias → ${target})`)}`, score: d });
  }
  return out.sort((a, b) => a.score - b.score).slice(0, 3);
}

function printSuggestions(arg: string, sessions: Session[], aliases: Record<string, string>) {
  const sug = suggestSessions(arg, sessions, aliases);
  if (sug.length === 0) return;
  console.error(c("yellow", "  Did you mean:"));
  for (const s of sug) console.error(`    ${c("white", s.display)}`);
}

// ── list display ──────────────────────────────────────────────────────────────
function printSessions(sessions: Session[], aliases: Record<string, string> = {}) {
  if (sessions.length === 0) {
    console.log(c("yellow", "  No tmux sessions running."));
    console.log(c("gray",   "  complex new <name>  to create one"));
    return;
  }
  // Build reverse map: session name → spoken alias (for display)
  const spokenFor: Record<string, string> = {};
  for (const [spoken, target] of Object.entries(aliases)) spokenFor[target] = spoken;

  const w = sessions.length.toString().length;
  console.log(c("gray", `  ${"#".padStart(w)}  ${"session".padEnd(18)} ${"windows".padEnd(10)} status`));
  console.log(c("gray", "  " + "─".repeat(50)));
  for (const s of sessions) {
    const num    = c("cyan", s.index.toString().padStart(w));
    const spoken = spokenFor[s.name];
    const label  = spoken ? `${s.name} ${c("yellow", `→ say "${spoken}"`)}` : s.name;
    const padded = s.attached
      ? c("bold", c("white", label.padEnd(spoken ? 18 + spoken.length + 12 : 18)))
      : label.padEnd(spoken ? 18 + spoken.length + 12 : 18);
    const wins   = c("gray", `${s.windows} win${s.windows !== 1 ? "s" : ""}`);
    const stat   = s.attached ? c("green", " ● attached") : c("gray", "   detached");
    console.log(`  ${num}  ${padded} ${wins}  ${stat}`);
  }
  console.log();
  console.log(c("gray", "  complex <number> or complex <spoken-alias> to switch"));
}

function printWindows() {
  const raw = tmux(
    ["list-windows", "-F", "#{window_index}|#{window_name}|#{window_active}|#{window_panes}"],
    { silent: true }
  );
  if (!raw) { console.log(c("yellow", "  No windows found.")); return; }
  console.log(c("gray", `  idx  ${"window".padEnd(20)} panes  active`));
  console.log(c("gray", "  " + "─".repeat(44)));
  for (const line of raw.split("\n")) {
    const [idx, name, active, panes] = line.split("|");
    const isActive = active === "1";
    const idxStr  = c("cyan", idx.padStart(3));
    const nameStr = isActive ? c("bold", c("white", name.padEnd(20))) : name.padEnd(20);
    const paneStr = c("gray", `${panes} pane${panes !== "1" ? "s" : ""}`);
    const marker  = isActive ? c("green", " ●") : "  ";
    console.log(`  ${idxStr}  ${nameStr} ${paneStr}${marker}`);
  }
}

// ── help ──────────────────────────────────────────────────────────────────────
function printHelp() {
  console.log(`
${c("cyan", c("bold", "  complex — voice-friendly tmux"))}

  ${c("bold", "List & Switch")}
  ${c("cyan", "complex")}                   list all sessions (numbered)
  ${c("cyan", "complex")} ${c("yellow", "<number>")}         switch to session by list number
  ${c("cyan", "complex")} ${c("yellow", "<name>")}           switch by name (fuzzy — no hyphens needed)
  ${c("cyan", "complex attach")} ${c("yellow", "<number|name>")}  attach from outside tmux, or switch if inside
  ${c("gray", "                           number can be spoken: one two three … ten eleven")}
  ${c("cyan", "complex windows")}           list windows in current session

  ${c("bold", "Create & Destroy")}
  ${c("cyan", "complex new")} ${c("yellow", "<name>")}       create and switch to new session
  ${c("cyan", "complex kill")} ${c("yellow", "<number|name>")} kill a session
  ${c("cyan", "complex rename")} ${c("yellow", "<name>")}    rename current window
  ${c("cyan", "complex detach")}            detach current client

  ${c("bold", "Navigate")}
  ${c("cyan", "complex left")}  ${c("cyan", "right")}  ${c("cyan", "up")}  ${c("cyan", "down")}  move between panes
  ${c("cyan", "complex next")}  ${c("cyan", "prev")}          next / previous window
  ${c("cyan", "complex zoom")}               toggle zoom on current pane

  ${c("bold", "Split")}
  ${c("cyan", "complex split")}             split pane downward
  ${c("cyan", "complex split right")}       split pane to the right

  ${c("bold", "Aliases  (map hard-to-say names to spoken words)")}
  ${c("cyan", "complex alias")} ${c("yellow", "<word> <session>")}  add alias  (e.g. alias chariot chrote-chat)
  ${c("cyan", "complex aliases")}            list all aliases
  ${c("cyan", "complex unalias")} ${c("yellow", "<word>")}         remove alias
`);
}

// ── main ──────────────────────────────────────────────────────────────────────
// Lowercase everything so voice dictation capitalisation never matters.
const argv = process.argv.slice(2).map((w) => w.toLowerCase());
const [verb, ...rest] = argv;

const aliases = loadAliases();

// ── default: no args → numbered session list ──────────────────────────────────
if (!verb) {
  console.log();
  console.log(c("cyan", c("bold", "  complex — tmux sessions")));
  console.log();
  printSessions(getSessions(), aliases);
  process.exit(0);
}

// ── help (plain word, no dashes) ─────────────────────────────────────────────
if (verb === "help") { printHelp(); process.exit(0); }

// ── alias management ──────────────────────────────────────────────────────────
if (verb === "alias") {
  const [spoken, target] = rest;
  if (!spoken) {
    // "complex alias" with no args → same as "complex aliases"
    const entries = Object.entries(aliases);
    if (entries.length === 0) {
      console.log(c("gray", "  No aliases yet.  complex alias <spoken> <session-name>"));
    } else {
      console.log(c("cyan", c("bold", "  Aliases")));
      for (const [sp, tgt] of entries.sort())
        console.log(`  ${c("yellow", sp.padEnd(16))} → ${c("white", tgt)}`);
    }
    process.exit(0);
  }
  if (!target) {
    console.error(c("red", "  Usage: complex alias <spoken-word> <session-name>"));
    console.error(c("gray", "  Example: complex alias chariot chrote-chat"));
    process.exit(1);
  }
  aliases[spoken] = target;
  saveAliases(aliases);
  console.log(c("green", `  Alias saved: say "${spoken}" → switches to "${target}"`));
  process.exit(0);
}

if (verb === "aliases") {
  const entries = Object.entries(aliases);
  if (entries.length === 0) {
    console.log(c("gray", "  No aliases yet.  complex alias <spoken> <session-name>"));
  } else {
    console.log(c("cyan", c("bold", "  Aliases")));
    for (const [spoken, target] of entries.sort())
      console.log(`  ${c("yellow", spoken.padEnd(16))} → ${c("white", target)}`);
  }
  process.exit(0);
}

if (verb === "unalias") {
  const spoken = rest[0];
  if (!spoken) { console.error(c("red", "  Usage: complex unalias <spoken-word>")); process.exit(1); }
  if (!(spoken in aliases)) {
    console.error(c("yellow", `  No alias "${spoken}" found.`));
    process.exit(1);
  }
  const target = aliases[spoken];
  delete aliases[spoken];
  saveAliases(aliases);
  console.log(c("green", `  Removed alias "${spoken}" → "${target}".`));
  process.exit(0);
}

// ── windows ───────────────────────────────────────────────────────────────────
if (verb === "windows" || verb === "wins") {
  console.log();
  console.log(c("cyan", c("bold", "  complex — windows in current session")));
  console.log();
  printWindows();
  process.exit(0);
}

// ── new session ───────────────────────────────────────────────────────────────
if (verb === "new") {
  // Join args with hyphens internally — user speaks plain words, we handle the dash
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

// ── kill ──────────────────────────────────────────────────────────────────────
if (verb === "kill") {
  const target = rest[0];
  if (!target) { console.error(c("red", "  complex: kill needs a number or name")); process.exit(1); }
  const killSessions = getSessions();
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

// ── detach ────────────────────────────────────────────────────────────────────
if (verb === "detach") { tmux(["detach-client"]); process.exit(0); }

// ── split ─────────────────────────────────────────────────────────────────────
if (verb === "split") {
  const dir = rest[0];
  tmux(dir === "right" || dir === "vertical" ? ["split-window", "-h"] : ["split-window", "-v"]);
  process.exit(0);
}

// ── pane navigation ───────────────────────────────────────────────────────────
const DIR: Record<string, string> = { left: "L", right: "R", up: "U", down: "D" };
if (DIR[verb]) { tmux(["select-pane", "-" + DIR[verb]]); process.exit(0); }

// ── window navigation ─────────────────────────────────────────────────────────
if (verb === "next") { tmux(["next-window"]); process.exit(0); }
if (verb === "prev" || verb === "previous" || verb === "back") {
  tmux(["previous-window"]); process.exit(0);
}

// ── zoom ──────────────────────────────────────────────────────────────────────
if (verb === "zoom" || verb === "focus") { tmux(["resize-pane", "-Z"]); process.exit(0); }

// ── rename window ─────────────────────────────────────────────────────────────
if (verb === "rename") {
  const name = rest.join("-");
  if (!name) { console.error(c("red", "  complex: rename needs a name")); process.exit(1); }
  tmux(["rename-window", name]);
  console.log(c("green", `  Window renamed to "${name}".`));
  process.exit(0);
}

// ── send keys (power-user passthrough) ───────────────────────────────────────
if (verb === "send") { tmux(["send-keys", ...rest]); process.exit(0); }

// ── attach (works inside or outside tmux) ────────────────────────────────────
if (verb === "attach") {
  const raw = rest[0] ? wordToNum(rest[0]) : null;
  if (!raw) {
    console.log();
    console.log(c("cyan", c("bold", "  complex — tmux sessions")));
    console.log();
    printSessions(getSessions(), aliases);
    process.exit(0);
  }
  const attachSessions = getSessions();
  const s = resolveSession(raw, attachSessions, aliases);
  if (!s) {
    console.error(c("red", `  complex: no session matching "${rest[0]}"`));
    printSuggestions(raw, attachSessions, aliases);
    process.exit(1);
  }
  if (process.env.TMUX) {
    tmux(["switch-client", "-t", s.name]);
    console.log(c("green", `  Switched to "${s.name}".`));
  } else {
    spawnSync("tmux", ["attach-session", "-t", s.name], { stdio: "inherit" });
  }
  process.exit(0);
}

// ── switch by number or name ──────────────────────────────────────────────────
// This is the fallthrough: any unrecognised word is tried as a session selector.
// "complex yolo" → switch to yolo. "complex 3" → switch to 3rd in list.
// "complex chrote" → fuzzy-matches "chrote-chat" — no hyphen needed.
const sessions = getSessions();
const target = resolveSession(wordToNum(verb), sessions, aliases);
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
printSuggestions(verb, sessions, aliases);
console.error(c("gray", "  complex help  for usage"));
process.exit(1);
