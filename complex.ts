#!/usr/bin/env bun
// complex — voice-friendly tmux wrapper. No dashes required anywhere.
// Usage: complex [<N> | <name> | <verb> [args...]]
// Default (no args): numbered session list for voice selection.

import { spawnSync } from "child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

// ── ANSI ──────────────────────────────────────────────────────────────────────
const C = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  cyan: "\x1b[36m", yellow: "\x1b[33m", green: "\x1b[32m",
  red: "\x1b[31m", white: "\x1b[97m", gray: "\x1b[90m",
  magenta: "\x1b[35m",
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

// ── config store ──────────────────────────────────────────────────────────────
const CONFIG_DIR  = join(process.env.HOME!, ".config", "complex");
const ALIAS_FILE  = join(CONFIG_DIR, "aliases.json");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

interface HostConfig {
  address: string;
  user?: string;
  connect?: string; // overrides global connect for this host
}

interface ComplexConfig {
  connect: string;                       // default: "ssh"
  default_host: string;                  // "local" or a host name
  host_aliases: Record<string, string>;  // spoken word → host name
  hosts: Record<string, HostConfig>;
}

const CONFIG_DEFAULTS: ComplexConfig = {
  connect: "ssh",
  default_host: "local",
  host_aliases: {},
  hosts: {},
};

function loadConfig(): ComplexConfig {
  if (!existsSync(CONFIG_FILE)) return { ...CONFIG_DEFAULTS };
  try {
    const parsed = JSON.parse(readFileSync(CONFIG_FILE, "utf8"));
    return {
      ...CONFIG_DEFAULTS,
      ...parsed,
      host_aliases: parsed.host_aliases ?? {},
      hosts: parsed.hosts ?? {},
    };
  } catch { return { ...CONFIG_DEFAULTS }; }
}

function saveConfig(cfg: ComplexConfig) {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2) + "\n");
}

// ── alias store (session aliases) ─────────────────────────────────────────────
function loadAliases(): Record<string, string> {
  if (!existsSync(ALIAS_FILE)) return {};
  try { return JSON.parse(readFileSync(ALIAS_FILE, "utf8")); }
  catch { return {}; }
}

function saveAliases(aliases: Record<string, string>) {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(ALIAS_FILE, JSON.stringify(aliases, null, 2) + "\n");
}

// ── session model ─────────────────────────────────────────────────────────────
interface Session { index: number; name: string; windows: number; attached: boolean; }

