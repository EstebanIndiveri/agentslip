import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runInstall } from "./install.js";

describe("install", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  });

  it("dry-run does not write", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agentslip-ins-"));
    dirs.push(dir);
    const file = path.join(dir, "settings.json");
    process.env.AGENTSLIP_CLAUDE_SETTINGS = file;
    runInstall(["--claude"]);
    expect(fs.existsSync(file)).toBe(false);
  });

  it("--write creates a backup and merges hooks", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agentslip-ins-"));
    dirs.push(dir);
    const file = path.join(dir, "settings.json");
    fs.writeFileSync(file, JSON.stringify({ hooks: { Stop: [] } }));
    process.env.AGENTSLIP_CLAUDE_SETTINGS = file;
    runInstall(["--claude", "--write"]);
    const backups = fs.readdirSync(dir).filter((f) => f.endsWith(".bak"));
    expect(backups.length).toBe(1);
    const written = JSON.parse(fs.readFileSync(file, "utf8")) as {
      hooks: Record<string, unknown[]>;
    };
    expect(JSON.stringify(written.hooks.Stop)).toMatch(/agentslip hook/);
    expect(JSON.stringify(written.hooks.SessionEnd)).toMatch(/agentslip hook/);
  });
});
