import os from "node:os";
import path from "node:path";

/** Override the entire data directory (tests). Defaults to ~/.agentslip */
export function dataDir(): string {
  if (process.env.AGENTSLIP_HOME) return process.env.AGENTSLIP_HOME;
  return path.join(os.homedir(), ".agentslip");
}

export function configPath(): string {
  if (process.env.AGENTSLIP_CONFIG) return process.env.AGENTSLIP_CONFIG;
  return path.join(dataDir(), "config.json");
}

export function statePath(): string {
  return path.join(dataDir(), "state.json");
}

export function defaultSlipsDir(): string {
  return path.join(dataDir(), "slips");
}
