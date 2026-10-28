import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseHook } from "./parse.js";
import { TRANSCRIPT_MAX_BYTES } from "../transcript.js";

const frozen = new Date("2026-10-27T15:00:00.000Z");

function load(rel: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), rel), "utf8"));
}

describe("parsers", () => {
  it("Claude Code Stop -> DONE with summary", async () => {
    process.env.AGENTSLIP_GIT_REPO = "my-project";
    process.env.AGENTSLIP_GIT_BRANCH = "main";
    process.env.AGENTSLIP_GIT_SHORTSTAT = "1 file changed, 3 insertions(+)";
    const d = await parseHook(load("fixtures/claude-code/stop.json"), frozen);
    expect(d?.kind).toBe("done");
    expect(d?.agent).toBe("Claude Code");
    expect(d?.event).toBe("Stop");
    expect(d?.summary).toMatch(/completed the refactoring/i);
    expect(d?.repo).toBe("my-project");
    expect(d?.branch).toBe("main");
    expect(d?.gitShortstat).toMatch(/1 file changed/);
  });

  it("Claude Code Notification -> NEEDS YOU", async () => {
    const d = await parseHook(load("fixtures/claude-code/notification.json"), frozen);
    expect(d?.kind).toBe("needs-you");
    expect(d?.request).toMatch(/permission_prompt/);
  });

  it("Claude Code PermissionRequest -> NEEDS YOU with tool", async () => {
    const d = await parseHook(load("fixtures/claude-code/permission-request.json"), frozen);
    expect(d?.kind).toBe("needs-you");
    expect(d?.request).toMatch(/^Bash:/);
    expect(d?.request).toMatch(/rm -rf node_modules/);
  });

  it("Claude Code SessionEnd -> SESSION with n/a tokens", async () => {
    const d = await parseHook(load("fixtures/claude-code/session-end.json"), frozen);
    expect(d?.kind).toBe("session");
    expect(d?.tokens).toBe("n/a");
    expect(d?.cost).toBe("n/a");
    expect(d?.reason).toBe("other");
  });

  it("sparse Stop omits summary and still parses", async () => {
    const d = await parseHook(load("fixtures/claude-code/stop-sparse.json"), frozen);
    expect(d?.kind).toBe("done");
    expect(d?.summary).toBeUndefined();
  });

  it("Codex Stop -> DONE", async () => {
    const d = await parseHook(load("fixtures/codex/stop.json"), frozen);
    expect(d?.kind).toBe("done");
    expect(d?.agent).toBe("Codex");
    expect(d?.summary).toMatch(/All tests passed/);
  });

  it("Codex PermissionRequest -> NEEDS YOU", async () => {
    const d = await parseHook(load("fixtures/codex/permission-request.json"), frozen);
    expect(d?.kind).toBe("needs-you");
    expect(d?.agent).toBe("Codex");
    expect(d?.request).toMatch(/npm publish/);
  });

  it("Codex SessionEnd -> SESSION", async () => {
    const d = await parseHook(load("fixtures/codex/session-end.json"), frozen);
    expect(d?.kind).toBe("session");
    expect(d?.agent).toBe("Codex");
    expect(d?.cost).toBe("n/a");
  });

  it("returns null for unknown events", async () => {
    expect(await parseHook({ hook_event_name: "PreToolUse" }, frozen)).toBeNull();
  });

  it("truncated transcript does not copy tail sums as session totals", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agentslip-tx-"));
    const file = path.join(dir, "tx.jsonl");
    const pad =
      '{"type":"user","timestamp":"2026-10-27T14:00:00.000Z","message":{"role":"user","content":"pad"}}\n';
    const tail =
      '{"type":"assistant","timestamp":"2026-10-27T14:52:00.000Z","message":{"role":"assistant","content":[{"type":"text","text":"TAIL"}],"usage":{"input_tokens":42,"output_tokens":7}}}\n';
    let body = "";
    while (Buffer.byteLength(body + tail) <= TRANSCRIPT_MAX_BYTES) body += pad;
    fs.writeFileSync(file, body + tail);
    const payload = load("fixtures/claude-code/session-end.json") as Record<string, unknown>;
    payload.transcript_path = file;
    let d;
    try {
      d = await parseHook(payload, frozen);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    expect(d?.kind).toBe("session");
    expect(d?.tokens).toBe("n/a");
    expect(d?.cost).toBe("n/a");
    expect(d?.turns).toBe("n/a");
    expect(d?.tools).toBe("n/a");
    expect(d?.duration).toBeUndefined();
  });

  it("best-effort transcript fills tokens and leaves cost n/a", async () => {
    const payload = load("fixtures/claude-code/session-end.json") as Record<string, unknown>;
    payload.transcript_path = path.join(process.cwd(), "fixtures/transcripts/claude-session.jsonl");
    const d = await parseHook(payload, frozen);
    expect(d?.tokens).toMatch(/in/);
    expect(d?.cost).toBe("n/a");
    expect(d?.turns).toBe(1);
    expect(d?.tools).toBe(1);
    expect(d?.duration).toMatch(/m/);
  });
});
