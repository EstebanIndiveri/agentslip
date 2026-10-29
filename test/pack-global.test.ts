import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runtimeBundleNames } from "./runtime-bundle.js";

const ROOT = process.cwd();
const BUNDLE_PKGS = runtimeBundleNames(ROOT);

describe("npm pack then npm install -g", () => {
  it("derives the offline bundle from package.json, including nested deps", () => {
    expect(BUNDLE_PKGS).toContain("receiptline");
    expect(BUNDLE_PKGS.length).toBeGreaterThan(1);
  });

  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  });

  it("isolated-prefix tarball install prints --version from the installed bin, offline", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")) as {
      version: string;
    };

    const src = fs.mkdtempSync(path.join(os.tmpdir(), "agentslip-pack-src-"));
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "agentslip-pack-home-"));
    const prefix = fs.mkdtempSync(path.join(os.tmpdir(), "agentslip-pack-prefix-"));
    const cache = fs.mkdtempSync(path.join(os.tmpdir(), "agentslip-pack-cache-"));
    dirs.push(src, home, prefix, cache);

    for (const rel of ["package.json", "LICENSE", "dist", "viewer/dist"]) {
      const from = path.join(ROOT, rel);
      if (!fs.existsSync(from)) continue;
      fs.cpSync(from, path.join(src, rel), { recursive: true });
    }
    for (const name of BUNDLE_PKGS) {
      const from = path.join(ROOT, "node_modules", name);
      if (!fs.existsSync(from)) continue;
      fs.cpSync(from, path.join(src, "node_modules", name), { recursive: true });
    }

    const packedPkg = JSON.parse(fs.readFileSync(path.join(src, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
      bundleDependencies?: string[];
      bundledDependencies?: string[];
    };
    if (packedPkg.scripts) delete packedPkg.scripts.prepare;
    packedPkg.bundleDependencies = ["receiptline"];
    fs.writeFileSync(path.join(src, "package.json"), JSON.stringify(packedPkg, null, 2));

    const npmCli = process.env.npm_execpath || path.join(path.dirname(process.execPath), "npm");
    const pathEnv = [path.dirname(process.execPath), "/usr/bin", "/bin"].join(path.delimiter);
    const env = {
      HOME: home,
      PATH: pathEnv,
      TZ: "UTC",
      npm_config_cache: cache,
      npm_config_offline: "true",
      npm_config_registry: "http://127.0.0.1:9",
      npm_execpath: npmCli,
      http_proxy: "http://127.0.0.1:9",
      https_proxy: "http://127.0.0.1:9",
      HTTP_PROXY: "http://127.0.0.1:9",
      HTTPS_PROXY: "http://127.0.0.1:9",
      NO_PROXY: "",
      no_proxy: "",
    };

    const packed = spawnSync(
      process.execPath,
      [npmCli, "pack", "--ignore-scripts", `--pack-destination=${home}`],
      { cwd: src, encoding: "utf8", env },
    );
    expect(packed.status, packed.stderr || packed.stdout).toBe(0);
    const tgz = fs.readdirSync(home).find((f) => f.startsWith("agentslip-") && f.endsWith(".tgz"));
    expect(tgz).toBeTruthy();
    const tgzPath = path.join(home, tgz as string);

    const installed = spawnSync(
      process.execPath,
      [
        npmCli,
        "install",
        "-g",
        `--prefix=${prefix}`,
        "--ignore-scripts",
        "--offline",
        `--cache=${cache}`,
        tgzPath,
      ],
      { cwd: home, encoding: "utf8", env },
    );
    expect(installed.status, installed.stderr || installed.stdout).toBe(0);

    const bin = path.join(prefix, "bin", "agentslip");
    expect(fs.existsSync(bin)).toBe(true);
    expect(fs.lstatSync(path.join(prefix, "lib", "node_modules", "agentslip")).isSymbolicLink()).toBe(
      false,
    );

    const ver = spawnSync(bin, ["--version"], { encoding: "utf8", env: { ...env, PATH: pathEnv } });
    expect(ver.status, ver.stderr || ver.stdout).toBe(0);
    expect(ver.stdout.trim()).toBe(pkg.version);
  }, 30_000);
});
