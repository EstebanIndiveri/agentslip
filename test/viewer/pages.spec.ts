import { execFileSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * Real GitHub Pages output: `npm run build && node scripts/build-pages.mjs <tmpdir>`,
 * served with Node's http module (no Vite). Mutation: drop `.slip img` from
 * viewer/src/style.css and this file must fail (the regex CSS test is not enough).
 */

const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
] as const;

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".xml": "application/xml",
};

let pagesDir = "";
let origin = "";
let server: http.Server | undefined;

function serveStatic(dir: string): Promise<{ server: http.Server; origin: string }> {
  const root = path.resolve(dir);
  const httpServer = http.createServer((req, res) => {
    let rel = "/index.html";
    try {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      rel = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
    } catch {
      res.writeHead(400);
      res.end("bad URL");
      return;
    }
    const abs = path.normalize(path.join(root, rel));
    if (abs !== root && !abs.startsWith(root + path.sep)) {
      res.writeHead(400);
      res.end("bad path");
      return;
    }
    fs.readFile(abs, (err, body) => {
      if (err) {
        res.writeHead(404);
        res.end("not found");
        return;
      }
      res.writeHead(200, { "content-type": MIME[path.extname(abs)] || "application/octet-stream" });
      res.end(body);
    });
  });
  return new Promise((resolve, reject) => {
    httpServer.on("error", reject);
    httpServer.listen(0, "127.0.0.1", () => {
      const address = httpServer.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({ server: httpServer, origin: `http://127.0.0.1:${port}` });
    });
  });
}

function buildPages(): string {
  const cwd = process.cwd();
  const cli = path.join(cwd, "dist/cli.js");
  if (!fs.existsSync(cli)) {
    execFileSync("npm", ["run", "build"], { cwd, stdio: "inherit" });
  }
  const dest = fs.mkdtempSync(path.join(os.tmpdir(), "agentslip-pages-e2e-"));
  execFileSync(process.execPath, [path.join(cwd, "scripts/build-pages.mjs"), dest], {
    cwd,
    stdio: "inherit",
  });
  return dest;
}

test.beforeAll(async () => {
  pagesDir = buildPages();
  const html = fs.readFileSync(path.join(pagesDir, "index.html"), "utf8");
  if (!html.includes('<img src="./slips/')) {
    throw new Error("pages builder did not emit <img src=\"./slips/\">");
  }
  ({ server, origin } = await serveStatic(pagesDir));
});

test.afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    if (!server) {
      resolve();
      return;
    }
    server.close((err) => (err ? reject(err) : resolve()));
  });
  if (pagesDir) fs.rmSync(pagesDir, { recursive: true, force: true });
});

async function reportViewport(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.goto(`${origin}/`);
  await expect(page.locator(".slip img")).toHaveCount(3, { timeout: 10_000 });
  await page.waitForFunction(() =>
    [...document.querySelectorAll(".slip img")].every(
      (el) => el instanceof HTMLImageElement && el.complete && el.naturalWidth > 0,
    ),
  );
  return page.evaluate(async () => {
    const overflowX = Math.max(
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
      document.body.scrollWidth - document.body.clientWidth,
    );
    const slips = [];
    for (const slip of document.querySelectorAll(".slip")) {
      const img = slip.querySelector("img");
      const sr = slip.getBoundingClientRect();
      const ir = img?.getBoundingClientRect();
      let vbW = 0;
      let vbH = 0;
      const src = img?.getAttribute("src");
      if (src) {
        const svgText = await fetch(src).then((r) => r.text());
        const m = svgText.match(/viewBox="0 0 ([0-9.]+) ([0-9.]+)"/);
        vbW = m ? Number(m[1]) : 0;
        vbH = m ? Number(m[2]) : 0;
      }
      slips.push({
        hasImg: Boolean(img),
        slipW: sr.width,
        imgW: ir?.width ?? 0,
        imgH: ir?.height ?? 0,
        inside: Boolean(ir && ir.left >= sr.left - 1 && ir.right <= sr.right + 1 && ir.top >= sr.top - 1),
        overflowRight: ir ? ir.right - sr.right : Infinity,
        vbW,
        vbH,
      });
    }
    return { overflowX, slips };
  });
}

test("static Pages slips stay on the paper at 320, 390 and 1280", async ({ page }) => {
  for (const { width, height } of VIEWPORTS) {
    const report = await reportViewport(page, width, height);
    expect(report.overflowX, `horizontal overflow at ${width}x${height}`).toBeLessThanOrEqual(1);
    expect(report.slips).toHaveLength(3);
    for (const slip of report.slips) {
      expect(slip.hasImg, `.slip img missing at ${width}x${height}`).toBe(true);
      expect(slip.inside, `.slip img escaped its .slip at ${width}x${height}`).toBe(true);
      expect(slip.overflowRight, `img overflowRight at ${width}x${height}`).toBeLessThanOrEqual(1);
      expect(slip.vbW, `viewBox width at ${width}x${height}`).toBeGreaterThan(0);
      expect(slip.vbH, `viewBox height at ${width}x${height}`).toBeGreaterThan(0);
      const expectedH = (slip.imgW * slip.vbH) / slip.vbW;
      expect(
        Math.abs(slip.imgH - expectedH),
        `img aspect ${slip.imgW}x${slip.imgH} vs viewBox ${slip.vbW}x${slip.vbH} at ${width}x${height}`,
      ).toBeLessThanOrEqual(1.5);
      if (width === 1280) {
        expect(slip.imgW, `native 384px SVG at ${width}x${height}`).toBeGreaterThanOrEqual(383);
        expect(slip.imgW, `native 384px SVG at ${width}x${height}`).toBeLessThanOrEqual(385);
      }
    }
  }
});
