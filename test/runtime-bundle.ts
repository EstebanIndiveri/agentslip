import fs from "node:fs";
import path from "node:path";

/** Runtime package names to copy into an offline pack: package.json dependencies, then nested deps. */
export function runtimeBundleNames(root: string): string[] {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
  };
  const seen = new Set<string>();
  const out: string[] = [];
  const walk = (name: string) => {
    if (seen.has(name)) return;
    seen.add(name);
    const dir = path.join(root, "node_modules", name);
    if (!fs.existsSync(dir)) {
      throw new Error(`runtime dependency ${name} is not installed at ${dir}`);
    }
    out.push(name);
    const depPath = path.join(dir, "package.json");
    if (!fs.existsSync(depPath)) {
      throw new Error(`runtime dependency ${name} is missing package.json at ${depPath}`);
    }
    const dep = JSON.parse(fs.readFileSync(depPath, "utf8")) as {
      dependencies?: Record<string, string>;
    };
    for (const d of Object.keys(dep.dependencies ?? {})) walk(d);
  };
  for (const n of Object.keys(pkg.dependencies ?? {})) walk(n);
  return out;
}
