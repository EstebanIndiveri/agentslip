# agentslip — notes for coding agents

## Environment

- Node.js 22 LTS or newer.
- `npm ci` (runs `prepare` → `npm run build`)
- Chromium for Playwright: `npx playwright install chromium` (add `--with-deps` on Linux if browsers fail to launch).
- GitHub Actions is **not** used. Do not add files under `.github/workflows/`. Issue forms under `.github/ISSUE_TEMPLATE/` are allowed. An inactive example lives at `docs/ci-example.yml`.

## Commands

```bash
npm run build
npm run typecheck
npm test                 # build + Vitest + Playwright (Chromium)
npm run test:unit        # Vitest only
npm run viewer           # Vite dev server for the virtual roll
npm run demo             # print three example tickets (needs build)
```

Data directory: `~/.agentslip/` (override with `AGENTSLIP_HOME` in tests).

## Tests that must stay honest

- Hook command always exits 0 in under 2 seconds (printer down, invalid JSON, never-closing stdin, FIFO transcript included).
- Tokens/cost print `n/a` unless the transcript actually contains them. Never estimate.
- Transcript parsing is best effort; see `fixtures/transcripts/README.md`. Files over 256 KB must print `n/a` for duration/turns/tools/tokens/cost (do not treat the tail as the total).
- Mutation checks (run by hand, then revert):
  1. Set `REDACTION_ENABLED` in `src/redact.ts` to `false` → redaction tests fail.
  2. Set `ESPOS_CUT` in `src/slips/document.ts` to `false` → ESC/POS snapshots fail (missing GS V / GS r 1).
  3. Set `defaultConfig().redaction.enabled` to `false` in `src/config.ts` → leak tests fail.
  4. Set `STDIN_MS` in `src/commands/hook.ts` to `60000` → never-closing-stdin e2e fails.
  5. Read a FIFO with `readFileSync` (no `isFile` guard) in `src/transcript.ts` → FIFO test fails.
  6. Let `install --write` overwrite invalid JSON → invalid-JSON install test fails.
  7. Drop `r()` on `data.branch` in `src/slips/document.ts` → branch document-string leak test fails.
  8. Remove `writeJsonAndExit()` from the hard-timeout path in `src/commands/hook.ts` → hard-timeout e2e fails.
  9. Drop camelCase / glued-uppercase branches from `isSecretName` in `src/redact.ts` → camelCase and glued assignment leak tests fail.
  10. Make `ASSIGN_HEAD` consume the value for non-secret names (old `([^\s,;]+)` match, return full match) → `Bash: DB_PASS=` / `I ran: APIKEY=` hook tests fail.
  11. Drop `GENERIC_KEY_NAMES` / glued-prefix checks so `primaryKey`, `token: string;`, JSX `key=`, `{"key":"Enter"}`, and `TURKEY=` are treated as secrets → false-positive tests fail.
  12. Remove the `NODE_ENV === "test"` guard around `AGENTSLIP_HOOK_HANG_MS` → the hang-ignored e2e fails.
  13. Remove `REDACT_MAX_CHARS` truncation / `clipField` in `src/redact.ts` → the length-cap test fails.
  14. Call `takeValue` before the name check in `redactAssignments` → `redact("a=".repeat(4352))` exceeds 50 ms.
  15. Unbound the `{0,256}` / `{1,256}` quantifiers in CRED_URL, eyJ, and ASSIGN_HEAD → uncapped `eyJ-`.repeat(25000) / 100 KB regex tests fail.
  16. Skip `redactDeep` in `toolDetail` → Write escaped-JSON leak tests fail.
  17. Hard-slice the scan window (no whitespace cut before redacting) → filled boundary-straddle tests fail.
  18. Drop the `redactDeep` character budget → adversarial MultiEdit (`"a-".repeat(4096)` / `"eyJ-".repeat(2048)`) exceeds 500 ms, or more than ~12 KB is fed to `redact`.
  19. Drop the `redactDeep` depth guard → 10k-nest test throws.
  20. JSON_STRING `\\?` (single escape) → Bash double-escaped JSON test fails.
  21. Drop the NEEDS YOU line cap in `src/slips/document.ts` → more than 8 request content lines print.
  22. `clipField` hard-cut (keep the window when there is no whitespace) → 9 KB no-space token is not `"…"`.
  23. Drop the `budget.used` guard in `walkDeep` → `RawPastBudget99` appears raw.
  24. Drop `JSON_STRING_UNCLOSED` → unclosed `{"apiKey":"…` / `{'password': 'a b …` and space-in-value filled-straddle tests fail.

## Adding an agent

One parser in `src/hooks/` plus JSON fixtures and a manifest (source URL, verified vs assumed fields). Wire it in `src/hooks/parse.ts`. See README.
