import type { SlipData } from "../types.js";
import { now } from "../clock.js";
import { asRecord, detectAgent } from "./detect.js";
import { parseClaude } from "./claude.js";
import { parseCodex } from "./codex.js";

/**
 * Parse a hook JSON object into a slip. Returns null when the event is
 * unsupported or the payload is not an object. Callers must still exit 0.
 */
export async function parseHook(payload: unknown, at: Date = now()): Promise<SlipData | null> {
  const rec = asRecord(payload);
  if (!rec) return null;
  const agent = detectAgent(rec);
  if (agent === "Codex") return parseCodex(rec, at);
  if (agent === "Claude Code") return parseClaude(rec, at);

  // Ambiguous SessionEnd/Stop: try Claude then Codex (same event names).
  return (await parseClaude(rec, at)) ?? (await parseCodex(rec, at));
}
