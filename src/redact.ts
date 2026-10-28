/**
 * Secret redaction. Runs before any ticket is rendered.
 *
 * MUTATION CHECK: set REDACTION_ENABLED to false and the redaction tests must fail.
 */
export const REDACTION_ENABLED = true;

const API_KEY_PATTERNS: RegExp[] = [
  /\bsk-[a-zA-Z0-9_-]{10,}\b/g,
  /\bsk-ant-[a-zA-Z0-9_-]{10,}\b/g,
  /\bghp_[a-zA-Z0-9]{20,}\b/g,
  /\bgithub_pat_[a-zA-Z0-9_]{20,}\b/g,
  /\bxox[baprs]-[a-zA-Z0-9-]{10,}\b/g,
  /\bAKIA[0-9A-Z]{8,}\b/g,
  /\bAIza[0-9A-Za-z_-]{20,}\b/g,
  /\bnpm_[a-zA-Z0-9]{20,}\b/g,
  /\bBearer\s+[a-zA-Z0-9._\-+=/]{8,}\b/gi,
  /\beyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/g,
];

const CRED_URL = /\bhttps?:\/\/[^/\s:'"]+:[^@/\s'"]+@/gi;
const ENV_ASSIGN = /\b([A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|API_KEY))\s*[=:]\s*([^\s,;]+)/gi;
const JSON_SECRET = /("(?:[A-Z0-9_]+(?:KEY|TOKEN|SECRET|PASSWORD))"\s*:\s*")([^"]+)(")/gi;

const LONG_LINE = 160;

export function redact(text: string, enabled = REDACTION_ENABLED): string {
  if (!enabled || text.length === 0) return text;
  let out = text;
  for (const re of API_KEY_PATTERNS) {
    re.lastIndex = 0;
    out = out.replace(re, "[redacted]");
  }
  out = out.replace(CRED_URL, (m) => m.replace(/\/\/[^@]+@/, "//[redacted]@"));
  out = out.replace(ENV_ASSIGN, "$1=[redacted]");
  out = out.replace(JSON_SECRET, "$1[redacted]$3");
  out = redactEnvBlock(out);
  return truncateLongLines(out);
}

function redactEnvBlock(text: string): string {
  // Typical .env lines: NAME=value (skip comments and empty)
  return text
    .split(/\r?\n/)
    .map((line) => {
      const m = line.match(/^(\s*(?:export\s+)?[A-Z][A-Z0-9_]*)\s*=\s*(.+)$/);
      if (!m) return line;
      const name = m[1].replace(/^\s*(?:export\s+)?/, "");
      if (/(KEY|TOKEN|SECRET|PASSWORD|PASSWD)$/i.test(name) || name === "DATABASE_URL") {
        return `${m[1]}=[redacted]`;
      }
      return line;
    })
    .join("\n");
}

function truncateLongLines(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => (line.length > LONG_LINE ? `${line.slice(0, LONG_LINE - 1)}…` : line))
    .join("\n");
}

export function redactSlipFields<T extends Record<string, unknown>>(data: T, enabled = REDACTION_ENABLED): T {
  const out = { ...data };
  for (const [k, v] of Object.entries(out)) {
    if (typeof v === "string") (out as Record<string, unknown>)[k] = redact(v, enabled);
  }
  return out;
}
