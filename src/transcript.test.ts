import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseTranscriptJsonl } from "./transcript.js";

describe("transcript (best effort)", () => {
  it("reads assumed JSONL usage and does not invent cost", () => {
    const raw = fs.readFileSync(
      path.join(process.cwd(), "fixtures/transcripts/claude-session.jsonl"),
      "utf8",
    );
    const stats = parseTranscriptJsonl(raw);
    expect(stats.tokens).toBe("2600 in / 300 out");
    expect(stats.tokens).toMatch(/out/);
    expect(stats.cost).toBeUndefined();
    expect(stats.turns).toBe(1);
    expect(stats.tools).toBe(1);
  });
});
