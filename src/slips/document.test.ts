import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ESC_INIT,
  buildDocument,
  columnsFor,
  hasCutSequence,
  kvColumnWidth,
  renderFromDocument,
  renderSlip,
} from "./document.js";
import type { SlipData } from "../types.js";
import { defaultConfig } from "../config.js";
import { compactShortstat } from "../gitinfo.js";
import { parseHook } from "../hooks/parse.js";

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
  it("redacts secrets in transcript cost strings", () => {
    const { document } = buildDocument(
      { ...session, cost: "API_KEY=exampleSecretValue" },
      { widthMm: 58, ticketNo: 1 },
    );
    expect(document).not.toContain("exampleSecretValue");
    expect(document).toContain("[redacted]");
  });

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

  it("caps NEEDS YOU request at 8 wrapped lines plus a leftover count", () => {
    const long: SlipData = {
      ...needs,
      request: "Bash:\n" + "word\n".repeat(400),
    };
    const doc = buildDocument(long, { widthMm: 58, ticketNo: 1 }).document;
    const lines = doc.split("\n");
    const start = lines.findIndex((l) => l.startsWith("`"));
    const leftover = lines.findIndex((l) => /… \(\+\d+ lines\)/.test(l));
    expect(start).toBeGreaterThan(-1);
    expect(leftover).toBeGreaterThan(start);
    const content = lines.slice(start, leftover);
    expect(content.length).toBeGreaterThan(0);
    expect(content.length).toBeLessThanOrEqual(8);
    const m = doc.match(/… \(\+(\d+) lines\)/);
    expect(Number(m?.[1])).toBeGreaterThan(8);
  });

  it("omits summary when missing", () => {
    const { document } = buildDocument({ ...done, summary: undefined }, { widthMm: 58, ticketNo: 1 });
    expect(document).not.toMatch(/completed the refactoring/);
  });

  it("abbreviates PermissionRequest so 58mm does not split mid-word", () => {
    const { document } = buildDocument(needs, { widthMm: 58, ticketNo: 1 });
    expect(document).toContain("perm");
    expect(document).toContain("req");
    expect(document).not.toContain("PermissionRequest");
    expect(document).not.toContain("PermissionReques");
    const rendered = renderSlip(needs, defaultConfig(), 1);
    const text = rendered.svg.replace(/<[^>]+>/g, "").replace(/&#xa0;/g, " ");
    expect(text).toContain("perm");
    expect(text).toContain("req");
    expect(text).not.toContain("PermissionReques");
  });

  it("ESC/POS cut is GS V then GS r 1", () => {
    const rendered = renderSlip(done, defaultConfig(), 1);
    expect(hasCutSequence(rendered.escpos)).toBe(true);
    const hex = rendered.escpos.toString("hex");
    expect(hex).toMatch(/1d5642.*1d7231/);
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
      expect(hasCutSequence(rendered.escpos)).toBe(true);
      expect(rendered.svg).not.toContain("fonts.googleapis.com");
      await expect(rendered.svg).toMatchFileSnapshot(`../../test/__snapshots__/${name}.svg`);
      await expect(rendered.escpos.toString("hex")).toMatchFileSnapshot(
        `../../test/__snapshots__/${name}.escpos.hex`,
      );
    });
  }
});

const sessionWithTokens: SlipData = {
  ...session,
  duration: "4m 0s",
  turns: 1,
  tools: 1,
  tokens: "2600 in / 300 out",
  cost: "n/a",
};

function svgTextLines(svg: string): string[] {
  const rows = [...svg.matchAll(/<g transform="translate\(0,(\d+)\)">([\s\S]*?)<\/g>/g)];
  const byY = new Map<number, string>();
  for (const m of rows) {
    const y = Number(m[1]);
    const chars = [...m[2].matchAll(/>([^<]*)<\/tspan>/g)]
      .map((t) => t[1].replace(/&#xa0;/g, " "))
      .join("");
    if (!chars.replace(/\s/g, "")) continue;
    byY.set(y, `${byY.get(y) ?? ""}${chars}`);
  }
  return [...byY.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, t]) => t);
}

function midWordSplits(lines: string[], haystack: string): string[] {
  const hits: string[] = [];
  const hay = haystack.replace(/\s+/g, " ");
  for (let i = 1; i < lines.length; i++) {
    const prev = lines[i - 1].replace(/\s+$/, "");
    const next = lines[i].replace(/^\s+/, "");
    const left = prev.match(/[A-Za-z0-9]+$/);
    const right = next.match(/^[A-Za-z0-9]+/);
    if (!left || !right) continue;
    const word = `${left[0]}${right[0]}`;
    if (word.length < 3) continue;
    if (hay.includes(word)) hits.push(`${left[0]}|${right[0]}`);
  }
  return hits;
}

