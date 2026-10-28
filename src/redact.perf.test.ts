import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { complexityCases, redact, REDACT_MAX_CHARS } from "./redact.js";

const SIZE = 100_000;
const LIMIT_MS = 50;
const UNCAP_MS = 50;

function timed(label: string, input: string): number {
  const t0 = performance.now();
  redact(input);
  const ms = performance.now() - t0;
  // eslint-disable-next-line no-console
  console.log(`redact ${label}: ${ms.toFixed(2)} ms (in=${input.length} cap=${REDACT_MAX_CHARS})`);
  return ms;
}

describe("redact ReDoS guards (100 KB)", () => {
  const cases: { name: string; input: string }[] = [
    {
      name: "credential URL with no spaces",
      input: `https://user:pass@example.com/${"a".repeat(SIZE)}`,
    },
    {
      name: "repeated Slack webhooks",
      input: (() => {
        const u = "https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX";
        return u.repeat(Math.ceil(SIZE / u.length));
      })(),
    },
    { name: "dashes", input: "-".repeat(SIZE) },
    { name: "eyJ", input: `eyJ${"a".repeat(SIZE)}` },
    { name: "one long word", input: "a".repeat(SIZE) },
    {
      name: "repeated mysql",
      input: "mysql -px ".repeat(Math.ceil(SIZE / 10)),
    },
    {
      name: "mixed",
      input:
        `https://u:p@h/${"a".repeat(20_000)} ` +
        "https://hooks.slack.com/services/T00/B00/XXX ".repeat(500) +
        "-".repeat(20_000) +
        ` eyJ${"b".repeat(20_000)} ` +
        "c".repeat(20_000) +
        " mysql -px ".repeat(2000),
    },
    { name: "repeated ASSIGN colons", input: "a:".repeat(Math.ceil(SIZE / 2)) },
  ];

  for (const c of cases) {
    it(`redact() ${c.name} in under ${LIMIT_MS} ms`, () => {
      expect(c.input.length).toBeGreaterThanOrEqual(SIZE);
      const ms = timed(c.name, c.input);
      expect(ms).toBeLessThan(LIMIT_MS);
    });
  }

  it("redactAssignments checks the name before takeValue", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "src/redact.ts"), "utf8");
    const fn = src.slice(src.indexOf("function redactAssignments"), src.indexOf("function takeValue"));
    const check = fn.indexOf("!isSecretName(name)");
    const take = fn.indexOf("takeValue(");
    expect(check).toBeGreaterThan(-1);
    expect(take).toBeGreaterThan(check);
  });

  it('redact("a=".repeat(4352)) finishes under 50 ms', () => {
    const input = "a=".repeat(4352);
    expect(input.length).toBe(8704);
    const ms = timed("a= x4352", input);
    expect(ms).toBeLessThan(50);
  });
});

describe("uncapped regex complexity (100 KB, no field cap)", () => {
  for (const c of complexityCases()) {
    it(`${c.name} finishes in under ${UNCAP_MS} ms`, () => {
      expect(c.input.length).toBeGreaterThanOrEqual(SIZE);
      const re = c.re;
      re.lastIndex = 0;
      const t0 = performance.now();
      c.input.replace(re, "[redacted]");
      const ms = performance.now() - t0;
      // eslint-disable-next-line no-console
      console.log(`uncapped ${c.name}: ${ms.toFixed(2)} ms (in=${c.input.length})`);
      expect(ms).toBeLessThan(UNCAP_MS);
    });
  }
});

function runHook(
  payload: string,
  home: string,
): Promise<{ code: number | null; ms: number; stdout: string; stderr: string }> {
  const dist = path.join(process.cwd(), "dist", "cli.js");
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [dist, "hook"], {
      env: {
        ...process.env,
        AGENTSLIP_HOME: home,
        AGENTSLIP_GIT_REPO: "demo-app",
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
    child.on("close", (code) => {
      resolve({ code, ms: Date.now() - started, stdout, stderr });
    });
    child.stdin.write(payload);
    child.stdin.end();
  });
}

