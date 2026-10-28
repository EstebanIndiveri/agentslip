/**
 * Secret redaction. Runs before any ticket is rendered.
 *
 * MUTATION CHECK: set REDACTION_ENABLED to false and the redaction tests must fail.
 * MUTATION CHECK: set defaultConfig().redaction.enabled to false and leak tests must fail.
 * MUTATION CHECK: drop camelCase / glued-uppercase suffixes from isSecretName
 * and the camelCase + glued assignment tests must fail.
 * MUTATION CHECK: if ASSIGN_HEAD consumes the value for non-secret names,
 * Bash: DB_PASS= / I ran: APIKEY= tests must fail.
 * MUTATION CHECK: drop GENERIC_KEY_NAMES / glued-prefix checks so primaryKey,
 * token: string, JSX key=, {"key":"Enter"}, and TURKEY= tests must fail.
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
const FLAG_PASSWORD = /--password(?:=|\s+)\S+/gi;
const PEM_BLOCK =
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g;
const SLACK_WEBHOOK = /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/_-]+/gi;
/** mysql, mysqldump, mysqladmin, mysqlimport — stop at && / || / | / ; so `-port` on a later command is not eaten. */
const MYSQL_DASH_P = /\bmysql\w*\b[^|&;\n]*/gi;

/**
 * Name plus `=` / `:`. Does NOT consume the value.
 * MUTATION CHECK: adding `([^\s,;]+)` here and returning the full match for
 * non-secret names reintroduces the `Bash: DB_PASS=` leak.
 */
const ASSIGN_HEAD = /\b([A-Za-z_][A-Za-z0-9_-]*)(\s*)([=:])(\s*)/g;

/** "name": "value", \"name\":\"value\", 'name': 'value' */
const JSON_STRING =
  /(\\?["'])([A-Za-z_][A-Za-z0-9_-]*)(\1)\s*:\s*(\\?["'])([^"'\\]*)(\4)/g;
