# agentslip

Receipts for your coding agents: a paper slip when it's done, when it needs you, and what the session cost.

`agentslip hook` reads the JSON that Claude Code or Codex sends on stdin and prints a small ticket:

- **DONE** — Stop
- **NEEDS YOU** — Notification (Claude Code) or PermissionRequest
- **SESSION** — SessionEnd

Default output is a **virtual paper roll** (SVG in `~/.agentslip/slips/` plus a local viewer). A network ESC/POS printer is optional.

![Demo: agentslip test on the left, virtual roll on the right](docs/media/agentslip-demo.gif)

## 60-second try (virtual printer, no hardware)

Requires Node.js 22+.

```bash
npm install
npm run build
npm run demo          # three example tickets on the virtual roll
npm run viewer        # or: node dist/cli.js view
```

Open the URL printed by `view` / the Vite server. Newest slip is on top.

Test helpers used in this repo (not needed on your machine): `AGENTSLIP_HOME` redirects `~/.agentslip`.

## Install the hook (dry-run)

```bash
node dist/cli.js install --claude
node dist/cli.js install --codex
```

Nothing is written until you pass `--write`. That mode copies a dated backup next to the settings file, then merges the hook block.

Claude Code (`~/.claude/settings.json`):

```json
{
  "hooks": {
    "Stop": [{ "hooks": [{ "type": "command", "command": "agentslip hook", "timeout": 2 }] }],
    "Notification": [{ "hooks": [{ "type": "command", "command": "agentslip hook", "timeout": 2 }] }],
    "PermissionRequest": [{ "hooks": [{ "type": "command", "command": "agentslip hook", "timeout": 2 }] }],
    "SessionEnd": [{ "hooks": [{ "type": "command", "command": "agentslip hook", "timeout": 2 }] }]
  }
}
```

Codex (`~/.codex/hooks.json`):

```json
{
  "hooks": {
    "Stop": [{ "hooks": [{ "type": "command", "command": "agentslip hook", "timeout": 2 }] }],
    "PermissionRequest": [{ "hooks": [{ "type": "command", "command": "agentslip hook", "timeout": 2 }] }],
    "SessionEnd": [{ "hooks": [{ "type": "command", "command": "agentslip hook", "timeout": 2 }] }]
  }
}
```

The hook **always exits 0 in under two seconds**, even if the printer is down or the payload is invalid, so it does not block the agent. Codex Stop expects JSON on stdout; agentslip prints nothing on stdout (logs go to stderr / `~/.agentslip/agentslip.log`). If Codex warns about empty Stop output, that is harmless for printing; the process still exits 0.

## Network ESC/POS printer

`~/.agentslip/config.json` (TypeScript type: `AgentslipConfig` in `src/types.ts`):

```json
{
  "driver": "escpos-tcp",
  "widthMm": 58,
  "escpos": { "host": "192.168.1.50", "port": 9100 }
}
```

- `widthMm`: `58` (32 columns) or `80` (48 columns)
- `driver`: `virtual` (default), `escpos-tcp`, or `file` (raw `.bin`)
- Paper cut (`GS V`) is sent on ESC/POS only
- Bluetooth, USB, and CUPS are out of scope for v0.1

SVG and ESC/POS come from the **same** [ReceiptLine](https://github.com/receiptline/receiptline) document.

## Privacy

- No network except the printer host you configure on the LAN
- No telemetry, accounts, or cloud backend
- Secrets are redacted before render: API-key-shaped tokens, `*_KEY` / `*_TOKEN` / `*_SECRET` values, URLs with user:password, typical `.env` lines. Long lines are truncated.
- Default cap: 20 tickets per hour. Optional silent hours in `rateLimit.silentHours`.
- Tokens and cost print **only** when the session transcript actually contains them. Otherwise `n/a`. They are never estimated.

## What was checked / limitations

Checked in Cursor Cloud (no physical printer): parsers against fixtures copied from the official hook docs, redaction, SVG + ESC/POS snapshots (ESC `@` start, `GS V` end), a local TCP fake printer, hook exit 0 with the printer down and with invalid JSON, rate limit, `install` dry-run vs `--write` backup, Vitest, Playwright Chromium on the viewer.

**No hardware thermal printer model was verified.** Do not treat v0.1 as “works on TM-XX / RP-YY” until someone tests a real device.

Hook payload fields that are not in the vendor docs (including **transcript file format**) are marked best effort. See `fixtures/*/manifest.json` and `fixtures/transcripts/README.md`.

Out of scope: Bluetooth “cat printers”, USB, CUPS, non-ESC/POS printers, Cursor / Gemini CLI / opencode hooks, npm publish.

GitHub Actions is disabled on this repository. `docs/ci-example.yml` is an inactive example — do not place workflows under `.github/workflows/`.

## Adding an agent

See [docs/adding-an-agent.md](docs/adding-an-agent.md). Short version: one parser file in `src/hooks/`, fixtures + manifest with the doc URL, wire it in `src/hooks/parse.ts`. No plugin system.

## Contributing

1. Node 22+, `npm install`
2. Chromium for the viewer tests: `npx playwright install chromium` (Linux: `--with-deps` if needed)
3. `npm run typecheck` and `npm test`
4. Keep the hook non-blocking. Do not invent metrics, testimonials, or hardware claims.

Scripts: `npm run build`, `npm run typecheck`, `npm test`, `npm run viewer`, `npm run demo`.

Record the demo GIF: `bash scripts/record-demo.sh` (needs Playwright Chromium and `ffmpeg` or Python Pillow).

## Credits

- Ticket rendering: [receiptline](https://github.com/receiptline/receiptline) (Apache-2.0). `receiptline.transform()` builds both SVG and ESC/POS from one document.
- Hook payload shapes: [Claude Code hooks](https://code.claude.com/docs/en/hooks) and [Codex hooks](https://learn.chatgpt.com/docs/hooks) (read 2026-10-28).
