// ── config store ──────────────────────────────────────────────────────────────
// Persistent connection/host configuration at ~/.config/complex/config.json.
// Path constants are exported so the alias store can share the same directory.

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

export const CONFIG_DIR  = join(process.env.HOME!, ".config", "complex");
export const ALIAS_FILE  = join(CONFIG_DIR, "aliases.json");
export const CONFIG_FILE = join(CONFIG_DIR, "config.json");

export interface HostConfig {
  address: string;
  user?: string;
  connect?: string; // overrides global connect for this host
}

export interface ComplexConfig {
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

export function loadConfig(): ComplexConfig {
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

export function saveConfig(cfg: ComplexConfig) {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2) + "\n");
}
