import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import type { AgentslipConfig, RenderedSlip, SlipData } from "../types.js";
import { formatLocal } from "../clock.js";
import { redact } from "../redact.js";
import { wrapLine } from "../wrap.js";
import { escapeRl } from "./escape.js";

const require = createRequire(import.meta.url);
const receiptline = require("receiptline") as {
  transform: (doc: string, printer?: Record<string, unknown>) => string;
};

/** MUTATION CHECK: set false so ESC/POS snapshots fail (no GS V). */
export const ESPOS_CUT = true;
/** MUTATION CHECK: drop this cap → NEEDS YOU 8-line test fails. */
export const NEEDS_YOU_MAX_LINES = 8;

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
    kv(lines, "repo", data.repo ? r(data.repo) : undefined, cpl);
    kv(lines, "branch", data.branch ? r(data.branch) : undefined, cpl);
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
    kv(lines, "event", eventLabel(data.event), cpl);
    if (data.request) {
      lines.push("-".repeat(Math.min(cpl, 32)));
      const wrapped = wrapLine(r(data.request), cpl);
      const hidden = Math.max(0, wrapped.length - NEEDS_YOU_MAX_LINES);
      const shown = wrapped.slice(0, NEEDS_YOU_MAX_LINES);
      if (shown[0] !== undefined) {
        lines.push(`\`${escapeRl(shown[0])}\``);
        for (const w of shown.slice(1)) lines.push(escapeRl(w));
      }
      if (hidden > 0) lines.push(escapeRl(`… (+${hidden} lines)`));
    }
  } else {
    lines.push(center("^^^SESSION", cpl));
    kv(lines, "agent", data.agent, cpl);
    if (data.reason) kv(lines, "reason", r(data.reason), cpl);
    kv(lines, "dur", data.duration ?? "n/a", cpl);
    kv(lines, "turns", String(data.turns ?? "n/a"), cpl);
    kv(lines, "tools", String(data.tools ?? "n/a"), cpl);
    kv(lines, "tokens", data.tokens ?? "n/a", cpl);
    kv(lines, "cost", data.cost ? r(data.cost) : "n/a", cpl);
  }

  lines.push("-".repeat(Math.min(cpl, 32)));
  lines.push(center(code, cpl));
  if (opts.qr?.enabled && opts.qr.url) {
    const url = r(opts.qr.url).replace(/[;{}]/g, "");
    lines.push(`{code:${url}; option:qrcode, 3, m}`);
  }

  return { document: lines.join("\n"), sessionCode: code, cpl };
}

/** Short labels so 58 mm receiptline columns do not split mid-word. */
export function eventLabel(event: string): string {
  switch (event) {
    case "PermissionRequest":
      return "perm-req";
    case "Notification":
      return "notify";
    case "SessionEnd":
      return "session-end";
    case "Stop":
      return "stop";
    default:
      return event;
  }
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
/** receiptline escpos cutting: GS V B NUL, then GS r 1 */
export const GS_R_1 = Buffer.from([0x1d, 0x72, 0x31]);

export function hasCutSequence(escpos: Buffer): boolean {
  const v = indexOf(escpos, GS_V_PARTIAL);
  if (v < 0) return false;
  const r = indexOf(escpos, GS_R_1, v);
  return r > v;
}

function indexOf(buf: Buffer, needle: Buffer, from = 0): number {
  for (let i = from; i <= buf.length - needle.length; i++) {
    if (buf.subarray(i, i + needle.length).equals(needle)) return i;
  }
  return -1;
}
