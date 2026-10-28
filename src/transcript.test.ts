import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseTranscriptJsonl, readTranscript, TRANSCRIPT_MAX_BYTES } from "./transcript.js";

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

describe("readTranscript regular-file guard", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  });

  it("skips a FIFO and returns null without hanging", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agentslip-fifo-"));
    dirs.push(dir);
    const fifo = path.join(dir, "tx.fifo");
    execFileSync("mkfifo", [fifo]);
    const started = Date.now();
    const stats = await readTranscript(fifo);
    const ms = Date.now() - started;
    expect(stats).toBeNull();
    expect(ms).toBeLessThan(500);
  }, 2000);

  it("reads only the tail of a large file", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agentslip-big-"));
    dirs.push(dir);
    const file = path.join(dir, "tx.jsonl");
    const head =
      '{"type":"assistant","timestamp":"2026-10-27T14:00:00.000Z","message":{"role":"assistant","content":[{"type":"text","text":"HEAD_ONLY_MARKER"}],"usage":{"input_tokens":999999,"output_tokens":1}}}\n';
    const padLine =
      '{"type":"user","timestamp":"2026-10-27T14:01:00.000Z","message":{"role":"user","content":"pad"}}\n';
    const tail =
      '{"type":"assistant","timestamp":"2026-10-27T14:52:00.000Z","message":{"role":"assistant","content":[{"type":"text","text":"TAIL_MARKER"}],"usage":{"input_tokens":42,"output_tokens":7}}}\n';
    let pad = "";
    while (Buffer.byteLength(head + pad + tail) < TRANSCRIPT_MAX_BYTES + 64 * 1024) {
      pad += padLine;
    }
    fs.writeFileSync(file, head + pad + tail);
    expect(fs.statSync(file).size).toBeGreaterThan(TRANSCRIPT_MAX_BYTES);
    const started = Date.now();
    const stats = await readTranscript(file);
    const ms = Date.now() - started;
    expect(ms).toBeLessThan(500);
    expect(stats?.lastAssistant).toBe("TAIL_MARKER");
    expect(stats?.lastAssistant).not.toBe("HEAD_ONLY_MARKER");
    expect(stats?.truncated).toBe(true);
    expect(stats?.tokens).toBeUndefined();
    expect(stats?.turns).toBeUndefined();
    expect(stats?.tools).toBeUndefined();
    expect(stats?.duration).toBeUndefined();
    expect(stats?.cost).toBeUndefined();
    expect(stats?.tokens).not.toMatch(/999999/);
  });
});
