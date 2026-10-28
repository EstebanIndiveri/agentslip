/**
 * Codex hook parser.
 * Payload shapes verified against https://learn.chatgpt.com/docs/hooks (fetched 2026-10-28).
 * Transcript contents are best-effort (docs: "the transcript format isn’t a stable interface").
 */
import type { SlipData } from "../types.js";
import { now } from "../clock.js";
import { gitInfo } from "../gitinfo.js";
import { readTranscript } from "../transcript.js";
import { asRecord } from "./detect.js";
import { applyTranscript, summarize } from "./shared.js";

const EVENTS = new Set(["Stop", "PermissionRequest", "SessionEnd"]);

export async function parseCodex(payload: unknown, at: Date = now()): Promise<SlipData | null> {
  const p = asRecord(payload);
  if (!p) return null;
  const event = p.hook_event_name;
  if (typeof event !== "string" || !EVENTS.has(event)) return null;

  const cwd = typeof p.cwd === "string" ? p.cwd : undefined;
  const git = gitInfo(cwd);
  const tx = await readTranscript(p.transcript_path);

  const base: SlipData = {
    kind: "done",
    agent: "Codex",
    event,
    sessionId: typeof p.session_id === "string" ? p.session_id : undefined,
    cwd,
    repo: git.repo,
    branch: git.branch,
    gitShortstat: git.shortstat,
    time: at,
  };

  if (event === "Stop") {
    base.kind = "done";
    const last =
      typeof p.last_assistant_message === "string" ? p.last_assistant_message : tx?.lastAssistant;
    base.summary = summarize(last);
    applyTranscript(base, tx);
    return base;
  }

  if (event === "PermissionRequest") {
    base.kind = "needs-you";
    const tool = typeof p.tool_name === "string" ? p.tool_name : "tool";
    const input = p.tool_input;
    let detail: string | undefined;
    if (input && typeof input === "object") {
      const o = input as Record<string, unknown>;
      if (typeof o.command === "string") detail = o.command;
      else if (typeof o.description === "string") detail = o.description;
      else {
        try {
          detail = JSON.stringify(o);
        } catch {
          detail = undefined;
        }
      }
    }
    base.request = detail ? `${tool}: ${detail}` : tool;
    return base;
  }

  base.kind = "session";
  if (typeof p.reason === "string") base.reason = p.reason;
  applyTranscript(base, tx);
  if (base.turns === undefined) base.turns = "n/a";
  if (base.tools === undefined) base.tools = "n/a";
  if (!base.tokens) base.tokens = "n/a";
  if (!base.cost) base.cost = "n/a";
  return base;
}
