#!/usr/bin/env node
/**
 * Build a static virtual-roll preview (3 example slips, relative paths, .nojekyll).
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
const r = spawnSync(process.execPath, [cli, "test"], {
  cwd: root,
  env: {
    ...process.env,
    AGENTSLIP_HOME: home,
    AGENTSLIP_GIT_REPO: "demo-app",
    AGENTSLIP_GIT_BRANCH: "main",
    AGENTSLIP_GIT_SHORTSTAT: "1 file changed, 3 insertions(+)",
    AGENTSLIP_NOW: "2026-10-27T15:00:00.000Z",
    TZ: "UTC",
  },
  encoding: "utf8",
});
if (r.status !== 0) {
  console.error(r.stderr || r.stdout);
  process.exit(r.status || 1);
}

const srcSlips = path.join(home, "slips");
const svgs = fs.readdirSync(srcSlips).filter((f) => f.endsWith(".svg")).sort();
if (svgs.length < 3) {
  console.error("expected 3 example slips, got", svgs);
  process.exit(1);
}

fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(path.join(dest, "slips"), { recursive: true });
for (const f of svgs) {
  fs.copyFileSync(path.join(srcSlips, f), path.join(dest, "slips", f));
}
const newestFirst = [...svgs].reverse();
const cards = newestFirst
  .map((f) => {
    const kind = f.includes("needs-you") ? "needs-you" : f.includes("session") ? "session" : "done";
    return `<article class="slip"><img src="./slips/${f}" alt="${kind} slip"/><div class="meta"><span>${kind}</span><span>example</span></div></article>`;
  })
  .join("\n");

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>agentslip — virtual roll</title>
  <link rel="stylesheet" href="./style.css"/>
</head>
<body>
  <header class="top">
    <h1>agentslip</h1>
    <p class="tag">Static preview of the virtual paper roll. Three example slips. Newest on top.</p>
    <p class="help">This page is a snapshot. Clone the repo and run <code>agentslip view</code> for a live roll.</p>
  </header>
  <div class="printer" aria-hidden="true"><div class="slot"></div></div>
  <main class="roll">${cards}</main>
</body>
</html>
`;

fs.writeFileSync(path.join(dest, "index.html"), html);
fs.copyFileSync(path.join(root, "viewer/src/style.css"), path.join(dest, "style.css"));
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
