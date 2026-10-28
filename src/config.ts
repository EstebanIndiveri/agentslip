import fs from "node:fs";
import type { AgentslipConfig } from "./types.js";
import { configPath } from "./paths.js";

export type { AgentslipConfig };

export const defaultConfig = (): AgentslipConfig => ({
  driver: "virtual",
  widthMm: 58,
  escpos: {
    host: "127.0.0.1",
    port: 9100,
  },
  file: {
    path: "agentslip.bin",
  },
  virtual: {},
  rateLimit: {
    maxPerHour: 20,
  },
  qr: {
    enabled: false,
  },
  redaction: {
    enabled: true,
  },
});

export function loadConfig(): AgentslipConfig {
  const file = configPath();
  const base = defaultConfig();
  try {
    if (!fs.existsSync(file)) return base;
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<AgentslipConfig>;
    return mergeConfig(base, raw);
  } catch {
    return base;
  }
}

function mergeConfig(base: AgentslipConfig, raw: Partial<AgentslipConfig>): AgentslipConfig {
  return {
    driver: raw.driver ?? base.driver,
    widthMm: raw.widthMm === 80 ? 80 : 58,
    escpos: { ...base.escpos, ...(raw.escpos ?? {}) },
    file: { ...base.file, ...(raw.file ?? {}) },
    virtual: { ...base.virtual, ...(raw.virtual ?? {}) },
    rateLimit: { ...base.rateLimit, ...(raw.rateLimit ?? {}) },
    qr: { ...base.qr, ...(raw.qr ?? {}) },
    redaction: { ...base.redaction, ...(raw.redaction ?? {}) },
  };
}
