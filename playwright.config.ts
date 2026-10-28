import path from "node:path";
import { defineConfig } from "@playwright/test";

const viewerHome = path.join(process.cwd(), "test/viewer/.home");

export default defineConfig({
  testDir: "test/viewer",
  fullyParallel: false,
  retries: 0,
  globalSetup: "./test/viewer/global-setup.ts",
  use: {
    baseURL: "http://127.0.0.1:4173",
    browserName: "chromium",
    viewport: { width: 900, height: 900 },
  },
  webServer: {
    command: "npx vite --config viewer/vite.config.ts --host 127.0.0.1 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      ...process.env,
      AGENTSLIP_HOME: viewerHome,
    },
  },
});
