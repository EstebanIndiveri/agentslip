# agentslip — notes for coding agents

## Environment

- Node.js 22 LTS or newer.
- `npm install`
- Chromium for Playwright: `npx playwright install chromium` (add `--with-deps` on Linux if browsers fail to launch).
- GitHub Actions is **not** used. Do not add files under `.github/workflows/`. An inactive example lives at `docs/ci-example.yml`.

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

- Hook command always exits 0 in under 2 seconds (printer down and invalid JSON included).
- Tokens/cost print `n/a` unless the transcript actually contains them. Never estimate.
- Transcript parsing is best effort; see `fixtures/transcripts/README.md`.
- Mutation checks (run by hand, then revert):
  1. Set `REDACTION_ENABLED` in `src/redact.ts` to `false` → redaction tests fail.
  2. Set `ESPOS_CUT` in `src/slips/document.ts` to `false` → ESC/POS snapshots fail.

## Adding an agent

One parser in `src/hooks/` plus JSON fixtures and a manifest (source URL, verified vs assumed fields). Wire it in `src/hooks/parse.ts`. See README.
