// ── fuzzy suggestions ─────────────────────────────────────────────────────────
// Levenshtein-based "did you mean?" suggestions for mistyped/misheard session
// names and aliases. Surfaced after a failed resolution.

import { c } from "./colors.ts";
import type { Session } from "../sessions.ts";

export function levenshtein(a: string, b: string): number {
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

export interface Suggestion { display: string; score: number; }

export function suggestSessions(
  arg: string,
  sessions: Session[],
  aliases: Record<string, string>,
): Suggestion[] {
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

export function printSuggestions(arg: string, sessions: Session[], aliases: Record<string, string>) {
  const sug = suggestSessions(arg, sessions, aliases);
  if (sug.length === 0) return;
  console.error(c("yellow", "  Did you mean:"));
  for (const s of sug) console.error(`    ${c("white", s.display)}`);
}
