# agentslip v0.1 — decisions, progress, blockers

## Name check (2026-10-28)

- npm `agentslip`: HTTP 404 (not in the registry)
- PyPI `agentslip`: HTTP 404
- GitHub search: only this private repo `EstebanIndiveri/agentslip`

## Docs fetched (2026-10-28)

- Claude Code hooks: https://code.claude.com/docs/en/hooks — Stop, Notification, PermissionRequest, SessionEnd input examples used as fixture sources.
- Codex hooks: https://learn.chatgpt.com/docs/hooks — Stop, PermissionRequest, SessionEnd. Docs state the transcript format is not a stable interface.
- receiptline 4.x: `receiptline.transform(doc, printer)` with `command: 'escpos' | 'svg'`, `cpl`, `cutting`. License Apache-2.0 (compatible as a dependency of this MIT project).

## Decisions

- Single Node 22 + TypeScript package, bin `agentslip`.
- Same ReceiptLine document → SVG and ESC/POS. Cut (`cutting: true` / GS V) only on ESC/POS.
- Default driver `virtual`. TCP printer timeout 800 ms. Hook hard timeout 1800 ms. Always exit 0.
- Tokens/cost never estimated; missing → `n/a`.
- Agent detection: documented discriminator fields first (`notification_type`, `turn_id`, `prompt_id`, …), then `transcript_path` (`.claude` vs `.codex`/`rollout`). Ambiguous SessionEnd tries Claude then Codex.
- `agentslip install` is dry-run unless `--write`; `--write` copies a dated `.bak` first.
- No GitHub Actions (owner choice). No Bluetooth/USB/CUPS in v0.1.
- No hardware printer in Cloud; README must say no model was verified.

## Blockers

- No physical ESC/POS printer in this environment. TCP tests use a local fake server only.
