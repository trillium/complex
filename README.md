# complex

Voice-friendly tmux wrapper. No hyphens required anywhere.

## Install

```sh
# Copy to your PATH
cp complex.ts ~/bin/complex
chmod +x ~/bin/complex
```

Requires [Bun](https://bun.sh).

## Usage

```
complex                         list sessions (numbered)
complex <number>                switch to session by number
complex <name>                  switch by name (fuzzy — no hyphens needed)
complex attach <number|name>    attach from outside tmux, or switch if inside

complex new <name>              create and switch to new session
complex kill <number|name>      kill a session
complex rename <name>           rename current window
complex detach                  detach current client

complex left / right / up / down   move between panes
complex next / prev                next / previous window
complex zoom                       toggle zoom on current pane

complex split                   split pane downward
complex split right             split pane to the right

complex alias <word> <session>  add alias (map spoken word → session name)
complex aliases                 list all aliases
complex unalias <word>          remove alias
```

Spoken numbers work: `complex one`, `complex two`, …, `complex twenty`.

## Aliases

Hard-to-say session names get speakable shortcuts:

```sh
complex alias chariot chrote-chat   # say "complex chariot" to switch
```

Aliases persist in `~/.config/complex/aliases.json`.
