# agentslip v0.1 — decisions, progress, blockers

## Name check (2026-10-28)

- npm `agentslip`: HTTP 404 (not in the registry)
- PyPI `agentslip`: HTTP 404
- GitHub search: only this private repo `EstebanIndiveri/agentslip`

## Docs fetched (2026-10-28)

- Claude Code hooks: https://code.claude.com/docs/en/hooks — Stop, Notification, PermissionRequest, SessionEnd input examples used as fixture sources.
- Codex hooks: https://learn.chatgpt.com/docs/hooks — Stop, PermissionRequest, SessionEnd. Docs state the transcript format is not a stable interface.
- receiptline **4.0.4**, license **Apache-2.0**. API: `receiptline.transform(doc, { cpl, encoding, command: 'escpos'|'svg', cutting })`. ESC/POS starts with ESC @ (`1b40`) and cut is GS V then GS r 1 (`1d5642001d7231`) when `cutting: true`.

## Decisions

- Single Node 22 + TypeScript package, bin `agentslip`.
- Same ReceiptLine document → SVG and ESC/POS. Cut (`cutting: true` / GS V then GS r 1) only on ESC/POS.
- SVG is sanitized: Google Fonts `@import` stripped; system monospace only.
- Default driver `virtual`. File driver defaults to `~/.agentslip/agentslip.bin`. TCP printer timeout 800 ms. Hook `STDIN_MS=900`, `HARD_MS=STDIN_MS+900`. Always exit 0. Stdout `{}` so Codex Stop has JSON. `process.stdin.destroy()` on finish.
- Transcript: `statSync` + `isFile()` first, last 256 KB, async read with 200 ms timeout.
- Tokens/cost never estimated; missing → `n/a`.
- Agent detection: documented discriminator fields first (`notification_type`, `turn_id`, `prompt_id`, …), then `transcript_path` (`.claude` vs `.codex`/`rollout`). Ambiguous SessionEnd tries Claude then Codex.
- `agentslip install` is dry-run unless `--write`; `--write` copies a single `${file}.bak` (overwritten). Invalid JSON aborts. `agentslip uninstall` removes only agentslip hook entries.
- Notification matcher `idle_prompt|agent_needs_input` so PermissionRequest does not double-print.
- Install command is `node <absolute dist/cli.js> hook` when invoked that way; otherwise `agentslip hook` (after `npm link`).
- No GitHub Actions (owner choice). No Bluetooth/USB/CUPS in v0.1.
- No hardware printer in Cloud; README says no model was verified.

## Tests actually run in Cloud (review-fix, 2026-10-28)

Branch `cursor/agentslip-v0.1-4fa6`. See git log for HEAD.

- `npm ci` — pass
- `npm run build` — pass
- `npm run typecheck` — pass
- `npm test` — Vitest 68 passed + Playwright Chromium 2 passed
- `npm audit` — 0 vulnerabilities after vitest 4.1.12
- Compiled hook e2e: never-closing stdin, FIFO transcript, large transcript — pass
- Clean HOME: `npm ci`/`build` already done; `npm link` to a user prefix (`NPM_CONFIG_PREFIX`) — `agentslip hook` exit 0, stdout `{}`; `node dist/cli.js install --claude --write` stores `/exec-daemon/node /workspace/dist/cli.js hook`. System-prefix `npm link` was EACCES (`/usr/lib/node_modules`).
- Mutations (then reverted):
  1. `defaultConfig().redaction.enabled=false` → leak tests fail (2)
  2. `STDIN_MS=60000` → never-closing stdin e2e fail (exit null after 4s killer)
  3. `readFileSync` on FIFO, no `isFile` → FIFO test hang/timeout (8s)
  4. install overwrite on invalid JSON → `invalid JSON aborts without overwrite` fail
  5. `REDACTION_ENABLED=false` → 15/15 redact tests fail
  6. `ESPOS_CUT=false` → 7 tests fail (cut sequence + snapshots)
- Demo GIF unchanged (no visual change): `docs/media/agentslip-demo.gif`

## SEO / pre-launch batch (2026-10-28)

- `prepare` + `files` (`dist`, `viewer/dist`). `npm pack` then `npm install -g` of the tarball and `npm link` both put `agentslip` on PATH; `agentslip test` exit 0 in a temp HOME.
- `npm install -g github:EstebanIndiveri/agentslip` **not tested** (repo is private).
- README: audit H1 + first paragraph; stdout `{}` for every event; tested hardware none; Why not Bluetooth (v0.2); How it was built.
- Issue forms: printer-report, agent-request, config.yml. No workflows.
- CHANGELOG.md 0.1.0 from implemented facts.
- Social preview: `docs/media/social-preview.png` 1280×640, 108383 bytes.
- GIF re-recorded: `docs/media/agentslip-demo.gif` 960×540, 14.8 s, 208982 bytes, compiled `node dist/cli.js hook` in a real temp git repo (`fix/parser`, `1 file changed, 1 insertion(+)`), DONE then NEEDS YOU.
- Orphan `gh-pages` `ae237ce212e28cc9d7e613f551293cb45a0cd621`: `.nojekyll`, `index.html`, `style.css`, 3 example SVGs. Pages **not** enabled.
- Re-run: npm ci (prepare builds), typecheck, test 68+2, audit 0. All six mutations failed then reverted.

## Blockers

- No physical ESC/POS printer. TCP tests use a local fake server only.
