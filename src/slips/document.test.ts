import { describe, expect, it } from "vitest";
import {
  ESC_INIT,
  GS_V_PARTIAL,
  buildDocument,
  columnsFor,
  renderFromDocument,
  renderSlip,
} from "./document.js";
import type { SlipData } from "../types.js";
import { defaultConfig } from "../config.js";

const time = new Date("2026-10-27T15:00:00.000Z");

const done: SlipData = {
  kind: "done",
  agent: "Claude Code",
  event: "Stop",
  sessionId: "abc123",
  repo: "demo-app",
  branch: "main",
  time,
  duration: "4m 0s",
  gitShortstat: "1 file changed, 3 insertions(+)",
  summary: "I've completed the refactoring. Here's a summary...",
};

const needs: SlipData = {
  kind: "needs-you",
  agent: "Claude Code",
  event: "PermissionRequest",
  sessionId: "abc123",
  time,
  request: "Bash: rm -rf node_modules",
};

const session: SlipData = {
  kind: "session",
  agent: "Codex",
  event: "SessionEnd",
  sessionId: "thr_123",
  time,
  duration: "n/a",
  turns: "n/a",
  tools: "n/a",
  tokens: "n/a",
  cost: "n/a",
  reason: "other",
};

describe("document", () => {
  it("uses 32 columns at 58mm and 48 at 80mm", () => {
    expect(columnsFor(58)).toBe(32);
    expect(columnsFor(80)).toBe(48);
  });

  it("truncates a long request", () => {
    const long: SlipData = {
      ...needs,
      request: "Bash: " + "word ".repeat(40),
    };
    const doc = buildDocument(long, { widthMm: 58, ticketNo: 1 }).document;
    expect(doc.split("\n").some((l) => l.length > 80)).toBe(false);
  });

  it("omits summary when missing", () => {
    const { document } = buildDocument({ ...done, summary: undefined }, { widthMm: 58, ticketNo: 1 });
    expect(document).not.toMatch(/completed the refactoring/);
  });
});

describe("snapshots from the same receiptline document", () => {
  const cases: [string, SlipData, 58 | 80][] = [
    ["done-58", done, 58],
    ["done-80", done, 80],
    ["needs-you-58", needs, 58],
    ["needs-you-80", needs, 80],
    ["session-58", session, 58],
    ["session-80", session, 80],
  ];

  for (const [name, data, width] of cases) {
    it(`${name} SVG and ESC/POS`, async () => {
      const cfg = { ...defaultConfig(), widthMm: width };
      const rendered = renderSlip(data, cfg, 1);
      const again = renderFromDocument(rendered.document, width === 80 ? 48 : 32);
      expect(again.svg).toBe(rendered.svg);
      expect(again.escpos.equals(rendered.escpos)).toBe(true);
      expect(rendered.escpos.subarray(0, 2).equals(ESC_INIT)).toBe(true);
      expect(rendered.escpos.includes(GS_V_PARTIAL)).toBe(true);
      expect(rendered.svg).not.toContain("fonts.googleapis.com");
      await expect(rendered.svg).toMatchFileSnapshot(`../../test/__snapshots__/${name}.svg`);
      await expect(rendered.escpos.toString("hex")).toMatchFileSnapshot(
        `../../test/__snapshots__/${name}.escpos.hex`,
      );
    });
  }
});
