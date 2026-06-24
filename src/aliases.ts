// ── alias store (session aliases) ─────────────────────────────────────────────
// Maps spoken words to session names at ~/.config/complex/aliases.json.

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import { CONFIG_DIR, ALIAS_FILE } from "./config.ts";

export function loadAliases(): Record<string, string> {
  if (!existsSync(ALIAS_FILE)) return {};
  try { return JSON.parse(readFileSync(ALIAS_FILE, "utf8")); }
  catch { return {}; }
}

export function saveAliases(aliases: Record<string, string>) {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(ALIAS_FILE, JSON.stringify(aliases, null, 2) + "\n");
}
