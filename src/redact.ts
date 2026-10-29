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
 * MUTATION CHECK: remove REDACT_MAX_CHARS truncation → length-cap test fails.
 * MUTATION CHECK: call takeValue before the name check → `a=`.repeat(4352) exceeds 50 ms.
 * MUTATION CHECK: drop bounded quantifiers → uncapped 100 KB regex tests fail.
 * MUTATION CHECK: hard-slice the scan window (no whitespace cut) →
 * filled boundary-straddle tests fail.
 * MUTATION CHECK: clipField hard-cut (keep the window when there is no space) →
 * 9 KB no-space token test fails.
 * MUTATION CHECK: drop redactDeep budget → adversarial MultiEdit exceeds 500 ms
 * and text past the budget appears raw.
 * MUTATION CHECK: drop redactDeep depth guard → 10k-nest test throws.
 * MUTATION CHECK: JSON_QUOTE_BS_MAX = 1 → Bash double-escaped JSON fails.
 * MUTATION CHECK: require a closing quote (drop unclosed values) → unclosed
 * `{"apiKey":"…` / `{'password': 'a b …` and space-in-value filled-straddle tests fail.
 * MUTATION CHECK: treat a longer backslash-run + quote as the closer (no
 * lookahead) → escaped-quote-in-escaped-JSON tests fail.
 * MUTATION CHECK: pair `\\.` instead of counting the backslash run →
 * escaped-quote-in-escaped-JSON tests fail.
 * MUTATION CHECK: close whenever n>=k (no parity check) → escaped-quote
 * tails (`pa",`, `pa"}`, `pa"]`, `pa" ,`) leak at escape levels 1–3.
 * MUTATION CHECK: never close on the n>k branch → a value that ends with
 * a backslash swallows the next JSON field.
 * MUTATION CHECK: reject `\\` inside JSON field names / do not strip them
 * before isSecretName → backslash-in-field-name tests fail.
 * MUTATION CHECK: restore module-level redactDeepStats and ignore the per-call
 * stats argument → per-call stats test fails.
 */
export const REDACTION_ENABLED = true;

/** Per-field cap after redaction. Scan this many extra chars so a secret at the cut still matches. */
export const REDACT_MAX_CHARS = 8192;
export const REDACT_SCAN_PAD = 512;
/** Total string chars redactDeep will feed to redact() before substituting "…". */
export const REDACT_DEEP_MAX_CHARS = 12 * 1024;
export const REDACT_DEEP_MAX_DEPTH = 32;

const API_KEY_PATTERNS: RegExp[] = [
  /\bsk-[a-zA-Z0-9_-]{10,256}\b/g,
  /\bsk-ant-[a-zA-Z0-9_-]{10,256}\b/g,
  /\bsk_live_[a-zA-Z0-9]{8,256}\b/g,
  /\brk_live_[a-zA-Z0-9]{8,256}\b/g,
  /\bghp_[a-zA-Z0-9]{20,256}\b/g,
  /\bgho_[a-zA-Z0-9]{20,256}\b/g,
  /\bghs_[a-zA-Z0-9]{20,256}\b/g,
  /\bghu_[a-zA-Z0-9]{20,256}\b/g,
  /\bghr_[a-zA-Z0-9]{20,256}\b/g,
  /\bgithub_pat_[a-zA-Z0-9_]{20,256}\b/g,
  /\bglpat-[a-zA-Z0-9_\-]{10,256}\b/g,
  /\bhf_[a-zA-Z0-9]{10,256}\b/g,
  /\bxox[baprs]-[a-zA-Z0-9-]{10,256}\b/g,
  /\bAKIA[0-9A-Z]{8,256}\b/g,
  /\bAIza[0-9A-Za-z_-]{20,256}\b/g,
  /\bnpm_[a-zA-Z0-9]{20,256}\b/g,
  /\bBearer\s{1,32}[a-zA-Z0-9._\-+=/]{8,512}\b/gi,
  /\bAuthorization:\s{0,32}Basic\s{1,32}[A-Za-z0-9+/=]{1,512}\b/gi,
  /\beyJ[a-zA-Z0-9_-]{1,256}\.[a-zA-Z0-9_-]{1,256}\.[a-zA-Z0-9_-]{1,256}\b/g,
];

const CRED_URL =
  /[a-zA-Z][a-zA-Z0-9+.-]{0,32}:\/\/(?:[^/\s@]{0,256}:[^@/\s]{1,256}@)/g;
const FLAG_PASSWORD = /--password(?:=|\s{1,32})\S{1,256}/gi;
const FLAG_TOKEN = /--token(?:=|\s{1,32})\S{1,256}/gi;
const FLAG_API_KEY = /--api-key(?:=|\s{1,32})\S{1,256}/gi;
const PEM_BLOCK =
  /-----BEGIN [A-Z ]{0,64}PRIVATE KEY-----[\s\S]{0,8192}?(?:-----END [A-Z ]{0,64}PRIVATE KEY-----|$)/g;
