import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { redact, REDACT_MAX_CHARS } from "./redact.js";

const SIZE = 100_000;
const LIMIT_MS = 50;

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

  it("CRED_URL, eyJ, and ASSIGN_HEAD use bounded quantifiers", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "src/redact.ts"), "utf8");
    expect(src).toMatch(/\[\^\/\\s@\]\{0,256\}/);
    expect(src).toMatch(/\[\^@\/\\s\]\{1,256\}/);
    expect(src).toMatch(/eyJ\[a-zA-Z0-9_-\]\{1,256\}/);
    expect(src).toMatch(/ASSIGN_HEAD = \/\\b\(\[A-Za-z_\]\[A-Za-z0-9_-\]\{0,255\}\)/);
  });

  it("redactAssignments checks the name before takeValue", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "src/redact.ts"), "utf8");
    const fn = src.slice(src.indexOf("function redactAssignments"), src.indexOf("function takeValue"));
    const check = fn.indexOf("!isSecretName(name)");
    const take = fn.indexOf("takeValue(");
    expect(check).toBeGreaterThan(-1);
    expect(take).toBeGreaterThan(check);
  });
});

describe("hook e2e 100 KB adversarial payload", () => {
  const homes: string[] = [];
  afterEach(() => {
    for (const h of homes.splice(0)) fs.rmSync(h, { recursive: true, force: true });
  });

  it("compiled hook finishes in under 2 s", async () => {
    const dist = path.join(process.cwd(), "dist", "cli.js");
    expect(fs.existsSync(dist)).toBe(true);
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "agentslip-perf-"));
    homes.push(home);
    const payload = {
      session_id: "perf",
      cwd: process.cwd(),
      hook_event_name: "PermissionRequest",
      tool_name: "Write",
      tool_input: {
        file_path: "x.ts",
        content: `https://u:p@h/${"a".repeat(40_000)} eyJ${"b".repeat(20_000)} mysql -px `.repeat(2),
      },
    };
    const started = Date.now();
    const result = await new Promise<{ code: number | null; ms: number; stdout: string }>(
      (resolve, reject) => {
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
        child.stdout.on("data", (d) => {
          stdout += String(d);
        });
        child.on("error", reject);
        child.on("close", (code) => {
          resolve({ code, ms: Date.now() - started, stdout });
        });
        child.stdin.write(JSON.stringify(payload));
        child.stdin.end();
      },
    );
    // eslint-disable-next-line no-console
    console.log(`hook e2e 100KB: ${result.ms} ms`);
    expect(result.code).toBe(0);
    expect(result.ms).toBeLessThan(2000);
    expect(result.stdout.trim()).toBe("{}");
  }, 8000);
});
