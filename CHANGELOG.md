# Changelog

## 0.1.1 — 2026-10-28

- Redaction matches camelCase JSON keys (`apiKey`, `accessToken`, `clientSecret`) and glued uppercase names (`APIKEY`, `GITHUBTOKEN`, `DBPASSWORD`, `MYAPP_APIKEY`). Plain words `bypass`, `hotkey`, `monkey`, and `keyboard` are not redacted.
- Assignment redaction keeps the original `=` or `:` separator (for example `x-api-key: [redacted]`).
- `mysql -p` redaction also covers `mysqldump`, `mysqladmin`, and `mysqlimport`.
- `install --write` logs whether it wrote `.bak`, `.agentslip.bak`, or no backup. A foreign existing `.bak` is left in place; the current file is copied to `.agentslip.bak`.
- `.map` files are excluded from the npm pack tarball.
- Demo GIF uses a fixed repo name `demo-app`. The gh-pages SESSION sample is built from the small transcript fixture (not all `n/a`).

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