const SLACK_WEBHOOK = /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/_-]{1,256}/gi;
/** mysql, mysqldump, mysqladmin, mysqlimport — stop at && / || / | / ; so `-port` on a later command is not eaten. */
const MYSQL_DASH_P = /\bmysql\w{0,32}\b[^|&;\n]{0,512}/gi;

/**
 * Name plus `=` / `:`. Does NOT consume the value.
 * MUTATION CHECK: adding `([^\s,;]+)` here and returning the full match for
 * non-secret names reintroduces the `Bash: DB_PASS=` leak.
 */
const ASSIGN_HEAD = /\b([A-Za-z_][A-Za-z0-9_-]{0,255})(\s{0,8})([=:])(\s{0,8})/g;

/**
 * Quote prefix `\\{0,N}"` / `\\{0,N}'` (raw JSON, escaped JSON, double-escaped).
 * MUTATION CHECK: set to 1 → Bash double-escaped JSON test fails.
 */
export const JSON_QUOTE_BS_MAX = 16;
const JSON_VALUE_MAX = 4096;
const JSON_NAME_MAX = 256;

const LONG_LINE = 160;
const VALUE_SCAN_MAX = 4096;

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
  /^(?:[A-Za-z0-9]{0,64}?)(?:api|github|gh|access|client|auth|secret|private|db|database|openai|aws|mysql|admin|slack|stripe|master)(?:key|token|secret|password|passwd|pass|pwd)$/i;

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
  if (/_(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|PASS|PWD)(?:_ID)?$/i.test(name)) return true;
  if (/-(?:key|token|secret|password|passwd|pass)$/i.test(name)) return true;
  if (/^(?:PASSWORD|SECRET|PASSWD)$/i.test(name)) return true;
  if (/[a-z0-9](?:Secret|Password|Passwd)$/.test(name)) return true;
  if (/[a-z0-9]Token$/.test(name) && name.toLowerCase() !== "nexttoken") return true;
  if (/[a-z0-9]Key$/.test(name)) {
    if (GENERIC_KEY_NAMES.has(name.toLowerCase())) return false;
    return /(?:api|secret|private|public|auth|access|session|encryption|signing|stripe|master)Key$/i.test(
      name,
    );
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
  if (/^eyJ[a-zA-Z0-9_-]{1,256}\./.test(v)) return true;
  return false;
}

export function redact(text: string, enabled = true): string {
  if (!REDACTION_ENABLED || !enabled || text.length === 0) return text;
  const scanLimit = REDACT_MAX_CHARS + REDACT_SCAN_PAD;
  // Cut at the last whitespace before scanning so a split token cannot remain
  // after earlier [redacted] replacements shrink the text below REDACT_MAX_CHARS.
  let out = text.length > scanLimit ? clipField(text, scanLimit) : text;
  out = out.replace(PEM_BLOCK, "[redacted]");
  for (const re of API_KEY_PATTERNS) {
    re.lastIndex = 0;
    out = out.replace(re, "[redacted]");
  }
  out = out.replace(CRED_URL, (m) => m.replace(/\/\/[^@]{0,512}@/, "//[redacted]@"));
  out = redactJsonLike(out);
  out = redactAssignments(out);
  out = out.replace(FLAG_PASSWORD, "--password=[redacted]");
  out = out.replace(FLAG_TOKEN, "--token=[redacted]");
  out = out.replace(FLAG_API_KEY, "--api-key=[redacted]");
  out = out.replace(SLACK_WEBHOOK, "[redacted]");
  out = out.replace(MYSQL_DASH_P, (cmd) => cmd.replace(/\s-p(?!ort\b)\S{0,256}/g, " -p[redacted]"));
  out = redactEnvBlock(out);
  out = clipField(out, REDACT_MAX_CHARS);
  return truncateLongLines(out);
}

/**
 * Clip at the last whitespace before `max` so a split token (partial ghp_, open
 * JSON, URL with no @) is dropped rather than printed. No whitespace → "…".
 * MUTATION CHECK: return the hard-sliced window when cut<=0 → 9 KB no-space fails.
 */
export function clipField(text: string, max = REDACT_MAX_CHARS): string {
  if (text.length <= max) return text;
  const window = text.slice(0, max);
  let cut = -1;
  for (let i = window.length - 1; i >= 0; i--) {
    const c = window[i];
    if (c === "\n" || c === "\r" || c === " " || c === "\t") {
      cut = i;
      break;
    }
  }
  if (cut <= 0) return "…";
  let end = cut;
  while (end > 0 && /\s/.test(text[end - 1])) end -= 1;
  if (end <= 0) return "…";
  return `${text.slice(0, end)}…`;
}

