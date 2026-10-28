#!/usr/bin/env node
/**
 * Record docs/media/agentslip-demo.gif
 * Left: a terminal running agentslip hook
 * Right: the virtual paper roll receiving slips
 * No vendor mascots or logos.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const outGif = path.join(root, "docs/media/agentslip-demo.gif");
const frameDir = fs.mkdtempSync(path.join(os.tmpdir(), "agentslip-gif-"));
const home = fs.mkdtempSync(path.join(os.tmpdir(), "agentslip-demo-"));
const port = 4188;

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function cliArgs(sub) {
  const dist = path.join(root, "dist/cli.js");
  if (fs.existsSync(dist)) return [dist, ...sub];
  return [path.join(root, "node_modules/tsx/dist/cli.mjs"), "src/cli.ts", ...sub];
}

function env() {
  return {
    ...process.env,
    AGENTSLIP_HOME: home,
    AGENTSLIP_GIT_REPO: "demo-app",
    AGENTSLIP_GIT_BRANCH: "main",
    AGENTSLIP_GIT_SHORTSTAT: "1 file changed, 3 insertions(+)",
    TZ: "UTC",
  };
}

function waitHttp(url, timeoutMs = 8000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => {
        if (Date.now() - start > timeoutMs) reject(new Error("viewer did not start"));
        else setTimeout(tick, 150);
      });
    };
    tick();
  });
}

async function main() {
  fs.mkdirSync(path.dirname(outGif), { recursive: true });
  const viewer = spawn(process.execPath, cliArgs(["view", "--port", String(port), "--no-open"]), {
    cwd: root,
    env: env(),
    stdio: "pipe",
  });
  await waitHttp(`http://127.0.0.1:${port}/`);

  const browser = await chromium.launch({ args: ["--disable-dev-shm-usage"] });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  await page.setContent(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>
  html,body{margin:0;height:100%;background:#111;color:#d6d6d6;font-family:ui-monospace,Menlo,Consolas,monospace}
  .row{display:flex;height:100%}
  .pane{width:50%;height:100%;overflow:hidden}
  .term{padding:16px;white-space:pre-wrap;font-size:13px;line-height:1.45;background:#0d1117}
  iframe{border:0;width:100%;height:100%;background:#2a2a2a}
  .ok{color:#7ee787}
</style>
</head>
<body>
  <div class="row">
    <div class="pane term" id="term"></div>
    <div class="pane"><iframe id="roll" src="http://127.0.0.1:${port}/"></iframe></div>
  </div>
</body>
</html>`);

  const lines = ["$ agentslip test"];
  const paint = async () => {
    await page.evaluate((t) => {
      document.getElementById("term").textContent = t;
    }, lines.join("\n"));
  };
  const shot = (i) => page.screenshot({ path: path.join(frameDir, `frame-${String(i).padStart(2, "0")}.png`) });

  await paint();
  await shot(0);

  const fixtures = [
    { file: "fixtures/claude-code/stop.json", label: "Stop → DONE" },
    { file: "fixtures/claude-code/permission-request.json", label: "PermissionRequest → NEEDS YOU" },
    { file: "fixtures/claude-code/session-end.json", label: "SessionEnd → SESSION" },
  ];
  let n = 1;
  for (const fx of fixtures) {
    lines.push(`$ agentslip hook    # ${fx.label}`);
    await paint();
    const payload = fs.readFileSync(path.join(root, fx.file));
    const child = spawnSync(process.execPath, cliArgs(["hook"]), {
      cwd: root,
      input: payload,
      env: env(),
      encoding: "utf8",
    });
    const last = (child.stderr || "ok").trim().split("\n").pop();
    lines.push(last);
    await paint();
    await page.locator("#roll").evaluate((el) => {
      const f = el;
      f.src = f.src.split("?")[0] + "?t=" + Date.now();
    });
    await wait(1600);
    await shot(n++);
  }
  lines.push("$");
  await paint();
  await wait(800);
  await shot(n);

  await browser.close();
  viewer.kill("SIGTERM");
  encodeGif(frameDir, outGif);
  fs.rmSync(frameDir, { recursive: true, force: true });
  fs.rmSync(home, { recursive: true, force: true });
  console.log(`wrote ${outGif} (${fs.statSync(outGif).size} bytes)`);
}

function encodeGif(frames, dest) {
  const candidates = ["ffmpeg", path.join(os.homedir(), ".cache/ms-playwright/ffmpeg-1013/ffmpeg-linux")];
  for (const bin of candidates) {
    const r = spawnSync(
      bin,
      [
        "-y",
        "-framerate",
        "1/3",
        "-i",
        path.join(frames, "frame-%02d.png"),
        "-vf",
        "scale=960:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse",
        dest,
      ],
      { encoding: "utf8" },
    );
    if (r.status === 0 && fs.existsSync(dest)) return;
  }
  const py = spawnSync(
    "python3",
    [
      "-c",
      `from pathlib import Path
from PIL import Image
import sys
d = Path(sys.argv[1])
frames = sorted(d.glob("frame-*.png"))
imgs = [Image.open(f).convert("P", palette=Image.ADAPTIVE) for f in frames]
imgs[0].save(sys.argv[2], save_all=True, append_images=imgs[1:], duration=320, loop=0, optimize=True)`,
      frames,
      dest,
    ],
    { encoding: "utf8" },
  );
  if (py.status !== 0) {
    throw new Error(`GIF encode failed: ${py.stderr || py.stdout}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
