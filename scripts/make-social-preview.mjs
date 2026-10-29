#!/usr/bin/env node
/**
 * Render docs/media/social-preview.png at exactly 1280×640 and
 * docs/media/social-preview-1080.png at 1080×1080.
 * DONE / NEEDS YOU from 58 mm SVG snapshots. SESSION from the small
 * transcript fixture (duration, turns, tools, tokens; cost stays n/a),
 * same as Pages. No vendor logos.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const snaps = path.join(root, "test/__snapshots__");
const outWide = path.join(root, "docs/media/social-preview.png");
const outSquare = path.join(root, "docs/media/social-preview-1080.png");
const cli = path.join(root, "dist/cli.js");
if (!fs.existsSync(cli)) {
  console.error("dist/cli.js missing; run npm run build first");
  process.exit(1);
}

function dataUriFromSvg(svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function snapshotSvg(file) {
  return fs.readFileSync(path.join(snaps, file), "utf8");
}

function generateSessionSvg() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "agentslip-social-"));
  const env = {
    ...process.env,
    AGENTSLIP_HOME: home,
    AGENTSLIP_NOW: "2026-10-27T15:00:00.000Z",
    TZ: "UTC",
  };
  const payload = JSON.parse(
    fs.readFileSync(path.join(root, "fixtures/claude-code/session-end.json"), "utf8"),
  );
  payload.transcript_path = path.join(root, "fixtures/transcripts/claude-session.jsonl");
  const r = spawnSync(process.execPath, [cli, "hook"], {
    cwd: root,
    env,
    input: JSON.stringify(payload),
    encoding: "utf8",
  });
  if (r.status !== 0) {
    fs.rmSync(home, { recursive: true, force: true });
    console.error(r.stderr || r.stdout);
    process.exit(r.status || 1);
  }
  const slips = path.join(home, "slips");
  const file = fs.readdirSync(slips).find((f) => f.includes("-session-") && f.endsWith(".svg"));
  if (!file) {
    fs.rmSync(home, { recursive: true, force: true });
    console.error("expected a SESSION svg under", slips);
    process.exit(1);
  }
  const svg = fs.readFileSync(path.join(slips, file), "utf8");
  fs.rmSync(home, { recursive: true, force: true });
  const text = svg.replace(/<[^>]+>/g, "").replace(/&#xa0;/g, " ");
  if (!text.includes("2600") || !text.includes("300") || !/4m/.test(text)) {
    console.error("SESSION svg missing transcript-fixture totals (2600 in / 300 out, 4m)");
    process.exit(1);
  }
  return svg;
}

const doneUri = dataUriFromSvg(snapshotSvg("done-58.svg"));
const needsUri = dataUriFromSvg(snapshotSvg("needs-you-58.svg"));
const sessionUri = dataUriFromSvg(generateSessionSvg());

function htmlFor({ width, height, cardWidth, cardMaxHeight, pad, gap, h1, tag, foot, rowAlign }) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>
  html, body { margin: 0; width: ${width}px; height: ${height}px; background: #1c1c1c; color: #f3f0e7;
    font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; }
  .frame { box-sizing: border-box; width: ${width}px; height: ${height}px; padding: ${pad};
    display: flex; flex-direction: column; }
  .head { flex: 0 0 auto; }
  h1 { margin: 0; font-size: ${h1}px; font-weight: 700; letter-spacing: 0.04em; line-height: 1.1; }
  .tag { margin: 8px 0 0; font-size: ${tag}px; color: #cfc8b8; line-height: 1.3; }
  .row { flex: 1 1 auto; display: flex; align-items: ${rowAlign}; justify-content: center;
    min-height: 0; margin-top: 18px; }
  .group { display: flex; gap: ${gap}px; align-items: flex-start; justify-content: center; }
  .card { background: #fff6df; padding: 6px 6px 8px; box-shadow: 0 8px 24px #0008;
    width: ${cardWidth}px; max-height: ${cardMaxHeight}px; overflow: hidden; }
  .card img { display: block; width: 100%; height: auto; }
  .foot { flex: 0 0 auto; margin-top: 12px; font-size: ${foot}px; color: #b7b09f; letter-spacing: 0.02em;
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
      <div class="group">
        <div class="card"><img alt="DONE slip: repo demo-app, branch main, 1 file changed, 3 insertions" src="${doneUri}"/></div>
        <div class="card"><img alt="NEEDS YOU slip: the agent is asking permission to run a command" src="${needsUri}"/></div>
        <div class="card"><img alt="SESSION slip: duration, turns, tool calls and token counts from a sample transcript" src="${sessionUri}"/></div>
      </div>
    </div>
    <p class="foot">Claude Code · Codex hooks → ESC/POS thermal printer or virtual roll · MIT</p>
  </div>
</body>
</html>`;
}

async function shot(out, spec) {
  const browser = await chromium.launch({ args: ["--disable-dev-shm-usage"] });
  const page = await browser.newPage({
    viewport: { width: spec.width, height: spec.height },
    deviceScaleFactor: 1,
  });
  await page.setContent(htmlFor(spec), { waitUntil: "load" });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await page.screenshot({ path: out, type: "png" });
  await browser.close();
  const st = fs.statSync(out);
  if (st.size >= 1024 * 1024) {
    console.error(`social preview too large: ${out} ${st.size} bytes`);
    process.exit(1);
  }
  console.log(`wrote ${out} ${st.size} bytes`);
}

await shot(outWide, {
  width: 1280,
  height: 640,
  cardWidth: 270,
  cardMaxHeight: 430,
  pad: "24px 40px 20px",
  gap: 22,
  h1: 40,
  tag: 20,
  foot: 14,
  rowAlign: "flex-start",
});
await shot(outSquare, {
  width: 1080,
  height: 1080,
  cardWidth: 310,
  cardMaxHeight: 780,
  pad: "56px 36px 40px",
  gap: 24,
  h1: 52,
  tag: 24,
  foot: 16,
  rowAlign: "center",
});
