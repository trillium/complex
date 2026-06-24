// ── config ────────────────────────────────────────────────────────────────────
// Handles the `config` verb: show, set (connect|default), hosts, aliases, and
// the host sub-verb (add / alias / set / remove).

import { c } from "../lib/colors.ts";
import { saveConfig } from "../config.ts";
import { printConfig } from "../display.ts";
import { usageError } from "../help.ts";
import type { ComplexConfig } from "../config.ts";

function handleHostSub(crest: string[], cfg: ComplexConfig): never {
  const [nameOrAction, action, ...hrest] = crest;

  if (nameOrAction === "add") {
    const [hname, addr] = [action, hrest[0]];
    if (!hname || !addr) usageError("config", "config host add needs a name and an address");
    cfg.hosts[hname] = { address: addr };
    saveConfig(cfg);
    console.log(c("green", `  Host "${hname}" added → ${addr}  (connect: ${cfg.connect})`));
    process.exit(0);
  }

  const hname = nameOrAction;
  if (!hname) usageError("config", "config host needs a host name");
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
    if (!word) usageError("config", `config host ${hname} alias needs a spoken word`);
    cfg.host_aliases[word] = hname;
    saveConfig(cfg);
    console.log(c("green", `  Host alias saved: say "${word}" → connects to "${hname}"`));
    process.exit(0);
  }

  if (action === "set") {
    const [key, val] = hrest;
    if (!key || !val) usageError("config", `config host ${hname} set needs a key and a value`);
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

  usageError("config", `unknown host action "${action}" — try: set, alias, remove`);
}

export function handle(rest: string[], cfg: ComplexConfig): never {
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
    if (!key || !val) usageError("config", "config set needs a key and a value");
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

  if (sub === "host") handleHostSub(crest, cfg);

  usageError("config", `unknown config subcommand "${sub}" — try: show, set, host, hosts, aliases`);
}
