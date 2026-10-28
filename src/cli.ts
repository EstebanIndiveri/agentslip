#!/usr/bin/env node
import { createRequire } from "node:module";
import { runHook } from "./commands/hook.js";
import { runTest } from "./commands/test.js";
import { runView } from "./commands/view.js";
import { runInstall, runUninstall } from "./commands/install.js";
import { log } from "./log.js";

function packageVersion(): string {
  try {
    const req = createRequire(import.meta.url);
    const pkg = req("../package.json") as { version?: string };
    return typeof pkg.version === "string" ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

const HELP = `agentslip — receipts for your coding agents

Usage:
  agentslip hook                 Read a hook JSON payload on stdin and print a slip
  agentslip test                 Print one example of each template (DONE, NEEDS YOU, SESSION)
  agentslip view [--port N] [--no-open]
                                 Open the virtual paper-roll viewer
  agentslip install --claude|--codex [--write]
                                 Show (or write) hook configuration. Dry-run unless --write.
  agentslip uninstall --claude|--codex [--write]
                                 Remove only agentslip hook entries. Dry-run unless --write.
  agentslip install --claude|--codex --uninstall [--write]
                                 Same as uninstall.
  agentslip --version            Print the package version from package.json

Config: ~/.agentslip/config.json
Virtual slips: ~/.agentslip/slips/
`;

async function main(argv: string[]): Promise<void> {
  const cmd = argv[0];
  if (!cmd || cmd === "-h" || cmd === "--help" || cmd === "help") {
    process.stdout.write(HELP);
    return;
  }
  if (cmd === "--version" || cmd === "-v" || cmd === "version") {
    process.stdout.write(`${packageVersion()}\n`);
    return;
  }
  if (cmd === "hook") {
    await runHook();
    return;
  }
  if (cmd === "test") {
    await runTest();
    return;
  }
  if (cmd === "view") {
    await runView(argv.slice(1));
    return;
  }
  if (cmd === "install") {
    runInstall(argv.slice(1));
    return;
  }
  if (cmd === "uninstall") {
    runUninstall(argv.slice(1));
    return;
  }
  log(`unknown command: ${cmd}`);
  process.stdout.write(HELP);
  process.exitCode = 1;
}

main(process.argv.slice(2)).catch((err: unknown) => {
  log(err instanceof Error ? err.message : String(err));
  const cmd = process.argv[2];
  process.exit(cmd === "hook" ? 0 : 1);
});
