// ── tmux helpers ──────────────────────────────────────────────────────────────
// Thin wrappers over the local tmux binary. tmux() exits the process on failure
// unless { silent: true }; tmuxOk() reports success without exiting.

import { spawnSync } from "child_process";
import { c } from "./colors.ts";

export function tmux(args: string[], opts: { silent?: boolean } = {}): string {
  const r = spawnSync("tmux", args, { encoding: "utf8" });
  if (r.status !== 0 && !opts.silent) {
    const msg = (r.stderr || "").trim() || r.error?.message || "unknown error";
    console.error(c("red", `tmux: ${msg}`));
    process.exit(1);
  }
  return (r.stdout || "").trim();
}

export function tmuxOk(...args: string[]): boolean {
  return spawnSync("tmux", args, { encoding: "utf8" }).status === 0;
}
