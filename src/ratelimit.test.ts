import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkGate, inSilentHours, loadState, recordPrint } from "./ratelimit.js";
import { defaultConfig } from "./config.js";
import { printSlip } from "./print.js";
import type { SlipData } from "./types.js";

const data: SlipData = {
  kind: "done",
  agent: "Claude Code",
  event: "Stop",
  sessionId: "rl",
  time: new Date("2026-10-27T15:00:00.000Z"),
  summary: "ok",
};

describe("rate limit and silent hours", () => {
  let home: string;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "agentslip-rl-"));
    process.env.AGENTSLIP_HOME = home;
    process.env.AGENTSLIP_GIT_REPO = "demo";
    process.env.AGENTSLIP_GIT_BRANCH = "main";
    process.env.AGENTSLIP_GIT_SHORTSTAT = "";
  });

  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
  });

  it("skips ticket 21 in the same hour", async () => {
    const cfg = defaultConfig();
    cfg.rateLimit.maxPerHour = 20;
    cfg.driver = "virtual";
    const hour = new Date("2026-10-27T15:05:00.000Z");
    for (let i = 0; i < 20; i++) {
      const r = await printSlip({ ...data, time: hour, sessionId: `s${i}` }, cfg);
      expect(r.printed).toBe(true);
    }
    const denied = await printSlip({ ...data, time: hour, sessionId: "s21" }, cfg);
    expect(denied.printed).toBe(false);
    expect(denied.reason).toBe("rate-limit");
    const log = fs.readFileSync(path.join(home, "agentslip.log"), "utf8");
    expect(log).toMatch(/rate-limit/);
  });

  it("silent hours skip printing", () => {
    const at = new Date("2026-10-27T23:30:00.000Z");
    expect(inSilentHours(at, { start: "22:00", end: "08:00" })).toBe(true);
    const cfg = defaultConfig();
    cfg.rateLimit.silentHours = { start: "22:00", end: "08:00" };
    const gate = checkGate(cfg, at, loadState());
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.reason).toBe("silent-hours");
  });

  it("recordPrint increments the ticket number", () => {
    const at = new Date("2026-10-27T15:00:00.000Z");
    const s1 = recordPrint(at);
    const s2 = recordPrint(at, s1);
    expect(s2.ticketSeq).toBe(2);
  });

  it("does not record a ticket when the TCP send fails", async () => {
    const cfg = defaultConfig();
    cfg.driver = "escpos-tcp";
    cfg.escpos.port = 1;
    const r = await printSlip(data, cfg);
    expect(r.printed).toBe(false);
    expect(loadState().ticketSeq).toBe(0);
  });

  it("skips idle_prompt Notification after a recent Stop for the same session", async () => {
    const cfg = defaultConfig();
    cfg.driver = "virtual";
    const t0 = new Date("2026-10-27T15:00:00.000Z");
    const stop = await printSlip({ ...data, time: t0, sessionId: "sess-1" }, cfg);
    expect(stop.printed).toBe(true);
    const idle: SlipData = {
      kind: "needs-you",
      agent: "Claude Code",
      event: "Notification",
      sessionId: "sess-1",
      time: new Date(t0.getTime() + 60_000),
      request: "idle_prompt: Claude is waiting for your input",
    };
    const skipped = await printSlip(idle, cfg);
    expect(skipped.printed).toBe(false);
    expect(skipped.reason).toBe("idle-prompt-dedupe");
    const otherSession = await printSlip({ ...idle, sessionId: "sess-2" }, cfg);
    expect(otherSession.printed).toBe(true);
    const later = await printSlip({ ...idle, time: new Date(t0.getTime() + 121_000) }, cfg);
    expect(later.printed).toBe(true);
  });
});
