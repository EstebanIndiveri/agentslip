#!/usr/bin/env bash
# Record a real GIF of agentslip test + the virtual roll.
# Requires: npm run build, Playwright Chromium, ffmpeg (or Python Pillow).
set -euo pipefail
cd "$(dirname "$0")/.."
exec node scripts/record-demo.mjs
