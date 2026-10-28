import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runInstall, runUninstall } from "./install.js";

describe("install", () => {
  const dirs: string[] = [];
  const prev = {
    claude: process.env.AGENTSLIP_CLAUDE_SETTINGS,
    home: process.env.AGENTSLIP_HOME,
    exit: process.exitCode,
  };

  beforeEach(() => {
    process.exitCode = 0;
  });

  afterEach(() => {
    for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
    if (prev.claude === undefined) delete process.env.AGENTSLIP_CLAUDE_SETTINGS;
    else process.env.AGENTSLIP_CLAUDE_SETTINGS = prev.claude;
    if (prev.home === undefined) delete process.env.AGENTSLIP_HOME;
    else process.env.AGENTSLIP_HOME = prev.home;
    process.exitCode = prev.exit;
  });

  function scratch(): { dir: string; file: string; home: string } {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agentslip-ins-"));
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "agentslip-home-"));
    dirs.push(dir, home);
    const file = path.join(dir, "settings.json");
    process.env.AGENTSLIP_CLAUDE_SETTINGS = file;
    process.env.AGENTSLIP_HOME = home;
    return { dir, file, home };
  }

  it("dry-run does not write", () => {
    const { file } = scratch();
    runInstall(["--claude"]);
    expect(fs.existsSync(file)).toBe(false);
  });

  it("install with no flags does not write a log", () => {
    const { home } = scratch();
    runInstall([]);
    expect(process.exitCode).toBe(1);
    expect(fs.existsSync(path.join(home, "agentslip.log"))).toBe(false);
  });

  it("--write creates a single backup and merges hooks", () => {
    const { dir, file, home } = scratch();
    fs.writeFileSync(
      file,
      JSON.stringify({ model: "opus", permissions: { allow: ["Read"] }, hooks: { Stop: [] } }),
    );
    runInstall(["--claude", "--write"]);
    const firstBak = fs.readFileSync(path.join(dir, "settings.json.bak"), "utf8");
    expect(firstBak).not.toMatch(/agentslip hook/);
    const log1 = fs.readFileSync(path.join(home, "agentslip.log"), "utf8");
    expect(log1).toMatch(/backup settings\.json\.bak/);
    runInstall(["--claude", "--write"]);
    const backups = fs.readdirSync(dir).filter((f) => f.endsWith(".bak")).sort();
    expect(backups).toEqual(["settings.json.agentslip.bak", "settings.json.bak"]);
    expect(fs.readFileSync(path.join(dir, "settings.json.bak"), "utf8")).toBe(firstBak);
    const written = JSON.parse(fs.readFileSync(file, "utf8")) as {
      model: string;
      permissions: unknown;
      hooks: Record<string, unknown[]>;
    };
    expect(written.model).toBe("opus");
    expect(written.permissions).toEqual({ allow: ["Read"] });
    expect(JSON.stringify(written.hooks.Stop)).toMatch(/agentslip hook/);
    expect(JSON.stringify(written.hooks.SessionEnd)).toMatch(/agentslip hook/);
    expect(JSON.stringify(written.hooks.Notification)).toMatch(/idle_prompt\|agent_needs_input/);
  });

  it("invalid JSON aborts without overwrite", () => {
    const { dir, file } = scratch();
    const garbage = "{not json, model and permissions must survive";
    fs.writeFileSync(file, garbage);
    runInstall(["--claude", "--write"]);
    expect(process.exitCode).toBe(1);
    expect(fs.readFileSync(file, "utf8")).toBe(garbage);
    expect(fs.existsSync(path.join(dir, "settings.json.bak"))).toBe(false);
  });

  it("non-object hooks aborts without overwrite", () => {
    const { file } = scratch();
    const original = JSON.stringify({
      model: "opus",
      permissions: { allow: ["Read"] },
      hooks: ["not-an-object"],
    });
    fs.writeFileSync(file, original);
    runInstall(["--claude", "--write"]);
    expect(process.exitCode).toBe(1);
    expect(fs.readFileSync(file, "utf8")).toBe(original);
  });

  it("uninstall removes only agentslip hook entries", () => {
    const { file } = scratch();
    fs.writeFileSync(
      file,
      JSON.stringify({
        model: "opus",
        hooks: {
          Stop: [{ hooks: [{ type: "command", command: "other-tool", timeout: 2 }] }],
        },
      }),
    );
    runInstall(["--claude", "--write"]);
    expect(JSON.stringify(JSON.parse(fs.readFileSync(file, "utf8")))).toMatch(/agentslip hook/);
    runUninstall(["--claude", "--write"]);
    const written = JSON.parse(fs.readFileSync(file, "utf8")) as {
      model: string;
      hooks: Record<string, unknown[]>;
    };
    expect(written.model).toBe("opus");
    expect(JSON.stringify(written.hooks.Stop)).toMatch(/other-tool/);
    expect(JSON.stringify(written)).not.toMatch(/agentslip/);
    expect(written.hooks.SessionEnd).toBeUndefined();
  });

  it("install --uninstall is the same as uninstall", () => {
    const { file } = scratch();
    runInstall(["--claude", "--write"]);
    runInstall(["--claude", "--uninstall", "--write"]);
    const written = JSON.parse(fs.readFileSync(file, "utf8")) as {
      hooks: Record<string, unknown[]>;
    };
    expect(JSON.stringify(written)).not.toMatch(/agentslip/);
  });

  it("keeps foreign cli.js hook and agentslip-fork scripts through install and uninstall", () => {
    const { file } = scratch();
    const foreignStop = [
      { hooks: [{ type: "command", command: "node ~/tools/other-notifier/dist/cli.js hook", timeout: 2 }] },
      { hooks: [{ type: "command", command: "~/src/agentslip-fork/my-own-script.sh", timeout: 2 }] },
    ];
    fs.writeFileSync(
      file,
      JSON.stringify({
        model: "opus",
        hooks: { Stop: foreignStop },
      }),
    );
    runInstall(["--claude", "--write"]);
    const afterInstall = JSON.parse(fs.readFileSync(file, "utf8")) as {
      hooks: Record<string, unknown[]>;
    };
    expect(JSON.stringify(afterInstall.hooks.Stop)).toMatch(/other-notifier\/dist\/cli\.js hook/);
    expect(JSON.stringify(afterInstall.hooks.Stop)).toMatch(/agentslip-fork\/my-own-script\.sh/);
    expect(JSON.stringify(afterInstall.hooks.Stop)).toMatch(/agentslip hook/);
    runUninstall(["--claude", "--write"]);
    const after = JSON.parse(fs.readFileSync(file, "utf8")) as {
      model: string;
      hooks: Record<string, unknown[]>;
    };
    expect(after.model).toBe("opus");
    expect(JSON.stringify(after.hooks.Stop)).toMatch(/other-notifier\/dist\/cli\.js hook/);
    expect(JSON.stringify(after.hooks.Stop)).toMatch(/agentslip-fork\/my-own-script\.sh/);
    expect(JSON.stringify(after)).not.toMatch(/"command": "agentslip hook"/);
  });

  it("does not overwrite an existing bak that already contains agentslip", () => {
    const { dir, file } = scratch();
    fs.writeFileSync(file, JSON.stringify({ model: "opus" }));
    const bak = path.join(dir, "settings.json.bak");
    const preserved = JSON.stringify({
      hooks: { Stop: [{ hooks: [{ type: "command", command: "agentslip hook" }] }] },
    });
    fs.writeFileSync(bak, preserved);
    runInstall(["--claude", "--write"]);
    expect(fs.readFileSync(bak, "utf8")).toBe(preserved);
  });

  it("writes settings.json.agentslip.bak when a foreign .bak already exists", () => {
    const { dir, file, home } = scratch();
    fs.writeFileSync(file, JSON.stringify({ model: "opus", other: true }));
    const bak = path.join(dir, "settings.json.bak");
    const foreign = JSON.stringify({ note: "not-agentslip", keep: true });
    fs.writeFileSync(bak, foreign);
    runInstall(["--claude", "--write"]);
    expect(fs.readFileSync(bak, "utf8")).toBe(foreign);
    const alt = path.join(dir, "settings.json.agentslip.bak");
    expect(fs.existsSync(alt)).toBe(true);
    expect(JSON.parse(fs.readFileSync(alt, "utf8"))).toMatchObject({ model: "opus", other: true });
    const log = fs.readFileSync(path.join(home, "agentslip.log"), "utf8");
    expect(log).toMatch(/backup settings\.json\.agentslip\.bak/);
    expect(log).not.toMatch(/backup settings\.json\.bak\b/);
  });

  it("does not claim a backup when installing a new file", () => {
    const { file, home } = scratch();
    runInstall(["--claude", "--write"]);
    expect(fs.existsSync(`${file}.bak`)).toBe(false);
    const log = fs.readFileSync(path.join(home, "agentslip.log"), "utf8");
    expect(log).toMatch(/no backup/);
    expect(log).not.toMatch(/backup settings\.json\.bak/);
  });

  it("skips a new backup when both .bak files already exist", () => {
    const { dir, file, home } = scratch();
    fs.writeFileSync(file, JSON.stringify({ model: "opus" }));
    fs.writeFileSync(path.join(dir, "settings.json.bak"), JSON.stringify({ keep: "bak" }));
    fs.writeFileSync(path.join(dir, "settings.json.agentslip.bak"), JSON.stringify({ keep: "alt" }));
    runInstall(["--claude", "--write"]);
    expect(JSON.parse(fs.readFileSync(path.join(dir, "settings.json.bak"), "utf8"))).toEqual({
      keep: "bak",
    });
    expect(
      JSON.parse(fs.readFileSync(path.join(dir, "settings.json.agentslip.bak"), "utf8")),
    ).toEqual({ keep: "alt" });
    const log = fs.readFileSync(path.join(home, "agentslip.log"), "utf8");
    expect(log).toMatch(/no new backup/);
  });
});