/** "name": 1234 or \"name\": 1234 */
const JSON_NUMBER = /(\\?["'])([A-Za-z_][A-Za-z0-9_-]*)(\1)\s*:\s*(-?\d[\d.]*)/g;

const LONG_LINE = 160;

const EXCLUDED_NAMES = new Set(["bypass", "hotkey", "monkey", "keyboard"]);

/** Bare / suffix names that are keys in data models, not credentials — unless the value looks like a secret. */
const GENERIC_KEY_NAMES = new Set([
  "key",
  "token",
  "pass",
  "primarykey",
  "sortkey",
  "cachekey",
  "foreignkey",
  "idempotencykey",
  "nexttoken",
]);

const GLUED_PREFIX =
  /^(?:[A-Za-z0-9]*?)(?:api|github|gh|access|client|auth|secret|private|db|database|openai|aws|mysql)(?:key|token|secret|password|passwd|pass|pwd)$/i;

/**
 * Names that look like secrets: camelCase suffix (apiKey), glued
 * (APIKEY, apikey, GITHUBTOKEN), underscore suffix (_KEY, _PWD), hyphenated
 * headers (x-api-key). Plain words bypass / hotkey / monkey / keyboard are
 * excluded. Bare key/token and data-model *Key names need a secret-looking value.
 */
export function isSecretName(name: string, value?: string): boolean {
  if (!name || EXCLUDED_NAMES.has(name.toLowerCase())) return false;
  if (GENERIC_KEY_NAMES.has(name.toLowerCase())) {
    return value !== undefined && valueLooksSecret(value);
  }
  if (isClearlyCredential(name)) return true;
  return false;
}

function isClearlyCredential(name: string): boolean {
  if (name === "DATABASE_URL") return true;
  if (/_(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|PASS|PWD)$/i.test(name)) return true;
  if (/-(?:key|token|secret|password|passwd|pass)$/i.test(name)) return true;
  if (/^(?:PASSWORD|SECRET|PASSWD)$/i.test(name)) return true;
  if (/[a-z0-9](?:Secret|Password|Passwd)$/.test(name)) return true;
  if (/[a-z0-9]Token$/.test(name) && name.toLowerCase() !== "nexttoken") return true;
  if (/[a-z0-9]Key$/.test(name)) {
    if (GENERIC_KEY_NAMES.has(name.toLowerCase())) return false;
    return /(?:api|secret|private|public|auth|access|session|encryption|signing)Key$/i.test(name);
  }
  if (GLUED_PREFIX.test(name.replace(/[_-]/g, ""))) return true;
  return false;
}

function valueLooksSecret(value: string): boolean {
  const v = value.replace(/^['"{]+|[}'"]+$/g, "");
  if (v.length >= 24) return true;
  if (
    /^(sk-|sk_live_|rk_live_|ghp_|gho_|ghs_|ghu_|ghr_|github_pat_|glpat-|hf_|xox|AKIA|AIza|npm_)/.test(
      v,
    )
  ) {
    return true;
  }
  if (/^eyJ[a-zA-Z0-9_-]+\./.test(v)) return true;
  return false;
}

export function redact(text: string, enabled = true): string {
  if (!REDACTION_ENABLED || !enabled || text.length === 0) return text;
  let out = text;
  out = out.replace(PEM_BLOCK, "[redacted]");
  for (const re of API_KEY_PATTERNS) {
    re.lastIndex = 0;
    out = out.replace(re, "[redacted]");
  }
  out = out.replace(CRED_URL, (m) => m.replace(/\/\/[^@]*@/, "//[redacted]@"));
  out = redactJsonLike(out);
  out = redactAssignments(out);
  out = out.replace(FLAG_PASSWORD, "--password=[redacted]");
  out = out.replace(SLACK_WEBHOOK, "[redacted]");
  out = out.replace(MYSQL_DASH_P, (cmd) => cmd.replace(/\s-p(?!ort\b)\S+/g, " -p[redacted]"));
  out = redactEnvBlock(out);
  return truncateLongLines(out);
}

function redactJsonLike(text: string): string {
  let out = text;
  JSON_STRING.lastIndex = 0;
  out = out.replace(
    JSON_STRING,
    (m, q1: string, name: string, q2: string, q3: string, val: string, q4: string) => {
      if (!isSecretName(name, val)) return m;
      return `${q1}${name}${q2}: ${q3}[redacted]${q4}`;
    },
  );
  JSON_NUMBER.lastIndex = 0;
  out = out.replace(JSON_NUMBER, (m, q1: string, name: string, q2: string, num: string) => {
    if (!isSecretName(name, num)) return m;
    return `${q1}${name}${q2}: [redacted]`;
  });
  return out;
}

function redactAssignments(text: string): string {
  ASSIGN_HEAD.lastIndex = 0;
  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = ASSIGN_HEAD.exec(text)) !== null) {
    const name = m[1];
    const valueStart = m.index + m[0].length;
    const taken = takeValue(text, valueStart);
    if (!taken) continue;
    if (!isSecretName(name, taken.raw)) continue;
    out += text.slice(last, m.index);
    out += `${name}${m[2]}${m[3]}${m[4]}${taken.redacted}`;
    last = taken.end;
    ASSIGN_HEAD.lastIndex = taken.end;
  }
  return out + text.slice(last);
}

function takeValue(
  text: string,
  i: number,
): { raw: string; redacted: string; end: number } | null {
  if (i >= text.length) return null;
  const q = text[i];
  if (q === "'" || q === '"') {
    let j = i + 1;
    while (j < text.length && text[j] !== q) j += 1;
    if (j < text.length) j += 1;
    const raw = text.slice(i, j);
    const closed = raw.length >= 2 && raw.endsWith(q);
    return { raw, redacted: `${q}[redacted]${closed ? q : ""}`, end: j };
  }
  let j = i;
  while (j < text.length && !/[\s,;&]/.test(text[j])) j += 1;
  if (j === i) return null;
  return { raw: text.slice(i, j), redacted: "[redacted]", end: j };
}

function redactEnvBlock(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => {
      const m = line.match(/^(\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_-]*))(\s*)(=)(\s*)(.*)$/);
      if (!m) return line;
      const name = m[2];
      const rest = m[6];
      if (!isSecretName(name, rest)) return line;
      const taken = takeValue(rest, 0);
      if (!taken) return `${m[1]}${m[3]}${m[4]}${m[5]}[redacted]`;
      return `${m[1]}${m[3]}${m[4]}${m[5]}${taken.redacted}${rest.slice(taken.end)}`;
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
