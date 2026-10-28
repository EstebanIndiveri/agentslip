export type AgentName = "Claude Code" | "Codex" | "n/a";

export type SlipKind = "done" | "needs-you" | "session";

export type DriverName = "virtual" | "escpos-tcp" | "file";

export type PaperWidthMm = 58 | 80;

export type SlipData = {
  kind: SlipKind;
  agent: AgentName;
  event: string;
  sessionId?: string;
  cwd?: string;
  repo?: string;
  branch?: string;
  time: Date;
  duration?: string;
  gitShortstat?: string;
  summary?: string;
  request?: string;
  turns?: number | "n/a";
  tools?: number | "n/a";
  tokens?: string;
  cost?: string;
  reason?: string;
};

export type TranscriptStats = {
  /** Best-effort: duration from first/last timestamps if present. */
  duration?: string;
  /** Best-effort: count of user or assistant turns if present. */
  turns?: number;
  /** Best-effort: count of tool uses if present. */
  tools?: number;
  /** Only when the transcript includes token counts. Never estimated. */
  tokens?: string;
  /** Only when the transcript includes a cost field. Never estimated. */
  cost?: string;
  /** Best-effort last assistant text if the payload did not include it. */
  lastAssistant?: string;
  /** True when only the last 256 KB of the file was read. Counts are omitted. */
  truncated?: boolean;
};

export type AgentslipConfig = {
  driver: DriverName;
  widthMm: PaperWidthMm;
  escpos: {
    host: string;
    port: number;
  };
  file: {
    path: string;
  };
  virtual: {
    slipsDir?: string;
  };
  rateLimit: {
    maxPerHour: number;
    silentHours?: {
      start: string;
      end: string;
    };
  };
  qr: {
    enabled: boolean;
    url?: string;
  };
  redaction: {
    enabled: boolean;
  };
};

export type AppState = {
  ticketSeq: number;
  prints: { t: number }[];
  /** Session id of the last successful DONE slip, for idle_prompt dedupe. */
  lastDoneSession?: string;
  lastDoneAt?: number;
};

export type RenderedSlip = {
  document: string;
  svg: string;
  escpos: Buffer;
  ticketNo: number;
  sessionCode: string;
};
