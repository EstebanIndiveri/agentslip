#!/usr/bin/env node
/**
 * Render docs/media/social-preview.png at exactly 1280×640 and
 * docs/media/social-preview-1080.png at 1080×1080.
 * All three tickets come from the same fixtures as Pages, in one
 * AGENTSLIP_HOME, at widthMm 80 (48 columns) so the SESSION token row
 * does not split "out". Ticket numbers are #0001, #0002, #0003.
 * No vendor logos.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
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

function plainText(svg) {
  return svg.replace(/<[^>]+>/g, "").replace(/&#xa0;/g, " ");
}

function generateSlips() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "agentslip-social-"));
  fs.writeFileSync(path.join(home, "config.json"), `${JSON.stringify({ widthMm: 80 }, null, 2)}\n`);
  const env = {
    ...process.env,
    AGENTSLIP_HOME: home,
    AGENTSLIP_GIT_REPO: "demo-app",
    AGENTSLIP_GIT_BRANCH: "main",
    AGENTSLIP_GIT_SHORTSTAT: "1 file changed, 3 insertions(+)",
    AGENTSLIP_NOW: "2026-10-27T15:00:00.000Z",
    TZ: "UTC",
  };

  function hook(relFixture, patch = {}) {
    const payload = JSON.parse(fs.readFileSync(path.join(root, relFixture), "utf8"));
    Object.assign(payload, patch);
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
  }

  hook("fixtures/claude-code/stop.json");
  hook("fixtures/claude-code/permission-request.json");
  hook("fixtures/claude-code/session-end.json", {
    transcript_path: path.join(root, "fixtures/transcripts/claude-session.jsonl"),
  });

  const slipsDir = path.join(home, "slips");
  const files = fs.readdirSync(slipsDir).filter((f) => f.endsWith(".svg")).sort();
  const byKind = {
    done: files.find((f) => f.startsWith("0001-done-")),
    "needs-you": files.find((f) => f.startsWith("0002-needs-you-")),
    session: files.find((f) => f.startsWith("0003-session-")),
  };
  if (!byKind.done || !byKind["needs-you"] || !byKind.session) {
    fs.rmSync(home, { recursive: true, force: true });
    console.error("expected 0001-done, 0002-needs-you, 0003-session; got", files);
    process.exit(1);
  }

  const svgs = {
    done: fs.readFileSync(path.join(slipsDir, byKind.done), "utf8"),
    "needs-you": fs.readFileSync(path.join(slipsDir, byKind["needs-you"]), "utf8"),
    session: fs.readFileSync(path.join(slipsDir, byKind.session), "utf8"),
  };
  fs.rmSync(home, { recursive: true, force: true });

  const sessionText = plainText(svgs.session);
  if (!sessionText.includes("2600 in / 300 out") || !/4m/.test(sessionText)) {
    console.error("SESSION svg missing intact fixture totals (2600 in / 300 out, 4m)");
    process.exit(1);
  }
  return svgs;
}

const slips = generateSlips();
const doneUri = dataUriFromSvg(slips.done);
const needsUri = dataUriFromSvg(slips["needs-you"]);
const sessionUri = dataUriFromSvg(slips.session);

function htmlFor({
  width,
  height,
  cardWidth,
  cardMaxHeight,
  pad,
  gap,
  h1,
  tag,
  foot,
  rowAlign,
  rowMargin,
  frameJustify,
  rowFlex,
}) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>
  html, body { margin: 0; width: ${width}px; height: ${height}px; background: #1c1c1c; color: #f3f0e7;
    font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; }
  .frame { box-sizing: border-box; width: ${width}px; height: ${height}px; padding: ${pad};
    display: flex; flex-direction: column; justify-content: ${frameJustify}; }
  .head { flex: 0 0 auto; }
  h1 { margin: 0; font-size: ${h1}px; font-weight: 700; letter-spacing: 0.04em; line-height: 1.1; }
  .tag { margin: 8px 0 0; font-size: ${tag}px; color: #cfc8b8; line-height: 1.3; }
  .row { flex: ${rowFlex}; display: flex; align-items: ${rowAlign}; justify-content: center;
    min-height: 0; margin-top: ${rowMargin}px; }
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
  cardWidth: 360,
  cardMaxHeight: 500,
  pad: "20px 32px 16px",
  gap: 16,
  h1: 40,
  tag: 20,
  foot: 14,
  rowAlign: "flex-start",
  rowMargin: 16,
  frameJustify: "flex-start",
  rowFlex: "1 1 auto",
});
await shot(outSquare, {
  width: 1080,
  height: 1080,
  cardWidth: 348,
  cardMaxHeight: 640,
  pad: "28px 10px 24px",
  gap: 8,
  h1: 44,
  tag: 20,
  foot: 16,
  rowAlign: "flex-start",
  rowMargin: 18,
  frameJustify: "flex-start",
  rowFlex: "1 1 auto",
});
