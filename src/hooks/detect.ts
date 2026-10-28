import type { AgentName } from "../types.js";

/**
 * Heuristic agent detection from a hook payload.
 * Prefer documented discriminator fields; fall back to transcript_path.
 */
export function detectAgent(payload: Record<string, unknown>): AgentName {
  if (typeof payload.notification_type === "string") return "Claude Code";
  if (Array.isArray(payload.permission_suggestions)) return "Claude Code";
  if (typeof payload.prompt_id === "string") return "Claude Code";
  if (payload.background_tasks !== undefined || payload.session_crons !== undefined) {
    return "Claude Code";
  }
  if (typeof payload.turn_id === "string") return "Codex";
  if (typeof payload.model === "string") return "Codex";
  const tp = payload.transcript_path;
  if (typeof tp === "string") {
    if (tp.includes(".claude")) return "Claude Code";
    if (tp.includes(".codex") || tp.includes("rollout")) return "Codex";
  }
  return "n/a";
}

export function asRecord(input: unknown): Record<string, unknown> | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  return input as Record<string, unknown>;
}
