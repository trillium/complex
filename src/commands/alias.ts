// ── alias management ──────────────────────────────────────────────────────────
// Handles the alias / aliases / unalias verbs (session aliases: spoken word →
// session name). Dispatches on verb and exits the process.

import { c } from "../lib/colors.ts";
import { saveAliases } from "../aliases.ts";
import { usageError } from "../help.ts";

function listAliases(aliases: Record<string, string>): never {
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

export function handle(verb: string, rest: string[], aliases: Record<string, string>): never {
  if (verb === "aliases") listAliases(aliases);

  if (verb === "unalias") {
    const spoken = rest[0];
    if (!spoken) usageError("unalias", "unalias needs a spoken word");
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

  // verb === "alias"
  const [spoken, target] = rest;
  if (!spoken) listAliases(aliases);
  if (!target) usageError("alias", "alias needs both a spoken word and a session name");
  aliases[spoken] = target;
  saveAliases(aliases);
  console.log(c("green", `  Session alias saved: "${spoken}" → "${target}"`));
  process.exit(0);
}
