#!/usr/bin/env node
/**
 * Record docs/media/agentslip-demo.gif (~15 s).
 * Left: the real compiled hook command in a real temp git repo.
 * Right: virtual roll. DONE then NEEDS YOU. No vendor logos.
 * Does not run Claude Code or Codex; the terminal shows the command that ran.
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
const gitParent = fs.mkdtempSync(path.join(os.tmpdir(), "agentslip-gif-repo-"));
const gitRepo = path.join(gitParent, "demo-app");
fs.mkdirSync(gitRepo);
const port = 4188;
const dist = path.join(root, "dist/cli.js");
if (!fs.existsSync(dist)) {
  console.error("dist/cli.js missing; run npm run build first");
  process.exit(1);
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function sh(cmd, cwd = gitRepo) {
  const r = spawnSync("bash", ["-lc", cmd], { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`${cmd}\n${r.stderr || r.stdout}`);
  return (r.stdout || "").trim();
}

function env() {
  return {
    ...process.env,
    AGENTSLIP_HOME: home,
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

function initGitRepo() {
  sh("git init -b fix/parser");
  sh("git config user.email demo@agentslip.example");
  sh("git config user.name agentslip-demo");
  fs.writeFileSync(path.join(gitRepo, "README.md"), "demo-app\n");
  sh("git add README.md && git commit -m init");
  fs.writeFileSync(
    path.join(gitRepo, "parser.js"),
    "export function parse(x) {\n  return String(x).trim();\n}\n",
  );
  fs.appendFileSync(path.join(gitRepo, "README.md"), "uncommitted note\n");
}

function hookPayload(event) {
  const base = {
    session_id: "demo-session",
    transcript_path: path.join(gitRepo, "no-such-transcript.jsonl"),
    cwd: gitRepo,
    permission_mode: "default",
    hook_event_name: event,
  };
  if (event === "Stop") {
    return {
      ...base,
      stop_hook_active: false,
      last_assistant_message:
        "I've completed the refactoring. Parser now trims input before parsing.",
    };
  }
  return {
    ...base,
    tool_name: "Bash",
    tool_input: {
      command: "rm -rf node_modules",
      description: "Remove node_modules directory",
    },
  };
}

function runHook(payload) {
  return spawnSync(process.execPath, [dist, "hook"], {
    cwd: gitRepo,
    input: JSON.stringify(payload),
    env: env(),
    encoding: "utf8",
  });
}

async function main() {
  initGitRepo();
  const shortstat = sh("git diff --shortstat");
  const branch = sh("git rev-parse --abbrev-ref HEAD");
  const repoName = path.basename(gitRepo);

  fs.mkdirSync(path.dirname(outGif), { recursive: true });
  const viewer = spawn(process.execPath, [dist, "view", "--port", String(port), "--no-open"], {
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
  .term{padding:14px;white-space:pre-wrap;font-size:12px;line-height:1.4;background:#0d1117}
  iframe{border:0;width:100%;height:100%;background:#2a2a2a}
  .ok{color:#7ee787}
  .dim{color:#8b949e}
</style>
</head>
<body>
  <div class="row">
    <div class="pane term" id="term"></div>
    <div class="pane"><iframe id="roll" src="http://127.0.0.1:${port}/"></iframe></div>
  </div>
</body>
</html>`);

  const lines = [];
  const paint = async () => {
    await page.evaluate((t) => {
      document.getElementById("term").textContent = t;
    }, lines.join("\n"));
  };
  const frames = [];
  const shot = async () => {
    const i = frames.length;
    const p = path.join(frameDir, `frame-${String(i).padStart(3, "0")}.png`);
    await page.screenshot({ path: p });
    frames.push(p);
  };

  async function hold(n) {
    for (let i = 0; i < n; i++) {
      await wait(200);
      await shot();
    }
  }

  lines.push(`$ git -C ${gitRepo} rev-parse --abbrev-ref HEAD`);
  lines.push(branch);
  lines.push(`$ git -C ${gitRepo} diff --shortstat`);
  lines.push(` ${shortstat}`);
  lines.push(`$ node dist/cli.js hook   # compiled binary; cwd=${repoName}`);
  await paint();
  await hold(8);

  const stop = hookPayload("Stop");
  const stopRes = runHook(stop);
  lines.push((stopRes.stderr || "").trim().split("\n").pop());
  lines.push((stopRes.stdout || "").trim() || "{}");
  await paint();
  await page.locator("#roll").evaluate((el) => {
    el.src = el.src.split("?")[0] + "?t=" + Date.now();
  });
  await hold(28);

  lines.push(`$ node dist/cli.js hook   # PermissionRequest → NEEDS YOU`);
  await paint();
  const need = hookPayload("PermissionRequest");
  const needRes = runHook(need);
  lines.push((needRes.stderr || "").trim().split("\n").pop());
  lines.push((needRes.stdout || "").trim() || "{}");
  await paint();
  await page.locator("#roll").evaluate((el) => {
    el.src = el.src.split("?")[0] + "?t=" + Date.now();
  });
  await hold(32);
  lines.push("$");
  await paint();
  await hold(6);

  await browser.close();
  viewer.kill("SIGTERM");
  encodeGif(frameDir, outGif);
  const st = fs.statSync(outGif);
  fs.rmSync(frameDir, { recursive: true, force: true });
  fs.rmSync(home, { recursive: true, force: true });
  fs.rmSync(gitParent, { recursive: true, force: true });
  console.log(`wrote ${outGif} (${st.size} bytes, ${frames.length} frames)`);
  if (st.size >= 2 * 1024 * 1024) {
    console.error("GIF is over 2 MB");
    process.exit(1);
  }
}

function encodeGif(frames, dest) {
  const candidates = ["ffmpeg", path.join(os.homedir(), ".cache/ms-playwright/ffmpeg-1013/ffmpeg-linux")];
  for (const bin of candidates) {
    const r = spawnSync(
      bin,
      [
        "-y",
        "-framerate",
        "5",
        "-i",
        path.join(frames, "frame-%03d.png"),
        "-vf",
        "scale=960:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=64[p];[s1][p]paletteuse=dither=bayer",
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
imgs = [Image.open(f).convert("P", palette=Image.ADAPTIVE, colors=64) for f in frames]
imgs[0].save(sys.argv[2], save_all=True, append_images=imgs[1:], duration=200, loop=0, optimize=True)`,
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
