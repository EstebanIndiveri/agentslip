/**
 * Claude Code hook parser.
 * Payload shapes verified against https://code.claude.com/docs/en/hooks (fetched 2026-10-28).
 * Transcript contents are best-effort (format not documented).
 */
import type { SlipData } from "../types.js";
import { now } from "../clock.js";
import { gitInfo } from "../gitinfo.js";
import { readTranscript } from "../transcript.js";
import { asRecord } from "./detect.js";
import { applyTranscript, summarize } from "./shared.js";

const EVENTS = new Set(["Stop", "Notification", "PermissionRequest", "SessionEnd"]);

export function parseClaude(payload: unknown, at: Date = now()): SlipData | null {
  const p = asRecord(payload);
  if (!p) return null;
  const event = p.hook_event_name;
  if (typeof event !== "string" || !EVENTS.has(event)) return null;

  const cwd = typeof p.cwd === "string" ? p.cwd : undefined;
  const git = gitInfo(cwd);
  const tx = readTranscript(p.transcript_path);

  const base: SlipData = {
    kind: "done",
    agent: "Claude Code",
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

  if (event === "Notification") {
    base.kind = "needs-you";
    const type = typeof p.notification_type === "string" ? p.notification_type : "notification";
    const msg = typeof p.message === "string" ? p.message : undefined;
    const title = typeof p.title === "string" ? p.title : undefined;
    base.request = [type, title, msg].filter(Boolean).join(": ");
    return base;
  }

  if (event === "PermissionRequest") {
    base.kind = "needs-you";
    const tool = typeof p.tool_name === "string" ? p.tool_name : "tool";
    const detail = toolDetail(p.tool_input);
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

function toolDetail(input: unknown): string | undefined {
  if (!input || typeof input !== "object") return undefined;
  const o = input as Record<string, unknown>;
  if (typeof o.command === "string") return o.command;
  if (typeof o.description === "string") return o.description;
  try {
    return JSON.stringify(o);
  } catch {
    return undefined;
  }
}
