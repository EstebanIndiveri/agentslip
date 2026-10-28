import type { SlipData, TranscriptStats } from "../types.js";

export function summarize(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const line = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  return line || undefined;
}

export function applyTranscript(data: SlipData, tx: TranscriptStats | null): void {
  if (!tx) return;
  if (tx.truncated) return;
  if (!data.duration && tx.duration) data.duration = tx.duration;
  if (data.kind === "session") {
    if (tx.turns !== undefined) data.turns = tx.turns;
    if (tx.tools !== undefined) data.tools = tx.tools;
    if (tx.tokens) data.tokens = tx.tokens;
    if (tx.cost) data.cost = tx.cost;
  }
}
