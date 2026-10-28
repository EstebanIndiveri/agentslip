import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

function bin(): { cmd: string; args: string[] } {
  const dist = path.join(process.cwd(), "dist", "cli.js");
  if (fs.existsSync(dist)) return { cmd: process.execPath, args: [dist] };
  const tsx = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
  return { cmd: process.execPath, args: [tsx, "src/cli.ts"] };
}

function fixture(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

function runHook(
  input: string,
  extraEnv: NodeJS.ProcessEnv = {},
): Promise<{ stdout: string; stderr: string; code: number | null; ms: number; home: string }> {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "agentslip-e2e-"));
  const { cmd, args } = bin();
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, [...args, "hook"], {
      env: {
        ...process.env,
        AGENTSLIP_HOME: extraEnv.AGENTSLIP_HOME || home,
        AGENTSLIP_GIT_REPO: "demo-app",
        AGENTSLIP_GIT_BRANCH: "main",
        AGENTSLIP_GIT_SHORTSTAT: "1 file changed, 3 insertions(+)",
        AGENTSLIP_NOW: "2026-10-27T15:00:00.000Z",
        TZ: "UTC",
        ...extraEnv,
      },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout += String(d);
    });
    child.stderr.on("data", (d) => {
      stderr += String(d);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ stdout, stderr, code, ms: Date.now() - started, home: extraEnv.AGENTSLIP_HOME || home });
    });
    child.stdin.write(input);
    child.stdin.end();
  });
}

describe("compiled binary e2e", () => {
  const homes: string[] = [];

  afterEach(() => {
    for (const h of homes.splice(0)) fs.rmSync(h, { recursive: true, force: true });
  });

  beforeAll(() => {
    const dist = path.join(process.cwd(), "dist", "cli.js");
    if (!fs.existsSync(dist)) {
      console.warn("dist/cli.js missing; e2e uses tsx. Run npm run build for the compiled binary.");
    }
  });

  const files = [
    "fixtures/claude-code/stop.json",
    "fixtures/claude-code/notification.json",
    "fixtures/claude-code/permission-request.json",
    "fixtures/claude-code/session-end.json",
    "fixtures/codex/stop.json",
    "fixtures/codex/permission-request.json",
    "fixtures/codex/session-end.json",
  ];

  for (const file of files) {
    it(`hook ${file} exits 0 under 2s and writes an SVG`, async () => {
      const result = await runHook(fixture(file));
      homes.push(result.home);
      expect(result.code).toBe(0);
      expect(result.ms).toBeLessThan(2000);
      const slips = path.join(result.home, "slips");
      const svgs = fs.existsSync(slips) ? fs.readdirSync(slips).filter((f) => f.endsWith(".svg")) : [];
      expect(svgs.length).toBeGreaterThan(0);
      expect(result.stderr).toMatch(/agentslip:/);
    });
  }

  it("invalid JSON exits 0 under 2s", async () => {
    const result = await runHook("{not json");
    homes.push(result.home);
    expect(result.code).toBe(0);
    expect(result.ms).toBeLessThan(2000);
    const slips = path.join(result.home, "slips");
    const svgs = fs.existsSync(slips) ? fs.readdirSync(slips).filter((f) => f.endsWith(".svg")) : [];
    expect(svgs.length).toBe(0);
    const log = fs.readFileSync(path.join(result.home, "agentslip.log"), "utf8");
    expect(log).toMatch(/invalid JSON/);
  });

  it("printer down exits 0 under 2s", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "agentslip-e2e-"));
    homes.push(home);
    fs.mkdirSync(home, { recursive: true });
    fs.writeFileSync(
      path.join(home, "config.json"),
      JSON.stringify({
        driver: "escpos-tcp",
        widthMm: 58,
        escpos: { host: "127.0.0.1", port: 1 },
        rateLimit: { maxPerHour: 20 },
        qr: { enabled: false },
        redaction: { enabled: true },
      }),
    );
    const result = await runHook(fixture("fixtures/claude-code/stop.json"), { AGENTSLIP_HOME: home });
    expect(result.code).toBe(0);
    expect(result.ms).toBeLessThan(2000);
    expect(result.stderr).toMatch(/printer error|ECONNREFUSED|timeout/i);
  });
});