function fieldHaystack(data: SlipData): string {
  return [
    data.agent,
    data.event,
    data.repo,
    data.branch,
    data.summary,
    data.request,
    data.gitShortstat,
    data.gitShortstat ? compactShortstat(data.gitShortstat) : "",
    data.tokens,
    data.cost,
    data.duration,
    data.reason,
    data.turns === undefined ? "" : String(data.turns),
    data.tools === undefined ? "" : String(data.tools),
    "AGENTSLIP",
    "DONE",
    "SESSION",
    "perm-req",
    "notify",
    "insertions",
    "out",
  ].join(" ");
}

describe("two-column values never split a word", () => {
  it("uses receiptline's equal-column width", () => {
    expect(kvColumnWidth(32)).toBe(16);
    expect(kvColumnWidth(48)).toBe(24);
  });

  it("prints a compact shortstat on DONE", () => {
    const { document } = buildDocument(done, { widthMm: 58, ticketNo: 1 });
    expect(document).toMatch(/1 file, \+3 \\-0/);
    expect(document).not.toContain("insertions");
  });

  it("keeps 'out' intact on a 58 mm SESSION token row", () => {
    const rendered = renderSlip(sessionWithTokens, defaultConfig(), 1);
    const lines = svgTextLines(rendered.svg);
    expect(lines.join(" ")).toMatch(/300\s+out/);
    expect(midWordSplits(lines, fieldHaystack(sessionWithTokens))).toEqual([]);
  });

  it("falls back to a single column when a token is wider than the value column", () => {
    const long: SlipData = { ...done, repo: "supercalifragilistic" };
    const { document } = buildDocument(long, { widthMm: 58, ticketNo: 1 });
    expect(document).toMatch(/^repo$/m);
    expect(document).toContain("supercalifragilistic");
    expect(document).not.toMatch(/repo\s+\|/);
  });

  const canned: [string, SlipData][] = [
    ["done", done],
    ["needs-you", needs],
    ["session", session],
    ["session-tokens", sessionWithTokens],
  ];

  for (const width of [58, 80] as const) {
    for (const [name, data] of canned) {
      it(`${name} at ${width} mm`, () => {
        const cfg = { ...defaultConfig(), widthMm: width };
        const rendered = renderSlip(data, cfg, 1);
        const splits = midWordSplits(svgTextLines(rendered.svg), fieldHaystack(data));
        expect(splits, `${name} ${width} mm split ${splits.join(",")}`).toEqual([]);
      });
    }
  }

  const fixtureFiles = [
    "fixtures/claude-code/stop.json",
    "fixtures/claude-code/stop-sparse.json",
    "fixtures/claude-code/notification.json",
    "fixtures/claude-code/permission-request.json",
    "fixtures/claude-code/session-end.json",
    "fixtures/codex/stop.json",
    "fixtures/codex/permission-request.json",
    "fixtures/codex/session-end.json",
  ];

  for (const rel of fixtureFiles) {
    for (const width of [58, 80] as const) {
      it(`${rel} at ${width} mm`, async () => {
        const prev = {
          repo: process.env.AGENTSLIP_GIT_REPO,
          branch: process.env.AGENTSLIP_GIT_BRANCH,
          stat: process.env.AGENTSLIP_GIT_SHORTSTAT,
        };
        process.env.AGENTSLIP_GIT_REPO = "demo-app";
        process.env.AGENTSLIP_GIT_BRANCH = "main";
        process.env.AGENTSLIP_GIT_SHORTSTAT = "1 file changed, 3 insertions(+)";
        try {
          const payload = JSON.parse(fs.readFileSync(path.join(process.cwd(), rel), "utf8")) as Record<
            string,
            unknown
          >;
          if (rel.includes("session-end")) {
            payload.transcript_path = path.join(
              process.cwd(),
              "fixtures/transcripts/claude-session.jsonl",
            );
          }
          const data = await parseHook(payload, time);
          expect(data).not.toBeNull();
          if (!data) return;
          const cfg = { ...defaultConfig(), widthMm: width };
          const rendered = renderSlip(data, cfg, 1);
          const splits = midWordSplits(svgTextLines(rendered.svg), fieldHaystack(data));
          expect(splits, `${rel} ${width} mm split ${splits.join(",")}`).toEqual([]);
        } finally {
          if (prev.repo === undefined) delete process.env.AGENTSLIP_GIT_REPO;
          else process.env.AGENTSLIP_GIT_REPO = prev.repo;
          if (prev.branch === undefined) delete process.env.AGENTSLIP_GIT_BRANCH;
          else process.env.AGENTSLIP_GIT_BRANCH = prev.branch;
          if (prev.stat === undefined) delete process.env.AGENTSLIP_GIT_SHORTSTAT;
          else process.env.AGENTSLIP_GIT_SHORTSTAT = prev.stat;
        }
      });
    }
  }
});
