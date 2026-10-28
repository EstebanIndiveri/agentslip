import type { AgentslipConfig, AppState, SlipData } from "./types.js";
import { loadConfig } from "./config.js";
import { checkGate, loadState, recordDone, recordPrint } from "./ratelimit.js";
import { renderSlip } from "./slips/document.js";
import { writeVirtualSlip } from "./drivers/virtual.js";
import { writeEscposFile } from "./drivers/file.js";
import { sendEscposTcp } from "./drivers/escpos-tcp.js";
import { log } from "./log.js";
import { now } from "./clock.js";
import { defaultSlipsDir } from "./paths.js";

export type PrintResult = {
  printed: boolean;
  reason?: string;
  file?: string;
  ticketNo?: number;
};

/** Claude Code sends Notification idle_prompt ~60 s after Stop. Skip a repeat. */
export const IDLE_PROMPT_DEDUPE_MS = 120_000;

function isIdlePromptAfterStop(data: SlipData, at: Date, state: AppState): boolean {
  if (data.kind !== "needs-you") return false;
  if (data.event !== "Notification") return false;
  const req = data.request ?? "";
  if (!req.startsWith("idle_prompt")) return false;
  if (!data.sessionId || !state.lastDoneSession || !state.lastDoneAt) return false;
  if (data.sessionId !== state.lastDoneSession) return false;
  return at.getTime() - state.lastDoneAt < IDLE_PROMPT_DEDUPE_MS;
}

function notePrint(data: SlipData, at: Date, state: AppState): void {
  const next = recordPrint(at, state);
  if (data.kind === "done") recordDone(data.sessionId, at, next);
}

export async function printSlip(
  data: SlipData,
  config: AgentslipConfig = loadConfig(),
): Promise<PrintResult> {
  const at = data.time ?? now();
  const state = loadState();
  if (isIdlePromptAfterStop(data, at, state)) {
    log("skipped (idle_prompt after Stop)");
    return { printed: false, reason: "idle-prompt-dedupe" };
  }
  const gate = checkGate(config, at, state);
  if (!gate.ok) {
    log(`skipped (${gate.reason})`);
    return { printed: false, reason: gate.reason };
  }
  const ticketNo = state.ticketSeq + 1;
  const rendered = renderSlip(data, config, ticketNo);

  if (config.driver === "file") {
    const file = writeEscposFile(rendered, config.file.path);
    notePrint(data, at, state);
    log(`wrote ${file}`);
    return { printed: true, file, ticketNo: rendered.ticketNo };
  }

  if (config.driver === "escpos-tcp") {
    const result = await sendEscposTcp(
      rendered.escpos,
      config.escpos.host,
      config.escpos.port,
      800,
    );
    if (!result.ok) {
      log(`printer error: ${result.error}`);
      return { printed: false, reason: result.error, ticketNo: rendered.ticketNo };
    }
    notePrint(data, at, state);
    log(`sent ticket #${rendered.ticketNo} to ${config.escpos.host}:${config.escpos.port}`);
    return { printed: true, ticketNo: rendered.ticketNo };
  }

  const file = writeVirtualSlip(rendered, data, config.virtual.slipsDir ?? defaultSlipsDir());
  notePrint(data, at, state);
  log(`virtual slip ${file}`);
  return { printed: true, file, ticketNo: rendered.ticketNo };
}
