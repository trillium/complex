// ── session model ─────────────────────────────────────────────────────────────
// The Session type and the three ways complex obtains/resolves sessions:
// local (via tmux), remote (always via ssh — mosh is interactive-only), and
// argument resolution (number, alias, exact, prefix, substring).

import { spawnSync } from "child_process";
import { tmux } from "./lib/tmux.ts";
import type { HostConfig } from "./config.ts";

export interface Session { index: number; name: string; windows: number; attached: boolean; }

export function getLocalSessions(): Session[] {
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

// Always SSH for listing (mosh is interactive-only). Uses configured connect
// command only when actually attaching.
export function getRemoteSessions(host: HostConfig): Session[] {
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

export function resolveSession(
  arg: string,
  sessions: Session[],
  aliases: Record<string, string> = {},
): Session | null {
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
