# agentslip v0.1 — decisions, progress, blockers

## Name check (2026-10-28)

- npm `agentslip`: HTTP 404 (not in the registry)
- PyPI `agentslip`: HTTP 404
- GitHub search: only this private repo `EstebanIndiveri/agentslip`

## Docs fetched (2026-10-28)

- Claude Code hooks: https://code.claude.com/docs/en/hooks — Stop, Notification, PermissionRequest, SessionEnd input examples used as fixture sources.
- Codex hooks: https://learn.chatgpt.com/docs/hooks — Stop, PermissionRequest, SessionEnd. Docs state the transcript format is not a stable interface.
- receiptline **4.0.4**, license **Apache-2.0**. API: `receiptline.transform(doc, { cpl, encoding, command: 'escpos'|'svg', cutting })`. ESC/POS starts with ESC @ (`1b40`) and ends with GS V when `cutting: true`.

## Decisions

- Single Node 22 + TypeScript package, bin `agentslip`.
- Same ReceiptLine document → SVG and ESC/POS. Cut (`cutting: true` / GS V) only on ESC/POS.
- SVG is sanitized: Google Fonts `@import` stripped; system monospace only.
- Default driver `virtual`. TCP printer timeout 800 ms. Hook hard timeout 1800 ms. Always exit 0. Stdout `{}` so Codex Stop has JSON.
- Tokens/cost never estimated; missing → `n/a`.
- Agent detection: documented discriminator fields first (`notification_type`, `turn_id`, `prompt_id`, …), then `transcript_path` (`.claude` vs `.codex`/`rollout`). Ambiguous SessionEnd tries Claude then Codex.
- `agentslip install` is dry-run unless `--write`; `--write` copies a dated `.bak` first.
- No GitHub Actions (owner choice). No Bluetooth/USB/CUPS in v0.1.
- No hardware printer in Cloud; README says no model was verified.

## Tests actually run in Cloud (2026-10-28)

- `npm run build` — pass
- `npm run typecheck` — pass
- `npm test` — Vitest 43 passed + Playwright Chromium 2 passed
- Mutations (then reverted):
  1. `REDACTION_ENABLED=false` → `src/redact.test.ts` 3 failed / 1 passed, exit 1
  2. `ESPOS_CUT=false` → 6 snapshot tests failed on missing GS V, exit 1
- Demo GIF: `node scripts/record-demo.mjs` → `docs/media/agentslip-demo.gif` (GIF89a 960×540, 15.0 s)

## Blockers

- No physical ESC/POS printer. TCP tests use a local fake server only.