function getLocalSessions(): Session[] {
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

// ── remote session fetching ───────────────────────────────────────────────────
// Always SSH for listing (mosh is interactive-only). Uses configured connect
// command only when actually attaching.
function getRemoteSessions(host: HostConfig): Session[] {
  const userAt = host.user ? `${host.user}@` : "";
  const target = `${userAt}${host.address}`;
  const r = spawnSync("ssh", [
    "-o", "ConnectTimeout=5",
    "-o", "BatchMode=yes",
    "-o", "StrictHostKeyChecking=accept-new",
    target,
    "tmux list-sessions -F '#{session_name}|#{session_windows}|#{session_attached}' 2>/dev/null || true",
  ], { encoding: "utf8", timeout: 7000 });

  if (r.status !== 0 || !r.stdout?.trim()) return [];
  return r.stdout.trim().split("\n").filter(l => l.includes("|")).map((line, i) => {
    const [name, wins, att] = line.split("|");
    return { index: i + 1, name, windows: parseInt(wins, 10), attached: att === "1" };
  });
}

// ── host resolution ───────────────────────────────────────────────────────────
// Checks host_aliases first, then exact name, prefix, fuzzy.
function resolveHost(arg: string, cfg: ComplexConfig): [string, HostConfig] | null {
  const dealiased = cfg.host_aliases[arg] ?? arg;
  if (cfg.hosts[dealiased]) return [dealiased, cfg.hosts[dealiased]];
  const prefix = Object.entries(cfg.hosts).find(([n]) => n.startsWith(dealiased));
  if (prefix) return prefix as [string, HostConfig];
  const incl = Object.entries(cfg.hosts).find(([n]) => n.includes(dealiased));
  if (incl) return incl as [string, HostConfig];
  return null;
}

// ── remote attach ─────────────────────────────────────────────────────────────
function attachRemote(host: HostConfig, session: string, cfg: ComplexConfig) {
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

// ── session resolution ────────────────────────────────────────────────────────
function resolveSession(arg: string, sessions: Session[], aliases: Record<string, string> = {}): Session | null {
  const n = parseInt(arg, 10);
  if (!isNaN(n) && n >= 1 && n <= sessions.length) return sessions[n - 1];
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
    if (d / Math.max(arg.length, s.name.length, 1) <= 0.6)
      out.push({ display: s.name, score: d });
  }
  for (const [spoken, target] of Object.entries(aliases)) {
    const d = levenshtein(arg, spoken);
    if (d / Math.max(arg.length, spoken.length, 1) <= 0.6)
      out.push({ display: `${spoken} ${c("gray", `(alias → ${target})`)}`, score: d });
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
function printSessions(
  sessions: Session[],
  aliases: Record<string, string> = {},
  hostLabel?: string, // shown in header when browsing a remote host
) {
  const label = hostLabel ? c("magenta", ` [${hostLabel}]`) : "";

  if (sessions.length === 0) {
    if (hostLabel) {
      console.log(c("yellow", `  No tmux sessions on ${hostLabel}.`));
    } else {
      console.log(c("yellow", "  No tmux sessions running."));
      console.log(c("gray",   "  complex new <name>  to create one"));
    }
    return;
  }

  const spokenFor: Record<string, string> = {};
  for (const [spoken, target] of Object.entries(aliases)) spokenFor[target] = spoken;

  const w = sessions.length.toString().length;
  console.log(c("gray", `  ${"#".padStart(w)}  ${"session".padEnd(18)} ${"windows".padEnd(10)} status`));
  console.log(c("gray", "  " + "─".repeat(50)));
  for (const s of sessions) {
    const num    = c("cyan", s.index.toString().padStart(w));
    const spoken = spokenFor[s.name];
    const sname  = spoken ? `${s.name} ${c("yellow", `→ say "${spoken}"`)}` : s.name;
    const padded = s.attached
      ? c("bold", c("white", sname.padEnd(spoken ? 18 + spoken.length + 12 : 18)))
      : sname.padEnd(spoken ? 18 + spoken.length + 12 : 18);
    const wins = c("gray", `${s.windows} win${s.windows !== 1 ? "s" : ""}`);
    const stat = s.attached ? c("green", " ● attached") : c("gray", "   detached");
    console.log(`  ${num}  ${padded} ${wins}  ${stat}`);
  }
  console.log();
  if (hostLabel) {
    console.log(c("gray", `  complex attach ${hostLabel} <number|name>`));
  } else {
    console.log(c("gray", "  complex <number> or complex <spoken-alias> to switch"));
  }
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

// ── config display ────────────────────────────────────────────────────────────
function printConfig(cfg: ComplexConfig) {
  console.log();
  console.log(c("cyan", c("bold", "  complex — config")));
  console.log();
  console.log(`  ${c("gray", "connect")}       ${c("white", cfg.connect)}`);
  console.log(`  ${c("gray", "default host")} ${cfg.default_host === "local"
    ? c("gray", "local")
    : c("magenta", cfg.default_host)}`);
  console.log();

  // host aliases
  const haEntries = Object.entries(cfg.host_aliases);
  if (haEntries.length > 0) {
    console.log(c("gray", "  Host aliases"));
    for (const [spoken, target] of haEntries.sort())
      console.log(`    ${c("yellow", spoken.padEnd(14))} → ${c("magenta", target)}`);
    console.log();
  }

  // hosts
  const hosts = Object.entries(cfg.hosts);
  if (hosts.length === 0) {
    console.log(c("gray", "  No remote hosts configured."));
    console.log(c("gray", "  complex config host add <name> <address>"));
  } else {
    console.log(c("gray", `  ${"host".padEnd(14)} ${"address".padEnd(22)} ${"user".padEnd(12)} connect`));
    console.log(c("gray", "  " + "─".repeat(60)));
    for (const [name, h] of hosts.sort()) {
      const isDefault = name === cfg.default_host;
      const nameStr = isDefault ? c("bold", c("magenta", name.padEnd(14))) : c("white", name.padEnd(14));
      const connect = h.connect ? c("yellow", h.connect) : c("gray", `(${cfg.connect})`);
      const user    = h.user    ? c("white",  h.user)    : c("gray", "(default)");
      const marker  = isDefault ? c("magenta", " ◆") : "";
      console.log(`  ${nameStr} ${h.address.padEnd(22)} ${user.padEnd(12)}  ${connect}${marker}`);
    }
  }
  console.log();
  console.log(c("gray", "  complex config set connect <ssh|mosh|…>"));
  console.log(c("gray", "  complex config set default <host|local>"));
  console.log(c("gray", "  complex config host add <name> <address>"));
  console.log(c("gray", "  complex config host <name> alias <word>"));
  console.log(c("gray", "  complex config host <name> set connect <ssh|mosh|…>"));
}

// ── help ──────────────────────────────────────────────────────────────────────
function printHelp() {
  console.log(`
${c("cyan", c("bold", "  complex — voice-friendly tmux"))}

  ${c("bold", "List & Switch (local or default host)")}
  ${c("cyan", "complex")}                           list sessions on default host
  ${c("cyan", "complex")} ${c("yellow", "<number>")}               switch/attach by list number
  ${c("cyan", "complex")} ${c("yellow", "<name>")}                 switch/attach by name (fuzzy)
  ${c("cyan", "complex windows")}                   list windows in current session

  ${c("bold", "Remote Hosts")}
  ${c("cyan", "complex host")} ${c("magenta", "<host>")}             list sessions on a remote host
  ${c("cyan", "complex host")} ${c("magenta", "<host>")} ${c("yellow", "<session>")}   attach to session on host

  ${c("bold", "Attach")}
  ${c("cyan", "complex attach")} ${c("yellow", "<session>")}         attach to session on default host
  ${c("cyan", "complex attach")} ${c("magenta", "<host>")} ${c("yellow", "<session>")}  attach to session on a specific host
  ${c("gray", "  Inside tmux: switch-client. Outside: attach-session.")}
  ${c("gray", "  Remote: ssh/mosh + tmux attach in one command.")}

  ${c("bold", "Create & Destroy")}
  ${c("cyan", "complex new")} ${c("yellow", "<name>")}             create and switch to new session
  ${c("cyan", "complex kill")} ${c("yellow", "<number|name>")}     kill a session
  ${c("cyan", "complex rename")} ${c("yellow", "<name>")}          rename current window
  ${c("cyan", "complex detach")}                    detach current client

  ${c("bold", "Navigate")}
  ${c("cyan", "complex left")}  ${c("cyan", "right")}  ${c("cyan", "up")}  ${c("cyan", "down")}      move between panes
  ${c("cyan", "complex next")}  ${c("cyan", "prev")}              next / previous window
  ${c("cyan", "complex zoom")}                       toggle zoom on current pane

  ${c("bold", "Split")}
  ${c("cyan", "complex split")}                     split pane downward
  ${c("cyan", "complex split right")}               split pane to the right

  ${c("bold", "Session Aliases  (map hard-to-say session names to spoken words)")}
  ${c("cyan", "complex alias")} ${c("yellow", "<word> <session>")}      add alias
  ${c("cyan", "complex aliases")}                    list session aliases
  ${c("cyan", "complex unalias")} ${c("yellow", "<word>")}              remove alias

  ${c("bold", "Config")}
  ${c("cyan", "complex config")}                    show all config
  ${c("cyan", "complex config set connect")} ${c("yellow", "<cmd>")}   set global connect command
  ${c("cyan", "complex config set default")} ${c("yellow", "<host|local>")}  set default host
  ${c("cyan", "complex config host add")} ${c("yellow", "<name> <addr>")}  add remote host
  ${c("cyan", "complex config host")} ${c("yellow", "<name>")} ${c("cyan", "alias")} ${c("yellow", "<word>")}   add spoken alias for host
  ${c("cyan", "complex config host")} ${c("yellow", "<name>")} ${c("cyan", "set connect")} ${c("yellow", "<cmd>")}  per-host connect override
  ${c("cyan", "complex config host")} ${c("yellow", "<name>")} ${c("cyan", "set user")} ${c("yellow", "<user>")}    set ssh user for host
  ${c("cyan", "complex config host")} ${c("yellow", "<name>")} ${c("cyan", "remove")}       remove host
`);
}

// ── main ──────────────────────────────────────────────────────────────────────
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

// ── help ──────────────────────────────────────────────────────────────────────
if (verb === "help") { printHelp(); process.exit(0); }

// ── host — browse or attach to a remote machine ───────────────────────────────
if (verb === "host") {
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
  if (!resolved) {
    console.error(c("red", `  complex: unknown host "${hostArg}"`));
    console.error(c("gray", "  complex config host add <name> <address>  to register one"));
    process.exit(1);
  }
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

// ── config ────────────────────────────────────────────────────────────────────
if (verb === "config") {
  const [sub, ...crest] = rest;

  if (!sub || sub === "show") { printConfig(cfg); process.exit(0); }

  if (sub === "hosts") {
    const hosts = Object.entries(cfg.hosts);
    if (hosts.length === 0) {
      console.log(c("gray", "  No remote hosts. complex config host add <name> <address>"));
    } else {
      console.log(c("cyan", c("bold", "  Hosts")));
      for (const [name, h] of hosts.sort()) {
        const connect = h.connect ?? cfg.connect;
        const user    = h.user ? ` user=${c("white", h.user)}` : "";
        const isDefault = name === cfg.default_host;
        const marker    = isDefault ? c("magenta", " ◆") : "";
        console.log(`  ${c("magenta", name.padEnd(14))} ${h.address.padEnd(24)}${user}  ${c("gray", connect)}${marker}`);
      }
    }
    process.exit(0);
  }

  if (sub === "aliases") {
    // Show host aliases
    const entries = Object.entries(cfg.host_aliases);
    if (entries.length === 0) {
      console.log(c("gray", "  No host aliases. complex config host <name> alias <word>"));
    } else {
      console.log(c("cyan", c("bold", "  Host aliases")));
      for (const [spoken, target] of entries.sort())
        console.log(`  ${c("yellow", spoken.padEnd(16))} → ${c("magenta", target)}`);
    }
    process.exit(0);
  }

  if (sub === "set") {
    const [key, val] = crest;
    if (!key || !val) {
      console.error(c("red", "  Usage: complex config set <connect|default> <value>"));
      process.exit(1);
    }
    if (key === "connect") {
      cfg.connect = val;
      saveConfig(cfg);
      console.log(c("green", `  Global connect command set to "${val}".`));
    } else if (key === "default") {
      if (val !== "local" && !cfg.hosts[val]) {
        console.error(c("red", `  Unknown host "${val}". Add it first: complex config host add ${val} <address>`));
        process.exit(1);
      }
      cfg.default_host = val;
      saveConfig(cfg);
      console.log(c("green", `  Default host set to "${val}".`));
    } else {
      console.error(c("red", `  Unknown config key "${key}". Valid: connect, default`));
      process.exit(1);
    }
    process.exit(0);
  }

  if (sub === "host") {
    const [nameOrAction, action, ...hrest] = crest;

    if (nameOrAction === "add") {
      const [hname, addr] = [action, hrest[0]];
      if (!hname || !addr) {
        console.error(c("red", "  Usage: complex config host add <name> <address>"));
        process.exit(1);
      }
      cfg.hosts[hname] = { address: addr };
      saveConfig(cfg);
      console.log(c("green", `  Host "${hname}" added → ${addr}  (connect: ${cfg.connect})`));
      process.exit(0);
    }

    const hname = nameOrAction;
    if (!hname) {
      console.error(c("red", "  Usage: complex config host <name> <set|alias|remove>"));
      process.exit(1);
    }
    if (!cfg.hosts[hname]) {
      console.error(c("red", `  No host "${hname}". Add it: complex config host add ${hname} <address>`));
      process.exit(1);
    }

    if (action === "remove") {
      const addr = cfg.hosts[hname].address;
      delete cfg.hosts[hname];
      // Clean up host aliases pointing to this host
      for (const [word, target] of Object.entries(cfg.host_aliases)) {
        if (target === hname) delete cfg.host_aliases[word];
      }
      if (cfg.default_host === hname) cfg.default_host = "local";
      saveConfig(cfg);
      console.log(c("green", `  Host "${hname}" (${addr}) removed.`));
      process.exit(0);
    }

    if (action === "alias") {
      const word = hrest[0];
      if (!word) {
        console.error(c("red", `  Usage: complex config host ${hname} alias <spoken-word>`));
        console.error(c("gray", `  Example: complex config host ${hname} alias minitwo`));
        process.exit(1);
      }
      cfg.host_aliases[word] = hname;
      saveConfig(cfg);
      console.log(c("green", `  Host alias saved: say "${word}" → connects to "${hname}"`));
      process.exit(0);
    }

    if (action === "set") {
      const [key, val] = hrest;
      if (!key || !val) {
        console.error(c("red", `  Usage: complex config host ${hname} set <connect|user> <value>`));
        process.exit(1);
      }
      if (key === "connect") {
        cfg.hosts[hname].connect = val;
        saveConfig(cfg);
        console.log(c("green", `  Host "${hname}" connect set to "${val}".`));
      } else if (key === "user") {
        cfg.hosts[hname].user = val;
        saveConfig(cfg);
        console.log(c("green", `  Host "${hname}" user set to "${val}".`));
      } else {
        console.error(c("red", `  Unknown key "${key}". Valid: connect, user`));
        process.exit(1);
      }
      process.exit(0);
    }

    console.error(c("red", `  Unknown host action "${action}". Try: set, alias, remove`));
    process.exit(1);
  }

  console.error(c("red", `  Unknown config subcommand "${sub}". Try: show, set, host, hosts, aliases`));
  process.exit(1);
}

// ── alias management ──────────────────────────────────────────────────────────
if (verb === "alias") {
  const [spoken, target] = rest;
  if (!spoken) {
    const entries = Object.entries(aliases);
    if (entries.length === 0) {
      console.log(c("gray", "  No session aliases. complex alias <spoken> <session-name>"));
    } else {
      console.log(c("cyan", c("bold", "  Session aliases")));
      for (const [sp, tgt] of entries.sort())
        console.log(`  ${c("yellow", sp.padEnd(16))} → ${c("white", tgt)}`);
    }
    process.exit(0);
  }
  if (!target) {
    console.error(c("red", "  Usage: complex alias <spoken-word> <session-name>"));
    process.exit(1);
  }
  aliases[spoken] = target;
  saveAliases(aliases);
  console.log(c("green", `  Session alias saved: "${spoken}" → "${target}"`));
  process.exit(0);
}

if (verb === "aliases") {
  const entries = Object.entries(aliases);
  if (entries.length === 0) {
    console.log(c("gray", "  No session aliases. complex alias <spoken> <session-name>"));
  } else {
    console.log(c("cyan", c("bold", "  Session aliases")));
    for (const [spoken, target] of entries.sort())
      console.log(`  ${c("yellow", spoken.padEnd(16))} → ${c("white", target)}`);
  }
  process.exit(0);
}

if (verb === "unalias") {
  const spoken = rest[0];
  if (!spoken) { console.error(c("red", "  Usage: complex unalias <spoken-word>")); process.exit(1); }
  if (!(spoken in aliases)) {
    console.error(c("yellow", `  No session alias "${spoken}" found.`));
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

// ── send keys ─────────────────────────────────────────────────────────────────
if (verb === "send") { tmux(["send-keys", ...rest]); process.exit(0); }

// ── attach ────────────────────────────────────────────────────────────────────
// Two forms:
//   complex attach <session>          → attach on default host (or local)
//   complex attach <host> <session>   → attach on specific host
if (verb === "attach") {
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
