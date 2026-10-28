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

## Tests actually run in Cloud (2026-10-28)

See the PR / §12 report for the post-review-fix run (HEAD after this branch). Earlier d00f2d9 run: Vitest 43 + Playwright 2, GIF 15.0 s.

## Blockers

- No physical ESC/POS printer. TCP tests use a local fake server only.