describe("hook e2e budgets", () => {
  const homes: string[] = [];
  afterEach(() => {
    for (const h of homes.splice(0)) fs.rmSync(h, { recursive: true, force: true });
  });

  it("8 KB Write payload finishes in under 2 s", async () => {
    const dist = path.join(process.cwd(), "dist", "cli.js");
    expect(fs.existsSync(dist)).toBe(true);
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "agentslip-perf-"));
    homes.push(home);
    const payload = JSON.stringify({
      session_id: "perf",
      cwd: process.cwd(),
      hook_event_name: "PermissionRequest",
      tool_name: "Write",
      tool_input: {
        file_path: "x.ts",
        content: `https://u:p@h/${"a".repeat(40_000)} eyJ${"b".repeat(20_000)} mysql -px `.repeat(2),
      },
    });
    const result = await runHook(payload, home);
    // eslint-disable-next-line no-console
    console.log(`hook e2e 100KB Write: ${result.ms} ms`);
    expect(result.code).toBe(0);
    expect(result.ms).toBeLessThan(2000);
    expect(result.stdout.trim()).toBe("{}");
    expect(result.stderr).not.toMatch(/hard timeout/);
  }, 8000);

  it("MultiEdit 300 × 8 KB finishes in under 2 s", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "agentslip-perf-"));
    homes.push(home);
    const payload = JSON.stringify({
      session_id: "perf-me",
      cwd: process.cwd(),
      hook_event_name: "PermissionRequest",
      tool_name: "MultiEdit",
      tool_input: {
        file_path: "x.ts",
        edits: Array.from({ length: 300 }, () => ({
          old_string: "a",
          new_string: "x".repeat(8 * 1024),
        })),
      },
    });
    const result = await runHook(payload, home);
    // eslint-disable-next-line no-console
    console.log(`hook e2e MultiEdit 300x8KB: ${result.ms} ms`);
    expect(result.code).toBe(0);
    expect(result.ms).toBeLessThan(2000);
    expect(result.stdout.trim()).toBe("{}");
    expect(result.stderr).not.toMatch(/hard timeout/);
  }, 8000);

  it("Codex 1000 strings finishes in under 2 s", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "agentslip-perf-"));
    homes.push(home);
    const strings: Record<string, string> = {};
    for (let i = 0; i < 1000; i++) strings[`s${i}`] = "y".repeat(8 * 1024);
    const payload = JSON.stringify({
      session_id: "perf-cx",
      cwd: process.cwd(),
      hook_event_name: "PermissionRequest",
      tool_name: "ApplyPatch",
      tool_input: strings,
    });
    const result = await runHook(payload, home);
    // eslint-disable-next-line no-console
    console.log(`hook e2e Codex 1000 strings: ${result.ms} ms`);
    expect(result.code).toBe(0);
    expect(result.ms).toBeLessThan(2000);
    expect(result.stdout.trim()).toBe("{}");
    expect(result.stderr).not.toMatch(/hard timeout/);
  }, 8000);

  it("10k nested tool_input produces a slip (no RangeError)", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "agentslip-perf-"));
    homes.push(home);
    let inner = '{"x":"v"}';
    for (let i = 0; i < 10_000; i++) inner = `{"n":${inner}}`;
    const payload =
      `{"session_id":"nest","cwd":${JSON.stringify(process.cwd())},` +
      `"hook_event_name":"PermissionRequest","tool_name":"Write","tool_input":${inner}}`;
    const result = await runHook(payload, home);
    // eslint-disable-next-line no-console
    console.log(`hook e2e 10k nest: ${result.ms} ms`);
    expect(result.code).toBe(0);
    expect(result.ms).toBeLessThan(2000);
    expect(result.stdout.trim()).toBe("{}");
    expect(result.stderr).not.toMatch(/hard timeout/);
  }, 8000);
});
