import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import type { AgentslipConfig, RenderedSlip, SlipData } from "../types.js";
import { formatLocal } from "../clock.js";
import { redact } from "../redact.js";
import { wrapLine, oneLine } from "../wrap.js";
import { escapeRl } from "./escape.js";

const require = createRequire(import.meta.url);
const receiptline = require("receiptline") as {
  transform: (doc: string, printer?: Record<string, unknown>) => string;
};

/** MUTATION CHECK: set false so ESC/POS snapshots fail (no GS V). */
export const ESPOS_CUT = true;

export function columnsFor(widthMm: 58 | 80): number {
  return widthMm === 80 ? 48 : 32;
}

export function sessionCode(sessionId: string | undefined): string {
  if (!sessionId) return "n/a";
  return createHash("sha256").update(sessionId).digest("hex").slice(0, 8);
}

export function buildDocument(
  data: SlipData,
  opts: {
    widthMm: 58 | 80;
    ticketNo: number;
    qr?: { enabled: boolean; url?: string };
    redactEnabled?: boolean;
  },
): { document: string; sessionCode: string; cpl: number } {
  const cpl = columnsFor(opts.widthMm);
  const code = sessionCode(data.sessionId);
  const enabled = opts.redactEnabled !== false;
  const r = (s: string) => redact(s, enabled);

  const lines: string[] = [];
  lines.push(center("AGENTSLIP", cpl));
  lines.push(center(`#${String(opts.ticketNo).padStart(4, "0")}  ${formatLocal(data.time)}`, cpl));
  lines.push("-".repeat(Math.min(cpl, 32)));

  if (data.kind === "done") {
    lines.push(center("^^^DONE", cpl));
    kv(lines, "agent", data.agent, cpl);
    kv(lines, "repo", data.repo, cpl);
    kv(lines, "branch", data.branch, cpl);
    kv(lines, "time", formatLocal(data.time), cpl);
    if (data.duration) kv(lines, "dur", data.duration, cpl);
    if (data.gitShortstat) kv(lines, "diff", r(data.gitShortstat), cpl);
    if (data.summary) {
      lines.push("-".repeat(Math.min(cpl, 32)));
      for (const w of wrapLine(r(data.summary), cpl)) lines.push(escapeRl(w));
    }
  } else if (data.kind === "needs-you") {
    lines.push(center("^^^`NEEDS YOU`", cpl));
    kv(lines, "agent", data.agent, cpl);
    kv(lines, "event", data.event, cpl);
    if (data.request) {
      lines.push("-".repeat(Math.min(cpl, 32)));
      const req = oneLine(r(data.request), cpl);
      lines.push(`\`${escapeRl(req)}\``);
      const rest = wrapLine(r(data.request), cpl).slice(1);
      for (const w of rest) lines.push(escapeRl(w));
    }
  } else {
    lines.push(center("^^^SESSION", cpl));
    kv(lines, "agent", data.agent, cpl);
    if (data.reason) kv(lines, "reason", data.reason, cpl);
    kv(lines, "dur", data.duration ?? "n/a", cpl);
    kv(lines, "turns", String(data.turns ?? "n/a"), cpl);
    kv(lines, "tools", String(data.tools ?? "n/a"), cpl);
    kv(lines, "tokens", data.tokens ?? "n/a", cpl);
    kv(lines, "cost", data.cost ?? "n/a", cpl);
  }

  lines.push("-".repeat(Math.min(cpl, 32)));
  lines.push(center(code, cpl));
  if (opts.qr?.enabled && opts.qr.url) {
    const url = r(opts.qr.url).replace(/[;{}]/g, "");
    lines.push(`{code:${url}; option:qrcode, 3, m}`);
  }

  return { document: lines.join("\n"), sessionCode: code, cpl };
}

function kv(lines: string[], key: string, value: string | undefined, cpl: number): void {
  if (value === undefined || value === "") return;
  const keyW = Math.max(6, key.length);
  const valW = Math.max(8, cpl - keyW - 3);
  const wrapped = wrapLine(value, valW);
  const first = wrapped[0] ?? "";
  lines.push(`${escapeRl(key.padEnd(keyW))} | ${escapeRl(first)}`);
  for (const extra of wrapped.slice(1)) {
    lines.push(`${" ".repeat(keyW)} | ${escapeRl(extra)}`);
  }
}

function center(text: string, _cpl: number): string {
  return `| ${text} |`;
}

export function renderFromDocument(
  document: string,
  cpl: number,
): { svg: string; escpos: Buffer } {
  const svg = sanitizeSvg(
    receiptline.transform(document, {
      cpl,
      encoding: "multilingual",
      command: "svg",
      spacing: false,
      cutting: false,
    }),
  );
  const escposRaw = receiptline.transform(document, {
    cpl,
    encoding: "multilingual",
    command: "escpos",
    spacing: false,
    cutting: ESPOS_CUT,
  });
  const escpos = Buffer.from(escposRaw, "binary");
  return { svg, escpos };
}

/** System fonts only; stable filter ids so snapshots do not churn. */
export function sanitizeSvg(svg: string): string {
  return svg
    .replace(/@import url\("https:\/\/fonts\.googleapis\.com[^"]*"\);/g, "")
    .replace(/'Courier Prime', /g, "")
    .replace(/filter id="receipt-[^"]+"/g, 'filter id="receipt-ink"')
    .replace(/url\(#receipt-[^)]+\)/g, "url(#receipt-ink)");
}

export function renderSlip(
  data: SlipData,
  config: Pick<AgentslipConfig, "widthMm" | "qr" | "redaction">,
  ticketNo: number,
): RenderedSlip {
  const built = buildDocument(data, {
    widthMm: config.widthMm,
    ticketNo,
    qr: config.qr,
    redactEnabled: config.redaction.enabled,
  });
  const { svg, escpos } = renderFromDocument(built.document, built.cpl);
  return {
    document: built.document,
    svg,
    escpos,
    ticketNo,
    sessionCode: built.sessionCode,
  };
}

export const ESC_INIT = Buffer.from([0x1b, 0x40]);
export const GS_V_PARTIAL = Buffer.from([0x1d, 0x56]);
