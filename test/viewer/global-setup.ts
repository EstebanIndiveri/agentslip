import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const home = path.join(process.cwd(), "test/viewer/.home");

export default async function globalSetup(): Promise<void> {
  fs.rmSync(home, { recursive: true, force: true });
  fs.mkdirSync(home, { recursive: true });
  execFileSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "src/cli.ts", "test"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      AGENTSLIP_HOME: home,
      AGENTSLIP_GIT_REPO: "demo-app",
      AGENTSLIP_GIT_BRANCH: "main",
      AGENTSLIP_GIT_SHORTSTAT: "1 file changed, 3 insertions(+)",
      AGENTSLIP_NOW: "2026-10-27T15:00:00.000Z",
      TZ: "UTC",
    },
    stdio: "inherit",
  });
}
