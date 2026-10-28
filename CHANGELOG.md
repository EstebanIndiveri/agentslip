# Changelog

## 0.1.0 — 2026-10-28

First release. Not published to npm (`private: true`).

- `agentslip hook` reads Claude Code and Codex hook JSON on stdin and prints a slip.
- Templates: DONE (Stop), NEEDS YOU (Notification / PermissionRequest), SESSION (SessionEnd).
- Drivers: virtual paper roll (SVG in `~/.agentslip/slips/`), ESC/POS over TCP, raw `.bin` file.
- The hook always exits 0 in under two seconds and writes `{}` to stdout for every agent and event.
- Secrets are redacted before render. Cap of 20 tickets per hour; optional silent hours.
- Tokens and cost print only when the session transcript contains them; otherwise `n/a`. Never estimated. A transcript larger than 256 KB prints `n/a` for duration, turns, tools, tokens, and cost.
- `agentslip install` / `uninstall` for Claude Code and Codex (dry-run unless `--write`). The stored hook command is quoted; uninstall matches only that command. An existing `.bak` that already contains agentslip is not overwritten.
- Notification `idle_prompt` after a recent Stop for the same session is not printed twice.
- `agentslip test` and `agentslip view` for the virtual roll.
- `prepare` builds `dist/` so a git install or `npm link` can put `agentslip` on PATH.
- No hardware thermal printer model was verified.
- Bluetooth, USB, CUPS, Cursor / Gemini CLI / opencode hooks, and npm publish are out of scope.
