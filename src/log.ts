import fs from "node:fs";
import path from "node:path";
import { dataDir } from "./paths.js";

export function log(message: string): void {
  const line = `agentslip: ${message}`;
  try {
    process.stderr.write(`${line}\n`);
  } catch {
    // ignore
  }
  try {
    const file = path.join(dataDir(), "agentslip.log");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, `${new Date().toISOString()} ${line}\n`);
  } catch {
    // never block the hook on logging
  }
}
