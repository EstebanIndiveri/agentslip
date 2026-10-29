import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runtimeBundleNames } from "./runtime-bundle.js";

const ROOT = process.cwd();

describe("prepare is exercised (not ignored)", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  });

  it("package.json prepare is npm run build", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };
    expect(pkg.scripts?.prepare).toBe("npm run build");
    expect(pkg.scripts?.build).toMatch(/tsc/);
  });

  it("runtime bundle names come from package.json dependencies plus nested deps", () => {
    const names = runtimeBundleNames(ROOT);
    expect(names).toContain("receiptline");
    expect(names.length).toBeGreaterThan(1);
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
    };
    for (const dep of Object.keys(pkg.dependencies ?? {})) {
      expect(names).toContain(dep);
    }
  });

  it("throws if a package.json dependency is missing from node_modules", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agentslip-bundle-missing-"));
    dirs.push(dir);
    fs.writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({ name: "probe", dependencies: { "not-installed-dep-xyz": "1.0.0" } }),
    );
    expect(() => runtimeBundleNames(dir)).toThrow(/not-installed-dep-xyz/);
  });

  it("a probe package npm pack (no --ignore-scripts) fails if its prepare is broken", () => {
    const src = fs.mkdtempSync(path.join(os.tmpdir(), "agentslip-prep-fail-"));
    const dest = fs.mkdtempSync(path.join(os.tmpdir(), "agentslip-prep-pack-"));
    dirs.push(src, dest);
    fs.writeFileSync(
      path.join(src, "package.json"),
      JSON.stringify({
        name: "agentslip-prepare-probe",
        version: "0.0.0",
        private: true,
        files: ["keep.txt"],
        scripts: { prepare: "node -e \"process.exit(7)\"" },
      }),
    );
    fs.writeFileSync(path.join(src, "keep.txt"), "x\n");
    const npmCli = process.env.npm_execpath || path.join(path.dirname(process.execPath), "npm");
    const packed = spawnSync(
      process.execPath,
      [npmCli, "pack", `--pack-destination=${dest}`],
      {
        cwd: src,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: [path.dirname(process.execPath), "/usr/bin", "/bin"].join(path.delimiter),
        },
      },
    );
    expect(packed.status, packed.stderr || packed.stdout).not.toBe(0);
  });

  it("real package prepare compiles dist/cli.js", () => {
    const src = fs.mkdtempSync(path.join(os.tmpdir(), "agentslip-prep-real-"));
    dirs.push(src);
    for (const rel of [
      "package.json",
      "tsconfig.json",
      "tsconfig.build.json",
      "src",
      "scripts",
      "viewer",
    ]) {
      fs.cpSync(path.join(ROOT, rel), path.join(src, rel), { recursive: true });
    }
    fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(src, "node_modules"));
    const npmCli = process.env.npm_execpath || path.join(path.dirname(process.execPath), "npm");
    const prepared = spawnSync(process.execPath, [npmCli, "run", "prepare"], {
      cwd: src,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: [
          path.join(src, "node_modules", ".bin"),
          path.dirname(process.execPath),
          "/usr/bin",
          "/bin",
        ].join(path.delimiter),
      },
    });
    expect(prepared.status, prepared.stderr || prepared.stdout).toBe(0);
    expect(fs.existsSync(path.join(src, "dist", "cli.js"))).toBe(true);
  }, 30_000);

  it("a probe package npm pack (no --ignore-scripts) includes files its prepare wrote", () => {
    const src = fs.mkdtempSync(path.join(os.tmpdir(), "agentslip-prep-ok-"));
    const dest = fs.mkdtempSync(path.join(os.tmpdir(), "agentslip-prep-ok-pack-"));
    dirs.push(src, dest);
    fs.writeFileSync(
      path.join(src, "package.json"),
      JSON.stringify({
        name: "agentslip-prepare-probe",
        version: "0.0.0",
        private: true,
        files: ["built.txt"],
        scripts: { prepare: "node ./write-built.mjs" },
      }),
    );
    fs.writeFileSync(
      path.join(src, "write-built.mjs"),
      "import fs from 'node:fs'; fs.writeFileSync('built.txt', 'from-prepare\\n');\n",
    );
    const npmCli = process.env.npm_execpath || path.join(path.dirname(process.execPath), "npm");
    const packed = spawnSync(
      process.execPath,
      [npmCli, "pack", `--pack-destination=${dest}`],
      {
        cwd: src,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: [path.dirname(process.execPath), "/usr/bin", "/bin"].join(path.delimiter),
        },
      },
    );
    expect(packed.status, packed.stderr || packed.stdout).toBe(0);
    const tgz = fs.readdirSync(dest).find((f) => f.endsWith(".tgz"));
    expect(tgz).toBeTruthy();
    const listed = spawnSync("tar", ["-tzf", path.join(dest, tgz as string)], { encoding: "utf8" });
    expect(listed.status).toBe(0);
    expect(listed.stdout).toMatch(/built\.txt/);
  });
});
