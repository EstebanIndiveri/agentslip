import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { startViewerServer } from "../viewer-server.js";
import { log } from "../log.js";
import { defaultSlipsDir } from "../paths.js";

export async function runView(args: string[]): Promise<void> {
  const port = Number(flag(args, "--port") ?? "4173");
  const noOpen = args.includes("--no-open");
  const staticDir = resolveViewerDist();
  if (!fs.existsSync(path.join(staticDir, "index.html"))) {
    log(`viewer build missing at ${staticDir}; run npm run build`);
    process.exitCode = 1;
    return;
  }
  const { url } = await startViewerServer({
    port,
    staticDir,
    slips: defaultSlipsDir(),
  });
  log(`viewer ${url}`);
  if (!noOpen) openBrowser(url);
  await new Promise(() => {
    /* keep process alive */
  });
}

function resolveViewerDist(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, "../../viewer/dist"),
    path.resolve(here, "../viewer"),
    path.resolve(process.cwd(), "viewer/dist"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, "index.html"))) return c;
  }
  return candidates[0];
}

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i >= 0 && args[i + 1]) return args[i + 1];
  const pref = args.find((a) => a.startsWith(`${name}=`));
  return pref ? pref.slice(name.length + 1) : undefined;
}

function openBrowser(url: string): void {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", url] : [url];
  try {
    spawn(cmd, args, { detached: true, stdio: "ignore" }).unref();
  } catch {
    log(`open ${url} in a browser`);
  }
}
