# Changelog

## 0.1.1 — 2026-10-28

- Assignment redaction does not consume the value when the name is not a secret, so `Bash: DB_PASS=`, `I ran: APIKEY=`, and `aws_secret_access_key =` are redacted. The name is checked before scanning the value so `a:a:a:…` is not O(n²).
- Each field is scanned 512 characters past the 8 KB cap. The scan window is cut at the last whitespace **before** redacting (no whitespace → `…`), so a split `ghp_`, JSON value, or credential URL cannot remain after earlier `[redacted]` replacements shrink the text. A 9 KB token with no spaces becomes `…`. An unclosed JSON or Python-dict value at the end of the field (`{"apiKey":"…`, `{"password": "correct horse…`, `{'password': 'a b …`) is redacted when the name is a secret, so a clip inside a quoted string cannot leak a fragment. Regex quantifiers stay bounded even without the cap (`eyJ-` repeated 25 000 times and other 100 KB attacks finish in a few milliseconds). The name is checked before `takeValue` so `a=.repeat(4352)` stays under 50 ms.
- `redactDeep` on hook `tool_input` has a 12 KB total character budget and a depth limit of 32. Values past the budget are `…` (not raw). A 300-edit MultiEdit of adversarial `a-` / `eyJ-` strings or a 10k-nested object still prints a slip in under 2 s.
- NEEDS YOU request bodies are capped at 8 wrapped content lines plus `… (+N lines)`.
- Write `tool_input` string values are redacted before `JSON.stringify`, and JSON key matching accepts backslashes before quotes, so `{\"apiKey\":\"…\"}` (including double-escaped JSON inside a Bash command) does not leak after a second stringify.
- Redaction matches camelCase JSON keys (`apiKey`, `accessToken`, `clientSecret`, `stripeKey`, `masterKey`), glued names (`APIKEY`, `apikey`, `GITHUBTOKEN`, `DBPASSWORD`, `MYAPP_APIKEY`, `DBPASS`, `ADMINPASSWORD`, `SLACKTOKEN`), query strings (`?apikey=`, `&githubtoken=`), `MYSQL_PWD=`, escaped JSON, Python dicts, numeric JSON, quoted values with spaces, `--token=` / `--api-key`, and `--password=`.
- Bare `key` / `token` with a short identifier stay visible; a long unprefixed value under `key=` / `token=` is redacted.
- `mysql -p` redaction also covers `mysqldump`, `mysqladmin`, and `mysqlimport`, and does not eat `-port` on a later command.
- `install --write` logs whether it wrote `.bak`, `.agentslip.bak`, or no backup. A foreign existing `.bak` is left in place; the current file is copied to `.agentslip.bak` only when that file does not already contain agentslip.
- `agentslip --version` prints the version from `package.json`. The build wipe of `dist/` uses `fs.rmSync` so it works on Windows.
- Compiled JS is emitted without `sourceMappingURL`. `.map` files are excluded from the npm pack tarball.
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
