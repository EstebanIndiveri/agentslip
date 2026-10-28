import fs from "node:fs";
import type { AgentslipConfig, AppState } from "./types.js";
import { statePath } from "./paths.js";
import { now } from "./clock.js";

const HOUR_MS = 60 * 60 * 1000;

export function loadState(): AppState {
  try {
    const raw = JSON.parse(fs.readFileSync(statePath(), "utf8")) as AppState;
    return {
      ticketSeq: Number(raw.ticketSeq) || 0,
      prints: Array.isArray(raw.prints) ? raw.prints : [],
      lastDoneSession: typeof raw.lastDoneSession === "string" ? raw.lastDoneSession : undefined,
      lastDoneAt: typeof raw.lastDoneAt === "number" ? raw.lastDoneAt : undefined,
    };
  } catch {
    return { ticketSeq: 0, prints: [] };
  }
}

export function saveState(state: AppState): void {
  const file = statePath();
  fs.mkdirSync(file.replace(/[/\\][^/\\]+$/, ""), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(state, null, 2));
}

export type GateResult =
  | { ok: true }
  | { ok: false; reason: "rate-limit" | "silent-hours" };

export function checkGate(config: AgentslipConfig, at: Date = now(), state: AppState = loadState()): GateResult {
  if (inSilentHours(at, config.rateLimit.silentHours)) {
    return { ok: false, reason: "silent-hours" };
  }
  const cutoff = at.getTime() - HOUR_MS;
  const recent = state.prints.filter((p) => p.t >= cutoff);
  if (recent.length >= config.rateLimit.maxPerHour) {
    return { ok: false, reason: "rate-limit" };
  }
  return { ok: true };
}

export function recordPrint(at: Date = now(), state: AppState = loadState()): AppState {
  const cutoff = at.getTime() - HOUR_MS;
  const next: AppState = {
    ticketSeq: state.ticketSeq + 1,
    prints: [...state.prints.filter((p) => p.t >= cutoff), { t: at.getTime() }],
    lastDoneSession: state.lastDoneSession,
    lastDoneAt: state.lastDoneAt,
  };
  saveState(next);
  return next;
}

export function recordDone(sessionId: string | undefined, at: Date, state: AppState = loadState()): AppState {
  if (!sessionId) return state;
  const next: AppState = {
    ...state,
    lastDoneSession: sessionId,
    lastDoneAt: at.getTime(),
  };
  saveState(next);
  return next;
}

export function inSilentHours(
  at: Date,
  window?: { start: string; end: string },
): boolean {
  if (!window) return false;
  const start = parseHm(window.start);
  const end = parseHm(window.end);
  if (start === null || end === null) return false;
  const cur = at.getHours() * 60 + at.getMinutes();
  if (start === end) return false;
  if (start < end) return cur >= start && cur < end;
  return cur >= start || cur < end;
}

function parseHm(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}
