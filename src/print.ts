import type { AgentslipConfig, SlipData } from "./types.js";
import { loadConfig } from "./config.js";
import { checkGate, loadState, recordPrint } from "./ratelimit.js";
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

export async function printSlip(
  data: SlipData,
  config: AgentslipConfig = loadConfig(),
): Promise<PrintResult> {
  const at = data.time ?? now();
  const state = loadState();
  const gate = checkGate(config, at, state);
  if (!gate.ok) {
    log(`skipped (${gate.reason})`);
    return { printed: false, reason: gate.reason };
  }
  const next = recordPrint(at, state);
  const rendered = renderSlip(data, config, next.ticketSeq);

  if (config.driver === "file") {
    const file = writeEscposFile(rendered, config.file.path);
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
    log(`sent ticket #${rendered.ticketNo} to ${config.escpos.host}:${config.escpos.port}`);
    return { printed: true, ticketNo: rendered.ticketNo };
  }

  const file = writeVirtualSlip(rendered, data, config.virtual.slipsDir ?? defaultSlipsDir());
  log(`virtual slip ${file}`);
  return { printed: true, file, ticketNo: rendered.ticketNo };
}
