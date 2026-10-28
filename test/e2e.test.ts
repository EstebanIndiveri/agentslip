import { execFileSync, spawn, spawnSync } from "node:child_process";
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

function runHookOpenStdin(
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
    const killer = setTimeout(() => {
      child.kill("SIGKILL");
    }, 4000);
    child.on("close", (code) => {
      clearTimeout(killer);
      resolve({
        stdout,
        stderr,
        code,
        ms: Date.now() - started,
        home: extraEnv.AGENTSLIP_HOME || home,
      });
    });
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
      expect(result.stdout.trim()).toBe("{}");
    });
  }

  it("invalid JSON exits 0 under 2s", async () => {
    const result = await runHook("{not json");
    homes.push(result.home);
    expect(result.code).toBe(0);
    expect(result.ms).toBeLessThan(2000);
    expect(result.stdout.trim()).toBe("{}");
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
    expect(result.stdout.trim()).toBe("{}");
  });

  it("never-closing stdin exits 0 under 2s and prints {}", async () => {
    const result = await runHookOpenStdin();
    homes.push(result.home);
    expect(result.code).toBe(0);
    expect(result.ms).toBeLessThan(2000);
    expect(result.stdout.trim()).toBe("{}");
  }, 5000);

  it("FIFO transcript_path exits 0 under 2s", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "agentslip-e2e-"));
    homes.push(home);
    const fifo = path.join(home, "tx.fifo");
    execFileSync("mkfifo", [fifo]);
    const payload = JSON.parse(fixture("fixtures/claude-code/session-end.json")) as Record<
      string,
      unknown
    >;
    payload.transcript_path = fifo;
    const result = await runHook(JSON.stringify(payload), { AGENTSLIP_HOME: home });
    expect(result.code).toBe(0);
    expect(result.ms).toBeLessThan(2000);
    expect(result.stdout.trim()).toBe("{}");
  });

  it("large transcript file exits 0 under 2s", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "agentslip-e2e-"));
    homes.push(home);
    const tx = path.join(home, "tx.jsonl");
    const line =
      '{"type":"user","timestamp":"2026-10-27T14:00:00.000Z","message":{"role":"user","content":"pad"}}\n';
    const tail =
      '{"type":"assistant","timestamp":"2026-10-27T14:52:00.000Z","message":{"role":"assistant","content":[{"type":"text","text":"TAIL_OK"}],"usage":{"input_tokens":42,"output_tokens":7}}}\n';
    fs.writeFileSync(tx, line.repeat(8000) + tail);
    const payload = JSON.parse(fixture("fixtures/claude-code/session-end.json")) as Record<
      string,
      unknown
    >;
    payload.transcript_path = tx;
    const result = await runHook(JSON.stringify(payload), { AGENTSLIP_HOME: home });
    expect(result.code).toBe(0);
    expect(result.ms).toBeLessThan(2000);
    expect(result.stdout.trim()).toBe("{}");
    const slips = path.join(home, "slips");
    const svgs = fs.readdirSync(slips).filter((f) => f.endsWith(".svg"));
    expect(svgs.length).toBeGreaterThan(0);
    const svg = fs.readFileSync(path.join(slips, svgs[0]), "utf8");
    expect(svg).toMatch(/S<\/tspan><tspan[^>]*>E<\/tspan><tspan[^>]*>S<\/tspan>/);
    const text = svg.replace(/<[^>]+>/g, "").replace(/&#xa0;/g, " ");
    expect(text).toMatch(/n\/a/);
    expect(text).not.toMatch(/42 in/);
    expect(text).not.toMatch(/TAIL_OK/);
  });

  it("compiled install --claude dry-run quotes an absolute node dist/cli.js hook command", () => {
    const dist = path.join(process.cwd(), "dist", "cli.js");
    expect(fs.existsSync(dist)).toBe(true);
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "agentslip-e2e-"));
    homes.push(home);
    const result = spawnSync(process.execPath, [dist, "install", "--claude"], {
      encoding: "utf8",
      env: { ...process.env, HOME: home, PATH: "/usr/bin:/bin" },
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`'${process.execPath}' '${dist}' hook`);
    expect(fs.existsSync(path.join(home, ".claude", "settings.json"))).toBe(false);
  });

  it("quotes the hook command when the install path contains spaces", () => {
    const distSrc = path.join(process.cwd(), "dist");
    expect(fs.existsSync(path.join(distSrc, "cli.js"))).toBe(true);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "agentslip-sp-"));
    homes.push(tmp);
    const spaced = path.join(tmp, "My Tools", "agentslip");
    fs.cpSync(distSrc, path.join(spaced, "dist"), { recursive: true });
    const cli = path.join(spaced, "dist", "cli.js");
    fs.symlinkSync(
      path.join(process.cwd(), "node_modules"),
      path.join(spaced, "node_modules"),
    );
    const result = spawnSync(process.execPath, [cli, "install", "--claude"], {
      encoding: "utf8",
      env: { ...process.env, HOME: tmp, PATH: "/usr/bin:/bin" },
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`'${process.execPath}' '${cli}' hook`);
    expect(result.stdout).toContain("My Tools");
  });

  it("hard timeout still writes {} and exits 0", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "agentslip-e2e-"));
    homes.push(home);
    const { cmd, args } = bin();
    const started = Date.now();
    const result = await new Promise<{ stdout: string; stderr: string; code: number | null; ms: number }>(
      (resolve, reject) => {
        const child = spawn(cmd, [...args, "hook"], {
          env: {
            ...process.env,
            AGENTSLIP_HOME: home,
            AGENTSLIP_HOOK_HANG_MS: "5000",
            AGENTSLIP_NOW: "2026-10-27T15:00:00.000Z",
            TZ: "UTC",
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
        const killer = setTimeout(() => {
          child.kill("SIGKILL");
        }, 4000);
        child.on("close", (code) => {
          clearTimeout(killer);
          resolve({ stdout, stderr, code, ms: Date.now() - started });
        });
        child.stdin.write(fixture("fixtures/claude-code/stop.json"));
        child.stdin.end();
      },
    );
    expect(result.code).toBe(0);
    expect(result.ms).toBeLessThan(2500);
    expect(result.stdout.trim()).toBe("{}");
    expect(result.stderr).toMatch(/hard timeout/);
  }, 8000);

  it("compiled hook with defaultConfig does not leak secrets into the SVG", async () => {
    const payload = JSON.parse(fixture("fixtures/claude-code/permission-request.json")) as Record<
      string,
      unknown
    >;
    payload.tool_input = {
      command: "curl https://alice:s3cr3tpass@example.com --password=hunter2",
      description: "OPENAI_API_KEY=sk-proj-EXAMPLEKEYNOTREAL",
    };
    const result = await runHook(JSON.stringify(payload));
    homes.push(result.home);
    expect(result.code).toBe(0);
    const slips = path.join(result.home, "slips");
    const svgs = fs.readdirSync(slips).filter((f) => f.endsWith(".svg"));
    const svg = fs.readFileSync(path.join(slips, svgs[0]), "utf8");
    expect(svg).not.toContain("s3cr3tpass");
    expect(svg).not.toContain("hunter2");
    expect(svg).not.toContain("sk-proj-EXAMPLEKEYNOTREAL");
  });
});
