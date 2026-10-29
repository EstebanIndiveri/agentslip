#!/usr/bin/env node
/**
 * Build a static virtual-roll preview (3 example slips, relative paths, .nojekyll).
 * SESSION uses the small transcript fixture so duration/turns/tools/tokens are real.
 * Output: pages/  (not committed on the main branch; pushed as orphan gh-pages)
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dest = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, "pages");
const cli = path.join(root, "dist/cli.js");
if (!fs.existsSync(cli)) {
  console.error("dist/cli.js missing; run npm run build first");
  process.exit(1);
}

const home = fs.mkdtempSync(path.join(os.tmpdir(), "agentslip-pages-"));
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
    console.error(r.stderr || r.stdout);
    process.exit(r.status || 1);
  }
}

hook("fixtures/claude-code/stop.json");
hook("fixtures/claude-code/permission-request.json");
hook("fixtures/claude-code/session-end.json", {
  transcript_path: path.join(root, "fixtures/transcripts/claude-session.jsonl"),
});

const srcSlips = path.join(home, "slips");
const svgs = fs.readdirSync(srcSlips).filter((f) => f.endsWith(".svg")).sort();
if (svgs.length < 3) {
  console.error("expected 3 example slips, got", svgs);
  process.exit(1);
}

const ALT = {
  done: "DONE slip: repo demo-app, branch main, 1 file changed, 3 insertions",
  "needs-you": "NEEDS YOU slip: the agent is asking permission to run a command",
  session: "SESSION slip: duration, turns, tool calls and token counts from a sample transcript",
};

fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(path.join(dest, "slips"), { recursive: true });
for (const f of svgs) {
  fs.copyFileSync(path.join(srcSlips, f), path.join(dest, "slips", f));
}
const newestFirst = [...svgs].reverse();
const cards = newestFirst
  .map((f) => {
    const kind = f.includes("needs-you") ? "needs-you" : f.includes("session") ? "session" : "done";
    return `<article class="slip"><img src="./slips/${f}" alt="${ALT[kind]}"/><div class="meta"><span>${kind}</span><span>example</span></div></article>`;
  })
  .join("\n");

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>agentslip — thermal receipts for Claude Code and Codex</title>
  <meta name="description" content="agentslip: Claude Code and Codex hooks that print a thermal ESC/POS slip when the agent is done, needs your permission, or ends a session — or show it on a virtual paper roll. Static preview with three example slips. MIT."/>
  <link rel="canonical" href="https://estebanindiveri.github.io/agentslip/"/>
  <meta property="og:type" content="website"/>
  <meta property="og:site_name" content="agentslip"/>
  <meta property="og:title" content="agentslip — Claude Code &amp; Codex hooks that print thermal receipts"/>
  <meta property="og:description" content="Claude Code and Codex hooks that print a paper slip (DONE / NEEDS YOU / SESSION) on a network ESC/POS printer or a virtual roll in the browser."/>
  <meta property="og:url" content="https://estebanindiveri.github.io/agentslip/"/>
  <meta property="og:image" content="https://estebanindiveri.github.io/agentslip/social-preview.png"/>
  <meta property="og:image:width" content="1280"/>
  <meta property="og:image:height" content="640"/>
  <meta property="og:image:alt" content="Three agentslip receipts: DONE, NEEDS YOU and SESSION"/>
  <meta name="twitter:card" content="summary_large_image"/>
  <meta name="twitter:title" content="agentslip — Claude Code &amp; Codex hooks that print thermal receipts"/>
  <meta name="twitter:description" content="Claude Code and Codex hooks that print a paper slip, or show it on a virtual roll. No printer required."/>
  <meta name="twitter:image" content="https://estebanindiveri.github.io/agentslip/social-preview.png"/>
  <link rel="stylesheet" href="./style.css"/>
</head>
<body>
  <header class="top">
    <h1>agentslip — receipts for your coding agents</h1>
    <p class="tag">Claude Code and Codex hooks that print a slip when the agent is done, needs you, or ends a session. This is a static preview of the virtual paper roll: three example slips, newest on top.</p>
    <p class="help">Live roll: install from the repo and run <code>agentslip view</code>. Source, install steps and printer notes: <a href="https://github.com/EstebanIndiveri/agentslip">github.com/EstebanIndiveri/agentslip</a>.</p>
  </header>
  <div class="printer" aria-hidden="true"><div class="slot"></div></div>
  <main class="roll">${cards}</main>
</body>
</html>
`;

fs.writeFileSync(path.join(dest, "index.html"), html);
fs.copyFileSync(path.join(root, "viewer/src/style.css"), path.join(dest, "style.css"));
fs.copyFileSync(path.join(root, "docs/media/social-preview.png"), path.join(dest, "social-preview.png"));
fs.writeFileSync(
  path.join(dest, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://estebanindiveri.github.io/agentslip/</loc></url>
</urlset>
`,
);
fs.writeFileSync(path.join(dest, ".nojekyll"), "");
fs.writeFileSync(
  path.join(dest, "slips/index.json"),
  `${JSON.stringify(
    newestFirst.map((f, i) => ({ file: f, kind: f.includes("needs-you") ? "needs-you" : f.includes("session") ? "session" : "done", ticketNo: 3 - i })),
    null,
    2,
  )}\n`,
);
fs.rmSync(home, { recursive: true, force: true });
console.log(`wrote ${dest} (${svgs.length} slips)`);
