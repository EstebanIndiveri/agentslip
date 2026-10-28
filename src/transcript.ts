/**
 * Transcript parsing is BEST EFFORT.
 *
 * Official hook docs (Claude Code, Codex) expose `transcript_path` but do not
 * document the file format. Fields below are assumed from public JSONL
 * conversation dumps and may change. Missing or unreadable files are ignored.
 *
 * MUTATION CHECK: reading a FIFO with readFileSync (no isFile guard) must hang
 * the FIFO test. Keep TRANSCRIPT_REQUIRE_REGULAR_FILE true.
 */
import fs from "node:fs";
import type { TranscriptStats } from "./types.js";

export const TRANSCRIPT_MAX_BYTES = 256 * 1024;
export const TRANSCRIPT_READ_MS = 200;
export const TRANSCRIPT_REQUIRE_REGULAR_FILE = true;

export async function readTranscript(transcriptPath: unknown): Promise<TranscriptStats | null> {
  if (typeof transcriptPath !== "string" || !transcriptPath) return null;
  try {
    const st = fs.statSync(transcriptPath);
    if (TRANSCRIPT_REQUIRE_REGULAR_FILE && !st.isFile()) return null;
    const size = st.size;
    if (size <= 0) return parseTranscriptJsonl("");
    const start = Math.max(0, size - TRANSCRIPT_MAX_BYTES);
    const len = Math.min(size, TRANSCRIPT_MAX_BYTES);
    const buf = Buffer.alloc(len);
    const fh = await fs.promises.open(transcriptPath, "r");
    try {
      const read = fh.read(buf, 0, len, start);
      read.catch(() => undefined);
      await Promise.race([
        read,
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("transcript read timeout")), TRANSCRIPT_READ_MS);
        }),
      ]);
    } finally {
      await fh.close().catch(() => undefined);
    }
    let raw = buf.toString("utf8");
    if (start > 0) {
      const nl = raw.indexOf("\n");
      if (nl >= 0) raw = raw.slice(nl + 1);
    }
    return parseTranscriptJsonl(raw);
  } catch {
    return null;
  }
}

export function parseTranscriptJsonl(raw: string): TranscriptStats {
  const stats: TranscriptStats = {};
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  let firstTs: number | undefined;
  let lastTs: number | undefined;
  let turns = 0;
  let tools = 0;
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;
  let cost: string | undefined;
  let lastAssistant: string | undefined;

  for (const line of lines) {
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    const ts = extractTs(obj);
    if (ts !== undefined) {
      if (firstTs === undefined || ts < firstTs) firstTs = ts;
      if (lastTs === undefined || ts > lastTs) lastTs = ts;
    }
    const type = String(obj.type ?? obj.role ?? "");
    if (type === "user" || type === "human") turns += 1;
    if (type === "assistant" || type === "agent") {
      const text = extractAssistantText(obj);
      if (text) lastAssistant = text;
    }
    tools += countTools(obj);
    const usage = findUsage(obj);
    if (usage) {
      if (typeof usage.input_tokens === "number") {
        inputTokens = (inputTokens ?? 0) + usage.input_tokens;
      }
      if (typeof usage.output_tokens === "number") {
        outputTokens = (outputTokens ?? 0) + usage.output_tokens;
      }
      const c = usage.cost_usd ?? usage.total_cost ?? usage.cost;
      if (typeof c === "number") cost = String(c);
      if (typeof c === "string" && c.trim()) cost = c.trim();
    }
  }

  if (firstTs !== undefined && lastTs !== undefined && lastTs >= firstTs) {
    stats.duration = formatDuration(lastTs - firstTs);
  }
  if (turns > 0) stats.turns = turns;
  if (tools > 0) stats.tools = tools;
  if (inputTokens !== undefined || outputTokens !== undefined) {
    const parts: string[] = [];
    if (inputTokens !== undefined) parts.push(`${inputTokens} in`);
    if (outputTokens !== undefined) parts.push(`${outputTokens} out`);
    stats.tokens = parts.join(" / ");
  }
  if (cost) stats.cost = cost;
  if (lastAssistant) stats.lastAssistant = lastAssistant;
  return stats;
}

function extractTs(obj: Record<string, unknown>): number | undefined {
  const v = obj.timestamp ?? obj.ts ?? obj.created_at;
  if (typeof v === "number" && Number.isFinite(v)) {
    return v < 1e12 ? v * 1000 : v;
  }
  if (typeof v === "string") {
    const d = Date.parse(v);
    if (!Number.isNaN(d)) return d;
  }
  return undefined;
}

function extractAssistantText(obj: Record<string, unknown>): string | undefined {
  const msg = obj.message;
  if (typeof msg === "string") return msg;
  if (msg && typeof msg === "object") {
    const content = (msg as Record<string, unknown>).content;
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      const texts = content
        .map((part) => {
          if (typeof part === "string") return part;
          if (part && typeof part === "object" && (part as { type?: string }).type === "text") {
            return String((part as { text?: string }).text ?? "");
          }
          return "";
        })
        .filter(Boolean);
      if (texts.length) return texts.join("\n");
    }
  }
  if (typeof obj.text === "string") return obj.text;
  return undefined;
}

function countTools(obj: Record<string, unknown>): number {
  const msg = obj.message;
  if (msg && typeof msg === "object") {
    const content = (msg as Record<string, unknown>).content;
    if (Array.isArray(content)) {
      return content.filter(
        (p) => p && typeof p === "object" && (p as { type?: string }).type === "tool_use",
      ).length;
    }
  }
  if (obj.type === "tool_use" || obj.type === "function_call") return 1;
  return 0;
}

function findUsage(obj: Record<string, unknown>): Record<string, unknown> | undefined {
  const direct = obj.usage;
  if (direct && typeof direct === "object") return direct as Record<string, unknown>;
  const msg = obj.message;
  if (msg && typeof msg === "object") {
    const u = (msg as Record<string, unknown>).usage;
    if (u && typeof u === "object") return u as Record<string, unknown>;
  }
  return undefined;
}

export function formatDuration(ms: number): string {
  if (ms < 0 || !Number.isFinite(ms)) return "";
  const sec = Math.round(ms / 1000);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
