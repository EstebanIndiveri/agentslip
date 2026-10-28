/**
 * Secret redaction. Runs before any ticket is rendered.
 *
 * MUTATION CHECK: set REDACTION_ENABLED to false and the redaction tests must fail.
 * MUTATION CHECK: set defaultConfig().redaction.enabled to false and leak tests must fail.
 */
export const REDACTION_ENABLED = true;

const API_KEY_PATTERNS: RegExp[] = [
  /\bsk-[a-zA-Z0-9_-]{10,}\b/g,
  /\bsk-ant-[a-zA-Z0-9_-]{10,}\b/g,
  /\bsk_live_[a-zA-Z0-9]{8,}\b/g,
  /\brk_live_[a-zA-Z0-9]{8,}\b/g,
  /\bghp_[a-zA-Z0-9]{20,}\b/g,
  /\bgho_[a-zA-Z0-9]{20,}\b/g,
  /\bghs_[a-zA-Z0-9]{20,}\b/g,
  /\bghu_[a-zA-Z0-9]{20,}\b/g,
  /\bghr_[a-zA-Z0-9]{20,}\b/g,
  /\bgithub_pat_[a-zA-Z0-9_]{20,}\b/g,
  /\bglpat-[a-zA-Z0-9_\-]{10,}\b/g,
  /\bhf_[a-zA-Z0-9]{10,}\b/g,
  /\bxox[baprs]-[a-zA-Z0-9-]{10,}\b/g,
  /\bAKIA[0-9A-Z]{8,}\b/g,
  /\bAIza[0-9A-Za-z_-]{20,}\b/g,
  /\bnpm_[a-zA-Z0-9]{20,}\b/g,
  /\bBearer\s+[a-zA-Z0-9._\-+=/]{8,}\b/gi,
  /\bAuthorization:\s*Basic\s+[A-Za-z0-9+/=]+\b/gi,
  /\beyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/g,
];

const CRED_URL = /[a-zA-Z][a-zA-Z0-9+.-]*:\/\/(?:[^/\s@]*:[^@/\s]+@)/g;
/** Underscore-suffixed secret names, or those names as a whole identifier. */
const SECRET_IDENT =
  "(?:[A-Za-z_][A-Za-z0-9_]*_(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|PASS)|PASSWORD|SECRET|TOKEN|PASSWD|PASS|KEY)";
const ENV_ASSIGN = new RegExp(String.raw`\b(${SECRET_IDENT})\s*[=:]\s*([^\s,;]+)`, "gi");
const JSON_SECRET = new RegExp(
  String.raw`("(?:[A-Za-z0-9_]+_(?:KEY|TOKEN|SECRET|PASSWORD|PASS)|PASSWORD|SECRET|TOKEN|PASS)"\s*:\s*")([^"]+)(")`,
  "gi",
);
const FLAG_PASSWORD = /--password(?:=|\s+)\S+/gi;
const PEM_BLOCK =
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g;
const SLACK_WEBHOOK = /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/_-]+/gi;
const MYSQL_DASH_P = /\bmysql\b[^\n]*/gi;

const LONG_LINE = 160;

const ENV_NAME_SECRET =
  /(_(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|PASS)|^(?:PASSWORD|SECRET|TOKEN|PASSWD|PASS|KEY))$/i;

export function redact(text: string, enabled = true): string {
  if (!REDACTION_ENABLED || !enabled || text.length === 0) return text;
  let out = text;
  out = out.replace(PEM_BLOCK, "[redacted]");
  for (const re of API_KEY_PATTERNS) {
    re.lastIndex = 0;
    out = out.replace(re, "[redacted]");
  }
  out = out.replace(CRED_URL, (m) => m.replace(/\/\/[^@]*@/, "//[redacted]@"));
  out = out.replace(ENV_ASSIGN, "$1=[redacted]");
  out = out.replace(JSON_SECRET, "$1[redacted]$3");
  out = out.replace(FLAG_PASSWORD, "--password=[redacted]");
  out = out.replace(SLACK_WEBHOOK, "[redacted]");
  out = out.replace(MYSQL_DASH_P, (cmd) => cmd.replace(/\s-p\S+/g, " -p[redacted]"));
  out = redactEnvBlock(out);
  return truncateLongLines(out);
}

function redactEnvBlock(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => {
      const m = line.match(/^(\s*(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);
      if (!m) return line;
      const name = m[1].replace(/^\s*(?:export\s+)?/, "");
      ENV_NAME_SECRET.lastIndex = 0;
      if (ENV_NAME_SECRET.test(name) || name === "DATABASE_URL") {
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

export function redactSlipFields<T extends Record<string, unknown>>(data: T, enabled = true): T {
  const out = { ...data };
  for (const [k, v] of Object.entries(out)) {
    if (typeof v === "string") (out as Record<string, unknown>)[k] = redact(v, enabled);
  }
  return out;
}
