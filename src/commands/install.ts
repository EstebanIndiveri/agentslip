import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { log } from "../log.js";

const CLAUDE_BLOCK = {
  Stop: [{ hooks: [{ type: "command", command: "agentslip hook", timeout: 2 }] }],
  Notification: [{ hooks: [{ type: "command", command: "agentslip hook", timeout: 2 }] }],
  PermissionRequest: [{ hooks: [{ type: "command", command: "agentslip hook", timeout: 2 }] }],
  SessionEnd: [{ hooks: [{ type: "command", command: "agentslip hook", timeout: 2 }] }],
};

const CODEX_BLOCK = {
  Stop: [{ hooks: [{ type: "command", command: "agentslip hook", timeout: 2 }] }],
  PermissionRequest: [{ hooks: [{ type: "command", command: "agentslip hook", timeout: 2 }] }],
  SessionEnd: [{ hooks: [{ type: "command", command: "agentslip hook", timeout: 2 }] }],
};

export function runInstall(args: string[]): void {
  const claude = args.includes("--claude");
  const codex = args.includes("--codex");
  const write = args.includes("--write");
  if (!claude && !codex) {
    log("usage: agentslip install --claude | --codex [--write]");
    process.exitCode = 1;
    return;
  }
  if (claude) {
    const file =
      process.env.AGENTSLIP_CLAUDE_SETTINGS ||
      path.join(os.homedir(), ".claude", "settings.json");
    const block = JSON.stringify({ hooks: CLAUDE_BLOCK }, null, 2);
    if (!write) {
      process.stdout.write(`# dry-run: add to ${file}\n${block}\n`);
    } else {
      mergeJson(file, CLAUDE_BLOCK);
      log(`wrote Claude Code hooks to ${file} (backup created)`);
    }
  }
  if (codex) {
    const file =
      process.env.AGENTSLIP_CODEX_HOOKS || path.join(os.homedir(), ".codex", "hooks.json");
    const block = JSON.stringify({ hooks: CODEX_BLOCK }, null, 2);
    if (!write) {
      process.stdout.write(`# dry-run: add to ${file}\n${block}\n`);
    } else {
      mergeJson(file, CODEX_BLOCK);
      log(`wrote Codex hooks to ${file} (backup created)`);
    }
  }
}

function mergeJson(file: string, hooks: Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let existing: { hooks?: Record<string, unknown[]> } = {};
  if (fs.existsSync(file)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backup = `${file}.${stamp}.bak`;
    fs.copyFileSync(file, backup);
    try {
      existing = JSON.parse(fs.readFileSync(file, "utf8")) as typeof existing;
    } catch {
      existing = {};
    }
  }
  existing.hooks = existing.hooks ?? {};
  for (const [event, entries] of Object.entries(hooks)) {
    const list = (existing.hooks[event] as unknown[]) ?? [];
    const already = JSON.stringify(list).includes("agentslip hook");
    if (!already) {
      existing.hooks[event] = [...list, ...(entries as unknown[])];
    }
  }
  fs.writeFileSync(file, `${JSON.stringify(existing, null, 2)}\n`);
}