/**
 * Walk objects/arrays and redact string leaves. Used on hook tool_input
 * before JSON.stringify so Write content is not double-escaped past JSON_STRING.
 * MUTATION CHECK: skip this in toolDetail → Write escaped-JSON leak tests fail.
 * MUTATION CHECK: drop the budget check → adversarial MultiEdit exceeds 500 ms
 * and a unique marker past the budget appears raw.
 * MUTATION CHECK: drop the depth guard → 10k-nest test throws RangeError.
 *
 * Stats are per call: pass an object to receive chars/calls walkDeep fed to
 * redact(). MUTATION CHECK: restore a module-level global and ignore `stats`
 * → per-call stats test fails.
 */
export type RedactDeepStats = { chars: number; calls: number };

export function redactDeep(value: unknown, enabled = true, stats?: RedactDeepStats): unknown {
  const s: RedactDeepStats = stats ?? { chars: 0, calls: 0 };
  s.chars = 0;
  s.calls = 0;
  return walkDeep(value, enabled, 0, { used: 0 }, s);
}

function walkDeep(
  value: unknown,
  enabled: boolean,
  depth: number,
  budget: { used: number },
  stats: RedactDeepStats,
): unknown {
  if (depth >= REDACT_DEEP_MAX_DEPTH) return "…";
  if (budget.used >= REDACT_DEEP_MAX_CHARS) return "…";
  if (typeof value === "string") {
    budget.used += value.length;
    stats.chars += value.length;
    stats.calls += 1;
    return redact(value, enabled);
  }
  if (Array.isArray(value)) {
    return value.map((item) => walkDeep(item, enabled, depth + 1, budget, stats));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = walkDeep(v, enabled, depth + 1, budget, stats);
    }
    return out;
  }
  return value;
}

/** Regex + 100 KB attack strings for uncapped complexity tests. */
export function complexityCases(): { name: string; re: RegExp; input: string }[] {
  const size = 100_000;
  return [
    {
      name: "eyJ",
      re: API_KEY_PATTERNS[API_KEY_PATTERNS.length - 1],
      // Repeated "eyJ-" is superlinear if the {1,256} bound becomes `+`.
      input: `${"eyJ-".repeat(25_000)}`,
    },
    {
      name: "CRED_URL",
      re: CRED_URL,
      input: `https://${"a".repeat(size)}`,
    },
    {
      name: "ASSIGN_HEAD word",
      re: ASSIGN_HEAD,
      input: "a".repeat(size),
    },
    {
      name: "ASSIGN_HEAD dashes",
      re: ASSIGN_HEAD,
      input: "-".repeat(size),
    },
    {
      name: "SLACK",
      re: SLACK_WEBHOOK,
      input: (() => {
        const u = "https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX";
        return u.repeat(Math.ceil(size / u.length));
      })(),
    },
    {
      name: "MYSQL",
      re: MYSQL_DASH_P,
      input: "mysql -px ".repeat(Math.ceil(size / 10)),
    },
  ];
}

function readQuotePrefix(
  text: string,
  i: number,
): { bs: number; q: string; raw: string; end: number } | null {
  if (i >= text.length) return null;
  let n = 0;
  while (n < JSON_QUOTE_BS_MAX && i + n < text.length && text[i + n] === "\\") n += 1;
  const q = text[i + n];
  if (q !== '"' && q !== "'") return null;
  return { bs: n, q, raw: text.slice(i, i + n + 1), end: i + n + 1 };
}

function readJsonName(text: string, i: number): { raw: string; decoded: string; end: number } | null {
  if (i >= text.length || !/[A-Za-z_]/.test(text[i] as string)) return null;
  const start = i;
  i += 1;
  while (i < text.length && i - start < JSON_NAME_MAX) {
    const c = text[i] as string;
    if (/[A-Za-z0-9_-]/.test(c)) {
      i += 1;
      continue;
    }
    if (c === "\\" && i + 1 < text.length) {
      const next = text[i + 1] as string;
      if (next === '"' || next === "'") break;
      i += 2;
      continue;
    }
    break;
  }
  const raw = text.slice(start, i);
  if (!raw) return null;
  return { raw, decoded: raw.replace(/\\/g, ""), end: i };
}

function skipColon(text: string, i: number): number | null {
  let j = i;
  let spaces = 0;
  while (j < text.length && spaces < 8 && (text[j] === " " || text[j] === "\t")) {
    j += 1;
    spaces += 1;
  }
  if (j >= text.length || text[j] !== ":") return null;
  j += 1;
  spaces = 0;
  while (j < text.length && spaces < 8 && (text[j] === " " || text[j] === "\t")) {
    j += 1;
    spaces += 1;
  }
  return j;
}

