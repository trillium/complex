// ── ANSI ──────────────────────────────────────────────────────────────────────
// Color constants and the c() helper used throughout complex for terminal output.

export const C = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  cyan: "\x1b[36m", yellow: "\x1b[33m", green: "\x1b[32m",
  red: "\x1b[31m", white: "\x1b[97m", gray: "\x1b[90m",
  magenta: "\x1b[35m",
};

export const c = (col: keyof typeof C, s: string): string => `${C[col]}${s}${C.reset}`;
