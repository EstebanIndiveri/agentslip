import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { log, logStderr } from "../log.js";

/**
 * When invoked as `node dist/cli.js install`, store that absolute command so
 * Claude Code / Codex can run the hook without a global `agentslip` on PATH.
 * `npm link` leaves argv[1] as the bin name, so we keep `agentslip hook`.
 * Never treat some other package's dist/cli.js (e.g. vitest) as ours.
 */
function hookCommand(): string {
  const argv1 = process.argv[1] ? path.resolve(process.argv[1]) : "";
  try {
    const packaged = path.resolve(fileURLToPath(new URL("../cli.js", import.meta.url)));
    if (argv1 === packaged && fs.existsSync(packaged)) {
      return `${process.execPath} ${packaged} hook`;
    }
  } catch {
    // fall through
  }
  return "agentslip hook";
}

function claudeBlock(): Record<string, unknown[]> {
  const cmd = hookCommand();
  const hook = { type: "command", command: cmd, timeout: 2 };
  return {
    Stop: [{ hooks: [hook] }],
    Notification: [
      {
        matcher: "idle_prompt|agent_needs_input",
        hooks: [hook],
      },
    ],
    PermissionRequest: [{ hooks: [hook] }],
    SessionEnd: [{ hooks: [hook] }],
  };
}

function codexBlock(): Record<string, unknown[]> {
  const cmd = hookCommand();
  const hook = { type: "command", command: cmd, timeout: 2 };
  return {
    Stop: [{ hooks: [hook] }],
    PermissionRequest: [{ hooks: [hook] }],
    SessionEnd: [{ hooks: [hook] }],
  };
}

export function runInstall(args: string[]): void {
  const uninstall = args.includes("--uninstall");
  const claude = args.includes("--claude");
  const codex = args.includes("--codex");
  const write = args.includes("--write");
  if (!claude && !codex) {
    logStderr(
      uninstall
        ? "usage: agentslip uninstall --claude | --codex [--write]"
        : "usage: agentslip install --claude | --codex [--write|--uninstall]",
    );
    process.exitCode = 1;
    return;
  }
  if (claude) {
    const file =
      process.env.AGENTSLIP_CLAUDE_SETTINGS ||
      path.join(os.homedir(), ".claude", "settings.json");
    apply(file, claudeBlock(), { write, uninstall, label: "Claude Code" });
  }
  if (codex) {
    const file =
      process.env.AGENTSLIP_CODEX_HOOKS || path.join(os.homedir(), ".codex", "hooks.json");
    apply(file, codexBlock(), { write, uninstall, label: "Codex" });
  }
}

export function runUninstall(args: string[]): void {
  runInstall(["--uninstall", ...args]);
}

function apply(
  file: string,
  hooks: Record<string, unknown[]>,
  opts: { write: boolean; uninstall: boolean; label: string },
): void {
  const block = JSON.stringify({ hooks }, null, 2);
  if (!opts.write && !opts.uninstall) {
    process.stdout.write(`# dry-run: add to ${file}\n${block}\n`);
    return;
  }
  if (opts.uninstall && !opts.write) {
    process.stdout.write(`# dry-run: remove agentslip hook entries from ${file}\n`);
  }
  if (!opts.write && opts.uninstall) return;
  try {
    if (opts.uninstall) {
      removeJson(file);
      log(`removed agentslip hooks from ${file}`);
    } else {
      mergeJson(file, hooks);
      log(`wrote ${opts.label} hooks to ${file} (backup ${path.basename(file)}.bak)`);
    }
  } catch (err) {
    logStderr(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  }
}

function backupPath(file: string): string {
  return `${file}.bak`;
}

function readSettings(file: string): Record<string, unknown> {
  const raw = fs.readFileSync(file, "utf8");
  let existing: unknown;
  try {
    existing = JSON.parse(raw);
  } catch {
    throw new Error(`invalid JSON in ${file}; aborting (file unchanged)`);
  }
  if (!existing || typeof existing !== "object" || Array.isArray(existing)) {
    throw new Error(`${file} must contain a JSON object; aborting (file unchanged)`);
  }
  const obj = existing as Record<string, unknown>;
  if (obj.hooks !== undefined && (typeof obj.hooks !== "object" || Array.isArray(obj.hooks))) {
    throw new Error(`${file}: hooks is not an object; aborting (file unchanged)`);
  }
  return obj;
}

function mergeJson(file: string, hooks: Record<string, unknown[]>): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let existing: Record<string, unknown> = {};
  if (fs.existsSync(file)) {
    existing = readSettings(file);
    fs.copyFileSync(file, backupPath(file));
  }
  const hookMap = (existing.hooks as Record<string, unknown[]>) ?? {};
  for (const [event, entries] of Object.entries(hooks)) {
    const list = hookMap[event] ?? [];
    if (!listContainsAgentslip(list)) {
      hookMap[event] = [...list, ...entries];
    }
  }
  existing.hooks = hookMap;
  fs.writeFileSync(file, `${JSON.stringify(existing, null, 2)}\n`);
}

function listContainsAgentslip(list: unknown[]): boolean {
  return JSON.stringify(list).includes("agentslip") || JSON.stringify(list).includes(" cli.js hook");
}

function removeJson(file: string): void {
  if (!fs.existsSync(file)) return;
  const existing = readSettings(file);
  const hookMap = (existing.hooks as Record<string, unknown[]>) ?? {};
  for (const event of Object.keys(hookMap)) {
    const groups = hookMap[event];
    if (!Array.isArray(groups)) continue;
    const next = groups
      .map((group) => {
        if (!group || typeof group !== "object") return group;
        const g = group as { hooks?: unknown[] };
        if (!Array.isArray(g.hooks)) return group;
        const filtered = g.hooks.filter((h) => !isAgentslipHandler(h));
        return { ...g, hooks: filtered };
      })
      .filter((g) => {
        if (!g || typeof g !== "object") return true;
        const hooks = (g as { hooks?: unknown[] }).hooks;
        return !Array.isArray(hooks) || hooks.length > 0;
      });
    if (next.length) hookMap[event] = next;
    else delete hookMap[event];
  }
  existing.hooks = hookMap;
  fs.copyFileSync(file, backupPath(file));
  fs.writeFileSync(file, `${JSON.stringify(existing, null, 2)}\n`);
}

function isAgentslipHandler(h: unknown): boolean {
  const s = JSON.stringify(h);
  return s.includes("agentslip") || /cli\.js hook/.test(s);
}
