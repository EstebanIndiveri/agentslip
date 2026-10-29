import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const ROOT = process.cwd();

describe("npm pack then npm install -g", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  });

  it("isolated-prefix tarball install prints --version and keeps dist/cli.js", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")) as {
      version: string;
      scripts?: Record<string, string>;
    };

    const src = fs.mkdtempSync(path.join(os.tmpdir(), "agentslip-pack-src-"));
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "agentslip-pack-home-"));
    const prefix = fs.mkdtempSync(path.join(os.tmpdir(), "agentslip-pack-prefix-"));
    dirs.push(src, home, prefix);

    for (const rel of ["package.json", "LICENSE", "dist", "viewer/dist"]) {
      const from = path.join(ROOT, rel);
      if (!fs.existsSync(from)) continue;
      fs.cpSync(from, path.join(src, rel), { recursive: true });
    }
    const packedPkg = JSON.parse(fs.readFileSync(path.join(src, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };
    if (packedPkg.scripts) delete packedPkg.scripts.prepare;
    fs.writeFileSync(path.join(src, "package.json"), JSON.stringify(packedPkg, null, 2));

    const npmCli = process.env.npm_execpath || path.join(path.dirname(process.execPath), "npm");
    const pathEnv = [path.dirname(process.execPath), "/usr/bin", "/bin"].join(path.delimiter);
    const env = {
      HOME: home,
      PATH: pathEnv,
      TZ: "UTC",
      npm_config_cache: path.join(home, ".npm"),
      npm_execpath: npmCli,
    };

    const packed = spawnSync(
      process.execPath,
      [npmCli, "pack", "--ignore-scripts", `--pack-destination=${home}`],
      { cwd: src, encoding: "utf8", env },
    );
    expect(packed.status, packed.stderr || packed.stdout).toBe(0);
    const tgz = path.join(home, `agentslip-${pkg.version}.tgz`);
    expect(fs.existsSync(tgz)).toBe(true);

    const installed = spawnSync(
      process.execPath,
      [npmCli, "install", "-g", `--prefix=${prefix}`, "--ignore-scripts", tgz],
      { cwd: home, encoding: "utf8", env },
    );
    expect(installed.status, installed.stderr || installed.stdout).toBe(0);
    const cli = path.join(prefix, "lib", "node_modules", "agentslip", "dist", "cli.js");
    expect(fs.existsSync(cli)).toBe(true);
    expect(fs.lstatSync(path.join(prefix, "lib", "node_modules", "agentslip")).isSymbolicLink()).toBe(
      false,
    );

    const ver = spawnSync(process.execPath, [cli, "--version"], { encoding: "utf8" });
    expect(ver.status).toBe(0);
    expect(ver.stdout.trim()).toBe(pkg.version);
  }, 60_000);
});
