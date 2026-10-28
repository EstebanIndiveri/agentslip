import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { log, logStderr } from "../log.js";

/**
 * Shell-quote a path so Claude Code / Codex can exec it when it contains
 * spaces or other special characters.
 */
export function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

function ourCliPath(): string | undefined {
  try {
    const packaged = path.resolve(fileURLToPath(new URL("../cli.js", import.meta.url)));
    if (fs.existsSync(packaged)) return fs.realpathSync(packaged);
  } catch {
    // fall through
  }
  return undefined;
}

function findOnPath(name: string): string | undefined {
  const pathEnv = process.env.PATH ?? "";
  for (const dir of pathEnv.split(path.delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir, name);
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      // continue
    }
  }
  return undefined;
}

function sameFile(a: string, b: string): boolean {
  try {
    if (fs.existsSync(a) && fs.existsSync(b)) {
      return fs.realpathSync(a) === fs.realpathSync(b);
    }
  } catch {
    // fall through
  }
  return path.resolve(a) === path.resolve(b);
}

/**
 * Prefer `agentslip hook` when `agentslip` is on PATH.
 * Otherwise, when invoked as `node dist/cli.js install`, store a quoted
 * absolute `node` + this package's `dist/cli.js` + `hook`. That form pins
 * `process.execPath` (nvm/fnm users should re-run install after switching
 * Node, or use `npm link` so the command stays `agentslip hook`).
 * Never treat some other package's dist/cli.js as ours.
 */
export function hookCommand(): string {
  if (findOnPath("agentslip")) return "agentslip hook";
  const cli = ourCliPath();
  const argv1 = process.argv[1] ? path.resolve(process.argv[1]) : "";
  if (cli && argv1 && sameFile(argv1, cli)) {
    return `${shellQuote(process.execPath)} ${shellQuote(cli)} hook`;
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
      const backup = removeJson(file);
      log(`removed agentslip hooks from ${file} (${formatBackup(backup)})`);
    } else {
      const backup = mergeJson(file, hooks);
      log(`wrote ${opts.label} hooks to ${file} (${formatBackup(backup)})`);
    }
  } catch (err) {
    logStderr(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  }
}

function backupPath(file: string): string {
  return `${file}.bak`;
}

function agentslipBackupPath(file: string): string {
  return `${file}.agentslip.bak`;
}

export type BackupResult = {
  action: "created" | "agentslip-bak" | "skipped" | "already" | "none";
  dest?: string;
};

function formatBackup(result: BackupResult): string {
  if (result.action === "created" && result.dest) {
    return `backup ${path.basename(result.dest)}`;
  }
  if (result.action === "agentslip-bak" && result.dest) {
    return `backup ${path.basename(result.dest)}`;
  }
  if (result.action === "already") {
    return "no backup; file already has agentslip";
  }
  if (result.action === "skipped") {
    return "no new backup; existing .bak files left in place";
  }
  return "no backup";
}

function settingsContainAgentslip(obj: Record<string, unknown>): boolean {
  const hooks = obj.hooks;
  if (!hooks || typeof hooks !== "object" || Array.isArray(hooks)) return false;
  for (const list of Object.values(hooks as Record<string, unknown>)) {
    if (Array.isArray(list) && listContainsAgentslip(list)) return true;
  }
  return false;
}

/**
 * Copy `file` to `file.bak` when that path is free. If a foreign `.bak`
 * already exists, write `file.agentslip.bak` instead. Never overwrite either.
 * On install, skip backup when the current file already contains agentslip
 * so we do not snapshot a file that is already ours.
 */
function maybeBackup(
  file: string,
  opts?: { skipIfAlreadyAgentslip?: boolean; parsed?: Record<string, unknown> },
): BackupResult {
  if (!fs.existsSync(file)) return { action: "none" };
  if (opts?.skipIfAlreadyAgentslip && opts.parsed && settingsContainAgentslip(opts.parsed)) {
    return { action: "already" };
  }
  const bak = backupPath(file);
  if (!fs.existsSync(bak)) {
    fs.copyFileSync(file, bak);
    return { action: "created", dest: bak };
  }
  const alt = agentslipBackupPath(file);
  if (!fs.existsSync(alt)) {
    fs.copyFileSync(file, alt);
    return { action: "agentslip-bak", dest: alt };
  }
  return { action: "skipped", dest: bak };
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

function mergeJson(file: string, hooks: Record<string, unknown[]>): BackupResult {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let existing: Record<string, unknown> = {};
  let backup: BackupResult = { action: "none" };
  if (fs.existsSync(file)) {
    existing = readSettings(file);
    backup = maybeBackup(file, { skipIfAlreadyAgentslip: true, parsed: existing });
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
  return backup;
}

export function tokenizeCommand(cmd: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < cmd.length) {
    while (i < cmd.length && cmd[i] === " ") i += 1;
    if (i >= cmd.length) break;
    if (cmd[i] === "'") {
      let s = "";
      i += 1;
      while (i < cmd.length) {
        if (cmd.startsWith(`'\\''`, i)) {
          s += "'";
          i += 4;
          continue;
        }
        if (cmd[i] === "'") {
          i += 1;
          break;
        }
        s += cmd[i];
        i += 1;
      }
      out.push(s);
      continue;
    }
    if (cmd[i] === '"') {
      let s = "";
      i += 1;
      while (i < cmd.length && cmd[i] !== '"') {
        if (cmd[i] === "\\" && i + 1 < cmd.length) {
          s += cmd[i + 1];
          i += 2;
          continue;
        }
        s += cmd[i];
        i += 1;
      }
      if (cmd[i] === '"') i += 1;
      out.push(s);
      continue;
    }
    let s = "";
    while (i < cmd.length && cmd[i] !== " ") {
      s += cmd[i];
      i += 1;
    }
    out.push(s);
  }
  return out;
}

/**
 * True only for the command this package writes: `agentslip hook`, or
 * quoted/unquoted `node <this package's dist/cli.js> hook`.
 * Does not match a foreign `…/cli.js hook` or a path that merely contains
 * the substring "agentslip".
 */
export function isAgentslipHandler(h: unknown): boolean {
  if (!h || typeof h !== "object") return false;
  const cmd = (h as { command?: unknown }).command;
  if (typeof cmd !== "string") return false;
  const tokens = tokenizeCommand(cmd.trim());
  const hash = tokens.indexOf("#");
  const parts = hash >= 0 ? tokens.slice(0, hash) : tokens;
  if (parts.length === 2 && parts[0] === "agentslip" && parts[1] === "hook") return true;
  if (parts.length === 3 && parts[2] === "hook") {
    const cli = ourCliPath();
    if (!cli) return false;
    const cliArg = parts[1];
    try {
      if (fs.existsSync(cliArg) && fs.realpathSync(cliArg) === cli) return true;
    } catch {
      // fall through
    }
    return path.resolve(cliArg) === cli;
  }
  return false;
}

export function listContainsAgentslip(list: unknown[]): boolean {
  for (const group of list) {
    if (!group || typeof group !== "object") continue;
    const hooks = (group as { hooks?: unknown[] }).hooks;
    if (Array.isArray(hooks) && hooks.some(isAgentslipHandler)) return true;
  }
  return false;
}

function removeJson(file: string): BackupResult {
  if (!fs.existsSync(file)) return { action: "none" };
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
  const backup = maybeBackup(file);
  fs.writeFileSync(file, `${JSON.stringify(existing, null, 2)}\n`);
  return backup;
}
