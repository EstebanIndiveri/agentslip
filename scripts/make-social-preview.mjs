#!/usr/bin/env node
/**
 * Render docs/media/social-preview.png at exactly 1280×640.
 * Uses the real 58 mm SVG snapshots. No vendor logos.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "docs/media/social-preview.png");
const snaps = path.join(root, "test/__snapshots__");

function dataUri(file) {
  const svg = fs.readFileSync(path.join(snaps, file), "utf8");
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>
  html, body { margin: 0; width: 1280px; height: 640px; background: #1c1c1c; color: #f3f0e7;
    font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; }
  .frame { box-sizing: border-box; width: 1280px; height: 640px; padding: 24px 40px 20px;
    display: flex; flex-direction: column; }
  .head { flex: 0 0 auto; }
  h1 { margin: 0; font-size: 40px; font-weight: 700; letter-spacing: 0.04em; line-height: 1.1; }
  .tag { margin: 8px 0 0; font-size: 20px; color: #cfc8b8; line-height: 1.3; }
  .row { flex: 1 1 auto; display: flex; gap: 22px; align-items: flex-start; justify-content: center;
    min-height: 0; margin-top: 18px; }
  .card { background: #fff6df; padding: 6px 6px 8px; box-shadow: 0 8px 24px #0008;
    width: 270px; max-height: 430px; overflow: hidden; }
  .card img { display: block; width: 100%; height: auto; }
  .foot { flex: 0 0 auto; margin-top: 12px; font-size: 14px; color: #b7b09f; letter-spacing: 0.02em;
    text-align: center; }
</style>
</head>
<body>
  <div class="frame">
    <div class="head">
      <h1>agentslip</h1>
      <p class="tag">Receipts for your coding agents</p>
    </div>
    <div class="row">
      <div class="card"><img alt="DONE" src="${dataUri("done-58.svg")}"/></div>
      <div class="card"><img alt="NEEDS YOU" src="${dataUri("needs-you-58.svg")}"/></div>
      <div class="card"><img alt="SESSION" src="${dataUri("session-58.svg")}"/></div>
    </div>
    <p class="foot">Claude Code · Codex hooks → ESC/POS thermal printer or virtual roll · MIT</p>
  </div>
</body>
</html>`;

const browser = await chromium.launch({ args: ["--disable-dev-shm-usage"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 640 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: "load" });
fs.mkdirSync(path.dirname(out), { recursive: true });
await page.screenshot({ path: out, type: "png" });
await browser.close();
const st = fs.statSync(out);
if (st.size >= 1024 * 1024) {
  console.error(`social preview too large: ${st.size} bytes`);
  process.exit(1);
}
console.log(`wrote ${out} ${st.size} bytes`);
