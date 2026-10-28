import { redactDeep } from "../redact.js";
import type { SlipData, TranscriptStats } from "../types.js";

export function summarize(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const line = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  return line || undefined;
}

/**
 * Format Write / unknown tool_input for the slip.
 * MUTATION CHECK: stringify `input` without redactDeep → Write escaped-JSON leak tests fail.
 */
export function toolDetail(input: unknown): string | undefined {
  if (!input || typeof input !== "object") return undefined;
  const o = redactDeep(input) as Record<string, unknown>;
  if (typeof o.command === "string") return o.command;
  if (typeof o.description === "string") return o.description;
  try {
    return JSON.stringify(o);
  } catch {
    return undefined;
  }
}

export function applyTranscript(data: SlipData, tx: TranscriptStats | null): void {
  if (!tx) return;
  if (!data.duration && tx.duration) data.duration = tx.duration;
  if (data.kind === "session") {
    if (tx.turns !== undefined) data.turns = tx.turns;
    if (tx.tools !== undefined) data.tools = tx.tools;
    if (tx.tokens) data.tokens = tx.tokens;
    if (tx.cost) data.cost = tx.cost;
  }
}
