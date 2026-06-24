// ── list & config display ─────────────────────────────────────────────────────
// Rendering for the session list, the window list, and the config dump.

import { c } from "./lib/colors.ts";
import { tmux } from "./lib/tmux.ts";
import type { Session } from "./sessions.ts";
import type { ComplexConfig } from "./config.ts";

export function printSessions(
  sessions: Session[],
  aliases: Record<string, string> = {},
  hostLabel?: string, // shown in header when browsing a remote host
) {
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

export function printWindows() {
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

export function printConfig(cfg: ComplexConfig) {
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