function scanQuotedValue(
  text: string,
  i: number,
  k: number,
  q: string,
): { raw: string; end: number; closed: boolean } {
  const contentLimit = i + JSON_VALUE_MAX;
  const max = Math.min(text.length, contentLimit + JSON_QUOTE_BS_MAX + 1);
  let j = i;
  while (j < max) {
    if (j > contentLimit) {
      return { raw: text.slice(i, contentLimit), end: contentLimit, closed: false };
    }
    if (text[j] !== "\\") {
      if (k === 0 && text[j] === q) {
        return { raw: text.slice(i, j), end: j + 1, closed: true };
      }
      j += 1;
      continue;
    }
    let n = 0;
    while (j + n < max && text[j + n] === "\\") n += 1;
    const after = j + n < text.length ? text[j + n] : "";
    if (after === q) {
      // Close only at this escape depth: n===k, or extra backslashes that are
      // a whole number of escaped-backslash pairs for this depth.
      // MUTATION CHECK: n>=k with no modulus → escaped-quote tails leak.
      // MUTATION CHECK: skip the n>k branch → a trailing backslash in the
      // value swallows the next field.
      if (n === k || (n > k && (n - k) % (2 * (k + 1)) === 0)) {
        const extra = n - k;
        const contentEnd = j + extra;
        if (contentEnd - i > JSON_VALUE_MAX) {
          return { raw: text.slice(i, contentLimit), end: contentLimit, closed: false };
        }
        return { raw: text.slice(i, contentEnd), end: contentEnd + k + 1, closed: true };
      }
      j += n + 1;
      continue;
    }
    j += Math.max(n, 1);
  }
  return { raw: text.slice(i, j), end: j, closed: false };
}

function readJsonNumber(text: string, i: number): { raw: string; end: number } | null {
  if (i >= text.length) return null;
  let j = i;
  if (text[j] === "-") j += 1;
  if (j >= text.length || !/\d/.test(text[j] as string)) return null;
  j += 1;
  while (j < text.length && j - i < 64 && /[\d.]/.test(text[j] as string)) j += 1;
  return { raw: text.slice(i, j), end: j };
}

function tryRedactJsonField(text: string, i: number): { end: number; out: string } | null {
  const q1 = readQuotePrefix(text, i);
  if (!q1) return null;
  const name = readJsonName(text, q1.end);
  if (!name) return null;
  const q2 = readQuotePrefix(text, name.end);
  if (!q2 || q2.q !== q1.q) return null;
  const afterColon = skipColon(text, q2.end);
  if (afterColon === null) return null;

  const q3 = readQuotePrefix(text, afterColon);
  if (q3) {
    const val = scanQuotedValue(text, q3.end, q3.bs, q3.q);
    if (!val.closed && val.end !== text.length) return null;
    const secret = isSecretName(name.decoded, val.raw);
    const out = secret
      ? `${q1.raw}${name.raw}${q2.raw}: ${q3.raw}[redacted]${val.closed ? q3.raw : ""}`
      : text.slice(i, val.end);
    return { end: val.end, out };
  }
  const num = readJsonNumber(text, afterColon);
  if (num) {
    const secret = isSecretName(name.decoded, num.raw);
    const out = secret ? `${q1.raw}${name.raw}${q2.raw}: [redacted]` : text.slice(i, num.end);
    return { end: num.end, out };
  }
  return null;
}

function redactJsonLike(text: string): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const hit = tryRedactJsonField(text, i);
    if (hit) {
      out += hit.out;
      i = hit.end;
      continue;
    }
    out += text[i];
    i += 1;
  }
  return out;
}

function redactAssignments(text: string): string {
  ASSIGN_HEAD.lastIndex = 0;
  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = ASSIGN_HEAD.exec(text)) !== null) {
    const name = m[1];
    // Name-only reject: do not scan the value (O(n) vs O(n²) on `a:a:a:…`).
    if (!GENERIC_KEY_NAMES.has(name.toLowerCase()) && !isSecretName(name)) continue;
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
  const limit = Math.min(text.length, i + VALUE_SCAN_MAX);
  const q = text[i];
  if (q === "'" || q === '"') {
    let j = i + 1;
    while (j < limit && text[j] !== q) j += 1;
    if (j < text.length && text[j] === q) j += 1;
    const raw = text.slice(i, j);
    const closed = raw.length >= 2 && raw.endsWith(q);
    return { raw, redacted: `${q}[redacted]${closed ? q : ""}`, end: j };
  }
  let j = i;
  while (j < limit && !/[\s,;&]/.test(text[j])) j += 1;
  if (j === i) return null;
  return { raw: text.slice(i, j), redacted: "[redacted]", end: j };
}

function redactEnvBlock(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => {
      const m = line.match(
        /^(\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_-]{0,255}))(\s{0,8})(=)(\s{0,8})(.{0,8192})$/,
      );
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
