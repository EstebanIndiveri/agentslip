#!/usr/bin/env node
/**
 * Record docs/media/agentslip-demo.gif
 * Left: a terminal running `agentslip test`
 * Right: the virtual paper roll receiving slips
 *
 * No vendor mascots or logos. Real tickets from the local virtual driver.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const outGif = path.join(root, "docs/media/agentslip-demo.gif");
const frameDir = fs.mkdtempSync(path.join(os.tmpdir(), "agentslip-gif-"));
const home = fs.mkdtempSync(path.join(os.tmpdir(), "agentslip-demo-"));
const port = 4188;

function runCli(args, extra = {}) {
  const dist = path.join(root, "dist/cli.js");
  const cmd = fs.existsSync(dist)
    ? [process.execPath, dist, ...args]
    : [process.execPath, path.join(root, "node_modules/tsx/dist/cli.mjs"), "src/cli.ts", ...args];
  return spawnSync(cmd[0], cmd.slice(1), {
    cwd: root,
    env: {
      ...process.env,
      AGENTSLIP_HOME: home,
      AGENTSLIP_GIT_REPO: "demo-app",
      AGENTSLIP_GIT_BRANCH: "main",
      AGENTSLIP_GIT_SHORTSTAT: "1 file changed, 3 insertions(+)",
      TZ: "UTC",
      ...extra.env,
    },
    encoding: "utf8",
  });
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  fs.mkdirSync(path.dirname(outGif), { recursive: true });
  const viewer = spawn(
    process.execPath,
    [
      fs.existsSync(path.join(root, "dist/cli.js"))
        ? path.join(root, "dist/cli.js")
        : path.join(root, "node_modules/tsx/dist/cli.mjs"),
      ...(fs.existsSync(path.join(root, "dist/cli.js")) ? [] : ["src/cli.ts"]),
      "view",
      "--port",
      String(port),
      "--no-open",
    ],
    {
      cwd: root,
      env: { ...process.env, AGENTSLIP_HOME: home },
      stdio: "pipe",
    },
  );

  await wait(1200);

  const browser = await chromium.launch({ args: ["--disable-dev-shm-usage"] });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const terminalLog = [];
  await page.setContent(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>
  html,body{margin:0;height:100%;background:#111;color:#d6d6d6;font-family:ui-monospace,Menlo,Consolas,monospace}
  .row{display:flex;height:100%}
  .pane{width:50%;height:100%;overflow:hidden}
  .term{padding:16px;white-space:pre-wrap;font-size:13px;line-height:1.45}
  .prompt{color:#9cdcfe}
  iframe{border:0;width:100%;height:100%;background:#2a2a2a}
</style>
</head>
<body>
  <div class="row">
    <div class="pane term" id="term"></div>
    <div class="pane"><iframe id="roll" src="http://127.0.0.1:${port}/"></iframe></div>
  </div>
</body>
</html>`);

  async function paintTerm() {
    const html = terminalLog
      .map((l) => l.replace(/&/g, "&amp;").replace(/</g, "&lt;"))
      .join("\n");
    await page.evaluate((t) => {
      document.getElementById("term").textContent = t;
    }, terminalLog.join("\n"));
    void html;
  }

  async function shot(i) {
    await page.screenshot({ path: path.join(frameDir, `frame-${String(i).padStart(2, "0")}.png`) });
  }

  terminalLog.push("$ agentslip test");
  await paintTerm();
  await shot(0);
  await wait(400);

  const examples = ["DONE (Stop)", "NEEDS YOU (PermissionRequest)", "SESSION (SessionEnd)"];
  let frame = 1;
  for (const label of examples) {
    terminalLog.push(`printing ${label}…`);
    await paintTerm();
    const r = runCli(["test"]);
    // test prints all three at once; for the GIF, print once then stop duplicating.
    if (label !== "DONE (Stop)") {
      /* already printed */
    }
    terminalLog.push((r.stderr || "").trim().split("\n").slice(-1)[0] || "ok");
    await paintTerm();
    await wait(700);
    await shot(frame++);
    break;
  }

  // Re-run is wasteful; instead generate sequentially with hook payloads.
  fs.rmSync(path.join(home, "slips"), { recursive: true, force: true });
  terminalLog.length = 0;
  terminalLog.push("$ agentslip test");
  await paintTerm();
  await page.locator("#roll").evaluate((el) => {
    el.src = el.src;
  });
  await shot(1);

  const fixtures = [
    { file: "fixtures/claude-code/stop.json", label: "Stop → DONE" },
    { file: "fixtures/claude-code/permission-request.json", label: "PermissionRequest → NEEDS YOU" },
    { file: "fixtures/claude-code/session-end.json", label: "SessionEnd → SESSION" },
  ];
  let n = 2;
  for (const fx of fixtures) {
    terminalLog.push(`$ agentslip hook   # ${fx.label}`);
    await paintTerm();
    const payload = fs.readFileSync(path.join(root, fx.file), "utf8");
    const dist = path.join(root, "dist/cli.js");
    const args = fs.existsSync(dist)
      ? [dist, "hook"]
      : [path.join(root, "node_modules/tsx/dist/cli.mjs"), "src/cli.ts", "hook"];
    const child = spawnSync(process.execPath, args, {
      cwd: root,
      input: payload,
      env: {
        ...process.env,
        AGENTSLIP_HOME: home,
        AGENTSLIP_GIT_REPO: "demo-app",
        AGENTSLIP_GIT_BRANCH: "main",
        AGENTSLIP_GIT_SHORTSTAT: "1 file changed, 3 insertions(+)",
        TZ: "UTC",
      },
      encoding: "utf8",
    });
    terminalLog.push((child.stderr || "ok").trim().split("\n").slice(-1)[0]);
    await paintTerm();
    await wait(800);
    await shot(n++);
  }

  await browser.close();
  viewer.kill("SIGTERM");

  encodeGif(frameDir, outGif);
  fs.rmSync(frameDir, { recursive: true, force: true });
  fs.rmSync(home, { recursive: true, force: true });
  console.log(`wrote ${outGif}`);
}

function encodeGif(frames, dest) {
  const ffmpeg = spawnSync(
    "ffmpeg",
    [
      "-y",
      "-framerate",
      "4",
      "-i",
      path.join(frames, "frame-%02d.png"),
      "-vf",
      "scale=960:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse",
      dest,
    ],
    { encoding: "utf8" },
  );
  if (ffmpeg.status === 0 && fs.existsSync(dest)) return;
  const py = spawnSync(
    "python3",
    [
      "-c",
      `
from pathlib import Path
from PIL import Image
import sys
d = Path(sys.argv[1])
frames = sorted(d.glob("frame-*.png"))
imgs = [Image.open(f).convert("P", palette=Image.ADAPTIVE) for f in frames]
imgs[0].save(sys.argv[2], save_all=True, append_images=imgs[1:], duration=280, loop=0, optimize=True)
`,
      frames,
      dest,
    ],
    { encoding: "utf8" },
  );
  if (py.status !== 0) {
    console.error(ffmpeg.stderr || "");
    console.error(py.stderr || py.stdout || "");
    throw new Error("Could not encode GIF (need ffmpeg or Python Pillow)");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
