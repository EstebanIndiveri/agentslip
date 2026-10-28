import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { defaultConfig } from "./config.js";
import { printSlip } from "./print.js";
import { parseHook } from "./hooks/parse.js";
import { toolDetail } from "./hooks/shared.js";
import {
  clipField,
  redact,
  redactDeep,
  redactDeepStats,
  REDACT_DEEP_MAX_CHARS,
  REDACT_DEEP_MAX_DEPTH,
  REDACT_MAX_CHARS,
  REDACT_SCAN_PAD,
  REDACTION_ENABLED,
} from "./redact.js";
import { buildDocument, renderSlip } from "./slips/document.js";
import type { SlipData } from "./types.js";

const SECRET_TEXT =
  "key sk-ant-api03-EXAMPLEKEYNOTREAL000000000000 and ghp_abcdefghijklmnopqrstuvwx000011 " +
  "AKIAIOSFODNN7EXAMPLE0 xoxb-1234567890-abcdefghijk OPENAI_API_KEY=sk-proj-EXAMPLEKEYNOTREAL " +
  "https://alice:s3cr3tpass@example.com/repo.git SECRET_KEY=super-secret-value " +
  "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aaa.bbb";

const NEEDLES = [
  "sk-ant-api03",
  "ghp_abcdefghijklmnopqrstuvwx000011",
  "AKIAIOSFODNN7EXAMPLE0",
  "s3cr3tpass",
  "super-secret-value",
  "sk-proj-EXAMPLEKEYNOTREAL",
];

const frozen = new Date("2026-10-27T15:00:00.000Z");

function needsYou(request: string, extra: Partial<SlipData> = {}): SlipData {
  return {
    kind: "needs-you",
    agent: "Claude Code",
    event: "PermissionRequest",
    sessionId: "sec",
    time: frozen,
    request,
    ...extra,
  };
}

describe("redact", () => {
  it("is enabled in this build", () => {
    expect(REDACTION_ENABLED).toBe(true);
  });

  it("hides API keys, tokens, cred URLs, and *_SECRET assignments", () => {
    const out = redact(SECRET_TEXT);
    expect(out).not.toMatch(/sk-ant-api03/);
    expect(out).not.toContain("ghp_abcdefghijklmnopqrstuvwx000011");
    expect(out).not.toContain("AKIAIOSFODNN7EXAMPLE0");
    expect(out).not.toContain("xoxb-1234567890-abcdefghijk");
    expect(out).not.toContain("s3cr3tpass");
    expect(out).not.toContain("super-secret-value");
    expect(out).not.toContain("sk-proj-EXAMPLEKEYNOTREAL");
    expect(out).toMatch(/\[redacted\]/);
  });

  it("redacts typical .env lines", () => {
    const env = "OPENAI_API_KEY=sk-live-example\nGITHUB_TOKEN=ghp_abc\nNAME=ok";
    const out = redact(env);
    expect(out).not.toContain("sk-live-example");
    expect(out).toContain("NAME=ok");
  });

  it("redacts postgres/mongodb/redis credential URLs", () => {
    const out = redact(
      "postgres://alice:s3cr3tpass@db/app mongodb+srv://u:mongoSecret@cluster redis://:redisPw@127.0.0.1/0",
    );
    expect(out).not.toContain("s3cr3tpass");
    expect(out).not.toContain("mongoSecret");
    expect(out).not.toContain("redisPw");
    expect(out).toMatch(/postgres:\/\/\[redacted\]@/);
    expect(out).toMatch(/mongodb\+srv:\/\/\[redacted\]@/);
    expect(out).toMatch(/redis:\/\/\[redacted\]@/);
  });

  it("redacts Authorization Basic", () => {
    const out = redact("Authorization: Basic QWxhZGRpbjpvcGVuIHNlc2FtZQ==");
    expect(out).not.toContain("QWxhZGRpbjpvcGVuIHNlc2FtZQ==");
    expect(out).toMatch(/\[redacted\]/);
  });

  it("redacts gho_ / ghs_ / ghu_ / ghr_ tokens", () => {
    const out = redact(
      "gho_abcdefghijklmnopqrstuvwx000011 ghs_abcdefghijklmnopqrstuvwx000011 " +
        "ghu_abcdefghijklmnopqrstuvwx000011 ghr_abcdefghijklmnopqrstuvwx000011",
    );
    expect(out).not.toContain("gho_abcdefghijklmnopqrstuvwx000011");
    expect(out).not.toContain("ghs_abcdefghijklmnopqrstuvwx000011");
    expect(out).not.toContain("ghu_abcdefghijklmnopqrstuvwx000011");
    expect(out).not.toContain("ghr_abcdefghijklmnopqrstuvwx000011");
  });

  it("redacts glpat- tokens", () => {
    const out = redact("glpat-abcdefghijklmnopqrst");
    expect(out).not.toContain("glpat-abcdefghijklmnopqrst");
  });

  it("redacts hf_ tokens", () => {
    const out = redact("hf_abcdefghijklmnopqrstuv");
    expect(out).not.toContain("hf_abcdefghijklmnopqrstuv");
  });

  it("redacts Stripe sk_live_ and rk_live_", () => {
    const out = redact("sk_live_51ExampleStripeKey rk_live_51ExampleRestricted");
    expect(out).not.toContain("sk_live_51ExampleStripeKey");
    expect(out).not.toContain("rk_live_51ExampleRestricted");
  });

  it("redacts NAME_PASS / PASSWORD / SECRET assignments", () => {
    const out = redact("NAME_PASS=hunter2 PASSWORD=letmein SECRET=topsecret");
    expect(out).not.toContain("hunter2");
    expect(out).not.toContain("letmein");
    expect(out).not.toContain("topsecret");
  });

  it("redacts --password=", () => {
    const out = redact("mysql --password=hunter2 --host=localhost");
    expect(out).not.toContain("hunter2");
    expect(out).toContain("--password=[redacted]");
  });

  it("redacts mysql -p concatenated passwords", () => {
    const out = redact("mysql -uroot -phunter2");
    expect(out).not.toContain("hunter2");
    expect(out).toContain("-p[redacted]");
  });

  it("redacts mysqldump -p concatenated passwords", () => {
    const out = redact("mysqldump -uroot -pDumpPw99 db");
    expect(out).not.toContain("DumpPw99");
    expect(out).toContain("-p[redacted]");
  });

  it("redacts mysqladmin -p concatenated passwords", () => {
    const out = redact("mysqladmin -pAdminPw99 ping");
    expect(out).not.toContain("AdminPw99");
    expect(out).toContain("-p[redacted]");
  });

  it("redacts mysqlimport -p concatenated passwords", () => {
    const out = redact("mysqlimport -pImportPw99 db file.sql");
    expect(out).not.toContain("ImportPw99");
    expect(out).toContain("-p[redacted]");
  });

  it("redacts --password with a space", () => {
    const out = redact("mysql --password hunter2 --host=localhost");
    expect(out).not.toContain("hunter2");
    expect(out).toContain("--password=[redacted]");
  });

  it("redacts PEM private key blocks", () => {
    const pem =
      "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCSECRETKEYMATERIAL\n-----END PRIVATE KEY-----";
    const out = redact(pem);
    expect(out).not.toContain("MIIEvQIBADANBgkqhkiG9w0BAQEFAASCSECRETKEYMATERIAL");
    expect(out).not.toContain("BEGIN PRIVATE KEY");
    expect(out).toMatch(/\[redacted\]/);
  });

  it("redacts a PEM block with no END line", () => {
    const pem =
      "-----BEGIN RSA PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCSECRETKEYMATERIAL\nstill-secret";
    const out = redact(pem);
    expect(out).not.toContain("SECRETKEYMATERIAL");
    expect(out).not.toContain("BEGIN RSA PRIVATE KEY");
    expect(out).toMatch(/\[redacted\]/);
  });

  it("redacts Slack webhook URLs", () => {
    const out = redact(
      "https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX",
    );
    expect(out).not.toContain("T00000000");
    expect(out).not.toContain("hooks.slack.com");
    expect(out).toMatch(/\[redacted\]/);
  });

  it("does not redact bypass= or hotkey:", () => {
    const out = redact("bypass=true hotkey:ctrl+k NAME=ok");
    expect(out).toContain("bypass=true");
    expect(out).toContain("hotkey:ctrl+k");
    expect(out).toContain("NAME=ok");
  });

  it("keeps the colon separator for x-api-key", () => {
    const out = redact("x-api-key: headerSecret99");
    expect(out).not.toContain("headerSecret99");
    expect(out).toContain("x-api-key: [redacted]");
  });

  it("redacts repo, branch, and reason on the slip", () => {
    const cfg = defaultConfig();
    const rendered = renderSlip(
      {
        kind: "session",
        agent: "Codex",
        event: "SessionEnd",
        sessionId: "sec",
        time: frozen,
        repo: "https://alice:s3cr3tpass@example.com/repo.git",
        branch: "sk_live_51ExampleStripeKey",
        reason: "PASSWORD=letmein",
        tokens: "n/a",
        cost: "n/a",
      },
      cfg,
      1,
    );
    const hex = rendered.escpos.toString("latin1");
    expect(rendered.svg).not.toContain("s3cr3tpass");
    expect(rendered.svg).not.toContain("sk_live_51ExampleStripeKey");
    expect(rendered.svg).not.toContain("letmein");
    expect(hex).not.toContain("s3cr3tpass");
    expect(hex).not.toContain("sk_live_51ExampleStripeKey");
    expect(hex).not.toContain("letmein");
  });

  it("redacts branch in the receiptline document string", () => {
    const secret = "sk_live_51ExampleStripeKey";
    const { document } = buildDocument(
      {
        kind: "done",
        agent: "Claude Code",
        event: "Stop",
        sessionId: "sec",
        time: frozen,
        repo: "demo-app",
        branch: secret,
      },
      { widthMm: 58, ticketNo: 1 },
    );
    expect(document).not.toContain(secret);
    expect(document).toMatch(/\[redacted\]/);
  });
});

describe("leak tests on defaultConfig (must fail if redaction.enabled is false)", () => {
  const homes: string[] = [];
  const prevHome = process.env.AGENTSLIP_HOME;

  afterEach(() => {
    for (const h of homes.splice(0)) fs.rmSync(h, { recursive: true, force: true });
    if (prevHome === undefined) delete process.env.AGENTSLIP_HOME;
    else process.env.AGENTSLIP_HOME = prevHome;
  });

  it("does not leak through renderSlip(defaultConfig) SVG or ESC/POS", () => {
    const cfg = defaultConfig();
    expect(cfg.redaction.enabled).toBe(true);
    const rendered = renderSlip(needsYou(SECRET_TEXT), cfg, 1);
    const hex = rendered.escpos.toString("latin1");
    for (const needle of NEEDLES) {
      expect(rendered.svg).not.toContain(needle);
      expect(hex).not.toContain(needle);
    }
  });

  it("does not leak into the file-driver .bin under defaultConfig", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "agentslip-bin-"));
    homes.push(home);
    process.env.AGENTSLIP_HOME = home;
    const cfg = defaultConfig();
    cfg.driver = "file";
    expect(cfg.file.path).toBe(path.join(home, "agentslip.bin"));
    expect(path.resolve(cfg.file.path).startsWith(path.resolve(home) + path.sep)).toBe(true);
    await printSlip(needsYou(SECRET_TEXT), cfg);
    const bin = fs.readFileSync(cfg.file.path);
    const text = bin.toString("latin1");
    for (const needle of NEEDLES) {
      expect(text).not.toContain(needle);
    }
    expect(fs.existsSync(path.join(process.cwd(), "agentslip.bin"))).toBe(false);
  });
});

function listen(): Promise<{ server: net.Server; port: number; received: Promise<Buffer> }> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const server = net.createServer((sock) => {
      sock.on("data", (c) => chunks.push(c));
      sock.on("end", () => {
        receivedResolve(Buffer.concat(chunks));
      });
    });
    let receivedResolve: (b: Buffer) => void = () => {};
    const received = new Promise<Buffer>((r) => {
      receivedResolve = r;
    });
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("no port"));
        return;
      }
      resolve({ server, port: addr.port, received });
    });
  });
}

describe("camelCase / glued names on document, .bin, and TCP", () => {
  const homes: string[] = [];
  const prevHome = process.env.AGENTSLIP_HOME;

  afterEach(() => {
    for (const h of homes.splice(0)) fs.rmSync(h, { recursive: true, force: true });
    if (prevHome === undefined) delete process.env.AGENTSLIP_HOME;
    else process.env.AGENTSLIP_HOME = prevHome;
  });

  async function surfaces(request: string): Promise<{ document: string; bin: string; tcp: string }> {
    const slip = needsYou(request);
    const { document } = buildDocument(slip, { widthMm: 58, ticketNo: 1 });
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "agentslip-surf-"));
    homes.push(home);
    process.env.AGENTSLIP_HOME = home;

    const cfgFile = defaultConfig();
    cfgFile.driver = "file";
    await printSlip(slip, cfgFile);
    const bin = fs.readFileSync(cfgFile.file.path).toString("latin1");

    const { server, port, received } = await listen();
    try {
      const cfgTcp = defaultConfig();
      cfgTcp.driver = "escpos-tcp";
      cfgTcp.escpos = { host: "127.0.0.1", port };
      const printed = await printSlip({ ...slip, sessionId: "tcp" }, cfgTcp);
      expect(printed.printed).toBe(true);
      const tcp = (await received).toString("latin1");
      return { document, bin, tcp };
    } finally {
      server.close();
    }
  }

  const leaks: { name: string; text: string; needle: string }[] = [
    { name: "camelCase apiKey JSON", text: '{"apiKey":"leakCamelApiKey99"}', needle: "leakCamelApiKey99" },
    {
      name: "camelCase accessToken JSON",
      text: '{"accessToken":"leakCamelAccessToken99"}',
      needle: "leakCamelAccessToken99",
    },
    {
      name: "camelCase clientSecret JSON",
      text: '{"clientSecret":"leakCamelClientSecret99"}',
      needle: "leakCamelClientSecret99",
    },
    { name: "glued APIKEY=", text: "APIKEY=leakGluedApiKey99", needle: "leakGluedApiKey99" },
    { name: "glued GITHUBTOKEN=", text: "GITHUBTOKEN=leakGluedGithubToken99", needle: "leakGluedGithubToken99" },
    { name: "glued DBPASSWORD=", text: "DBPASSWORD=leakGluedDbPassword99", needle: "leakGluedDbPassword99" },
    { name: "glued MYAPP_APIKEY=", text: "MYAPP_APIKEY=leakGluedMyappApikey99", needle: "leakGluedMyappApikey99" },
  ];

  for (const c of leaks) {
    it(`redacts ${c.name} in document, .bin, and TCP`, async () => {
      const s = await surfaces(c.text);
      expect(s.document).not.toContain(c.needle);
      expect(s.bin).not.toContain(c.needle);
      expect(s.tcp).not.toContain(c.needle);
      expect(s.document).toMatch(/\[redacted\]/);
    });
  }

  const keep: { name: string; text: string; needle: string }[] = [
    { name: "bypass=", text: "bypass=keepBypass99", needle: "keepBypass99" },
    { name: "hotkey:", text: "hotkey:keepHotkey99", needle: "keepHotkey99" },
    { name: "monkey=", text: "monkey=keepMonkey99", needle: "keepMonkey99" },
    { name: "keyboard=", text: "keyboard=keepKeyboard99", needle: "keepKeyboard99" },
    { name: "MONKEY=", text: "MONKEY=keepUpperMonkey99", needle: "keepUpperMonkey99" },
    { name: "HOTKEY=", text: "HOTKEY=keepUpperHotkey99", needle: "keepUpperHotkey99" },
  ];

  for (const c of keep) {
    it(`does not redact ${c.name} in document, .bin, or TCP`, async () => {
      const s = await surfaces(c.text);
      expect(s.document).toContain(c.needle);
      expect(s.document).not.toContain("[redacted]");
      expect(s.bin).toContain(c.needle);
      expect(s.tcp).toContain(c.needle);
    });
  }
});

describe("escaped / python / numeric / quoted JSON-like secrets", () => {
  const homes: string[] = [];
  const prevHome = process.env.AGENTSLIP_HOME;
  afterEach(() => {
    for (const h of homes.splice(0)) fs.rmSync(h, { recursive: true, force: true });
    if (prevHome === undefined) delete process.env.AGENTSLIP_HOME;
    else process.env.AGENTSLIP_HOME = prevHome;
  });

  async function surfaces(request: string): Promise<{ document: string; bin: string; tcp: string }> {
    const slip = needsYou(request);
    const { document } = buildDocument(slip, { widthMm: 58, ticketNo: 1 });
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "agentslip-surf-"));
    homes.push(home);
    process.env.AGENTSLIP_HOME = home;
    const cfgFile = defaultConfig();
    cfgFile.driver = "file";
    await printSlip(slip, cfgFile);
    const bin = fs.readFileSync(cfgFile.file.path).toString("latin1");
    const { server, port, received } = await listen();
    try {
      const cfgTcp = defaultConfig();
      cfgTcp.driver = "escpos-tcp";
      cfgTcp.escpos = { host: "127.0.0.1", port };
      const printed = await printSlip({ ...slip, sessionId: "tcp" }, cfgTcp);
      expect(printed.printed).toBe(true);
      const tcp = (await received).toString("latin1");
      return { document, bin, tcp };
    } finally {
      server.close();
    }
  }

  const cases: { name: string; text: string; needle: string }[] = [
    {
      name: 'escaped-quote JSON {\\"apiKey\\":\\"X\\"}',
      text: String.raw`{\"apiKey\":\"leakEscJson99\"}`,
      needle: "leakEscJson99",
    },
    {
      name: "Python dict {'apiKey': 'X'}",
      text: "{'apiKey': 'leakPyDict99'}",
      needle: "leakPyDict99",
    },
    {
      name: 'numeric JSON "apiKey": 1234…',
      text: '{"apiKey": 123456789012345}',
      needle: "123456789012345",
    },
    {
      name: "quoted API_KEY='a b'",
      text: "API_KEY='leakQsA99 has space'",
      needle: "leakQsA99",
    },
    {
      name: 'quoted API_KEY="a b"',
      text: 'API_KEY="leakQsB99 has space"',
      needle: "leakQsB99",
    },
    { name: "?apikey= query", text: "https://ex.test/x?apikey=leakQueryApi99", needle: "leakQueryApi99" },
    { name: "&githubtoken= query", text: "https://ex.test/x?q=1&githubtoken=leakQueryGh99", needle: "leakQueryGh99" },
    { name: "lowercase glued dbpassword=", text: "dbpassword=leakGluedLower99", needle: "leakGluedLower99" },
    { name: "MYSQL_PWD=", text: "MYSQL_PWD=leakMysqlPwd99", needle: "leakMysqlPwd99" },
    { name: "DBPASS=", text: "DBPASS=leakDbpass99", needle: "leakDbpass99" },
  ];

  for (const c of cases) {
    it(`redacts ${c.name} in document, .bin, and TCP`, async () => {
      const out = redact(c.text);
      expect(out).not.toContain(c.needle);
      expect(out).toMatch(/\[redacted\]/);
      if (c.name.startsWith("quoted API_KEY='")) {
        expect(out).not.toContain("has space");
        expect(out).toContain("API_KEY='[redacted]'");
      }
      if (c.name.startsWith('quoted API_KEY="')) {
        expect(out).not.toContain("has space");
        expect(out).toContain('API_KEY="[redacted]"');
      }
      const s = await surfaces(c.text);
      expect(s.document).not.toContain(c.needle);
      expect(s.bin).not.toContain(c.needle);
      expect(s.tcp).not.toContain(c.needle);
    });
  }
});

describe("isSecretName false positives (must stay visible)", () => {
  const homes: string[] = [];
  const prevHome = process.env.AGENTSLIP_HOME;
  afterEach(() => {
    for (const h of homes.splice(0)) fs.rmSync(h, { recursive: true, force: true });
    if (prevHome === undefined) delete process.env.AGENTSLIP_HOME;
    else process.env.AGENTSLIP_HOME = prevHome;
  });

  async function surfaces(request: string): Promise<{ document: string; bin: string; tcp: string }> {
    const slip = needsYou(request);
    const { document } = buildDocument(slip, { widthMm: 58, ticketNo: 1 });
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "agentslip-surf-"));
    homes.push(home);
    process.env.AGENTSLIP_HOME = home;
    const cfgFile = defaultConfig();
    cfgFile.driver = "file";
    await printSlip(slip, cfgFile);
    const bin = fs.readFileSync(cfgFile.file.path).toString("latin1");
    const { server, port, received } = await listen();
    try {
      const cfgTcp = defaultConfig();
      cfgTcp.driver = "escpos-tcp";
      cfgTcp.escpos = { host: "127.0.0.1", port };
      const printed = await printSlip({ ...slip, sessionId: "tcp" }, cfgTcp);
      expect(printed.printed).toBe(true);
      const tcp = (await received).toString("latin1");
      return { document, bin, tcp };
    } finally {
      server.close();
    }
  }

  const keep: { name: string; text: string; needle: string }[] = [
    { name: "bare key=", text: "key=keepBareKey99", needle: "keepBareKey99" },
    { name: "bare token=", text: "token=keepBareTok99", needle: "keepBareTok99" },
    { name: "primaryKey=", text: "primaryKey=keepPrimary99", needle: "keepPrimary99" },
    { name: "sortKey=", text: "sortKey=keepSort99", needle: "keepSort99" },
    { name: "cacheKey=", text: "cacheKey=keepCache99", needle: "keepCache99" },
    { name: "foreignKey=", text: "foreignKey=keepFk99", needle: "keepFk99" },
    { name: "idempotencyKey=", text: "idempotencyKey=keepIdem99", needle: "keepIdem99" },
    { name: "nextToken=", text: "nextToken=keepNext99", needle: "keepNext99" },
    { name: "TS token: string;", text: "token: string;", needle: "string;" },
    { name: "JSX key={item.id}", text: "<li key={item.id}>", needle: "item.id" },
    { name: '{"key": "Enter"}', text: '{"key": "Enter"}', needle: "Enter" },
    { name: "TURKEY=1", text: "TURKEY=keepTurkey99", needle: "keepTurkey99" },
  ];

  for (const c of keep) {
    it(`does not redact ${c.name} in document, .bin, or TCP`, async () => {
      const out = redact(c.text);
      expect(out).toContain(c.needle);
      expect(out).not.toContain("[redacted]");
      if (c.name.startsWith("JSX")) {
        expect(out).toContain("<li key={item.id}>");
        expect(out).toContain(">");
      }
      const s = await surfaces(c.text);
      expect(s.document).toContain(c.needle);
      expect(s.document).not.toContain("[redacted]");
      expect(s.bin).toContain(c.needle);
      expect(s.tcp).toContain(c.needle);
    });
  }

  it("does not redact TURKEY=1", () => {
    const out = redact("TURKEY=1");
    expect(out).toContain("TURKEY=1");
    expect(out).not.toContain("[redacted]");
  });

  it("does not redact -port after mysql && ls", async () => {
    const text = "mysql -uroot -phunter2 && ls -port=1";
    const out = redact(text);
    expect(out).not.toContain("hunter2");
    expect(out).toContain("-p[redacted]");
    expect(out).toContain("-port=1");
    const s = await surfaces(text);
    expect(s.document).not.toContain("hunter2");
    expect(s.bin).toContain("-port=1");
    expect(s.tcp).toContain("-port=1");
    expect(s.bin).not.toContain("hunter2");
    expect(s.tcp).not.toContain("hunter2");
  });
});

describe("ASSIGN does not swallow later secrets on hook slips", () => {
  const homes: string[] = [];
  const prevHome = process.env.AGENTSLIP_HOME;
  afterEach(() => {
    for (const h of homes.splice(0)) fs.rmSync(h, { recursive: true, force: true });
    if (prevHome === undefined) delete process.env.AGENTSLIP_HOME;
    else process.env.AGENTSLIP_HOME = prevHome;
  });

  async function surfacesFromSlip(
    slip: SlipData,
  ): Promise<{ document: string; bin: string; tcp: string }> {
    const { document } = buildDocument(slip, { widthMm: 58, ticketNo: 1 });
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "agentslip-hook-"));
    homes.push(home);
    process.env.AGENTSLIP_HOME = home;
    const cfgFile = defaultConfig();
    cfgFile.driver = "file";
    await printSlip(slip, cfgFile);
    const bin = fs.readFileSync(cfgFile.file.path).toString("latin1");
    const { server, port, received } = await listen();
    try {
      const cfgTcp = defaultConfig();
      cfgTcp.driver = "escpos-tcp";
      cfgTcp.escpos = { host: "127.0.0.1", port };
      const printed = await printSlip({ ...slip, sessionId: `${slip.sessionId || "s"}-tcp` }, cfgTcp);
      expect(printed.printed).toBe(true);
      const tcp = (await received).toString("latin1");
      return { document, bin, tcp };
    } finally {
      server.close();
    }
  }

  function load(rel: string): Record<string, unknown> {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), rel), "utf8")) as Record<
      string,
      unknown
    >;
  }

  const snippets = [
    {
      name: "Bash: DB_PASS=",
      command: "DB_PASS=leakAssignDbPass99",
      stop: "Bash: DB_PASS=leakAssignDbPass99",
      needle: "leakAssignDbPass99",
    },
    {
      name: "I ran: APIKEY=",
      command: "I ran: APIKEY=leakAssignApiKey99",
      stop: "I ran: APIKEY=leakAssignApiKey99",
      needle: "leakAssignApiKey99",
    },
    {
      name: "Bash: aws_secret_access_key =",
      command: "aws_secret_access_key = leakAssignAws99",
      stop: "Bash: aws_secret_access_key = leakAssignAws99",
      needle: "leakAssignAws99",
    },
  ];

  const events: {
    name: string;
    build: (s: (typeof snippets)[number]) => Record<string, unknown>;
  }[] = [
    {
      name: "Claude Code Bash PermissionRequest",
      build: (s) => {
        const p = load("fixtures/claude-code/permission-request.json");
        p.tool_name = "Bash";
        p.tool_input = { command: s.command, description: "run" };
        return p;
      },
    },
    {
      name: "Claude Code Stop",
      build: (s) => {
        const p = load("fixtures/claude-code/stop.json");
        p.last_assistant_message = s.stop;
        return p;
      },
    },
    {
      name: "Codex PermissionRequest",
      build: (s) => {
        const p = load("fixtures/codex/permission-request.json");
        p.tool_name = "Bash";
        p.tool_input = { command: s.command, description: "run" };
        return p;
      },
    },
    {
      name: "Codex Stop",
      build: (s) => {
        const p = load("fixtures/codex/stop.json");
        p.last_assistant_message = s.stop;
        return p;
      },
    },
  ];

  for (const ev of events) {
    for (const s of snippets) {
      it(`${ev.name} redacts ${s.name} in document, .bin, and TCP`, async () => {
        const data = await parseHook(ev.build(s), frozen);
        expect(data).not.toBeNull();
        const slip = data as SlipData;
        const srf = await surfacesFromSlip(slip);
        expect(srf.document).not.toContain(s.needle);
        expect(srf.bin).not.toContain(s.needle);
        expect(srf.tcp).not.toContain(s.needle);
        expect(srf.document).toMatch(/\[redacted\]/);
      });
    }
  }
});

describe("valueLooksSecret and extra glued / flag names", () => {
  it("redacts a long unprefixed secret under key=", () => {
    const secret = "keepNotThisLongSecretValue99";
    expect(secret.length).toBeGreaterThanOrEqual(24);
    const out = redact(`key=${secret}`);
    expect(out).not.toContain(secret);
    expect(out).toContain("key=[redacted]");
  });

  it("redacts a long unprefixed secret under token=", () => {
    const secret = "keepNotThisLongSecretValue99";
    const out = redact(`token=${secret}`);
    expect(out).not.toContain(secret);
    expect(out).toContain("token=[redacted]");
  });

  const extra: { name: string; text: string; needle: string }[] = [
    { name: "ADMINPASSWORD=", text: "ADMINPASSWORD=leakAdminPw99", needle: "leakAdminPw99" },
    { name: "SLACKTOKEN=", text: "SLACKTOKEN=leakSlackTok99", needle: "leakSlackTok99" },
    { name: "stripeKey=", text: "stripeKey=leakStripeKey99", needle: "leakStripeKey99" },
    { name: "masterKey=", text: "masterKey=leakMasterKey99", needle: "leakMasterKey99" },
    {
      name: "token CLI flag",
      text: `curl --${"token"}=${"leakFlagTok99"} https://ex.test`,
      needle: "leakFlagTok99",
    },
    {
      name: "api-key CLI flag",
      text: `curl --${"api-key"} ${"leakFlagApi99"} https://ex.test`,
      needle: "leakFlagApi99",
    },
  ];

  for (const c of extra) {
    it(`redacts ${c.name}`, () => {
      const out = redact(c.text);
      expect(out).not.toContain(c.needle);
      expect(out).toMatch(/\[redacted\]/);
    });
  }
});

describe("REDACT_MAX_CHARS", () => {
  it("caps input to 4–8 KB after scanning a pad", () => {
    expect(REDACT_MAX_CHARS).toBeGreaterThanOrEqual(4 * 1024);
    expect(REDACT_MAX_CHARS).toBeLessThanOrEqual(8 * 1024);
    expect(REDACT_SCAN_PAD).toBeGreaterThanOrEqual(256);
    const huge = "a\n".repeat(50_000);
    expect(huge.length).toBeGreaterThan(REDACT_MAX_CHARS * 2);
    const out = redact(huge);
    expect(out.length).toBeLessThanOrEqual(REDACT_MAX_CHARS);
    expect(out.length).toBeLessThan(huge.length);
  });

  it("clipField turns a 9 KB token with no spaces into …", () => {
    const token = "a".repeat(9 * 1024);
    expect(token.length).toBeGreaterThan(REDACT_MAX_CHARS);
    expect(clipField(token)).toBe("…");
    expect(redact(token)).toBe("…");
  });
});

describe("Write tool_input escaped JSON (Claude Code and Codex)", () => {
  const homes: string[] = [];
  const prevHome = process.env.AGENTSLIP_HOME;
  afterEach(() => {
    for (const h of homes.splice(0)) fs.rmSync(h, { recursive: true, force: true });
    if (prevHome === undefined) delete process.env.AGENTSLIP_HOME;
    else process.env.AGENTSLIP_HOME = prevHome;
  });

  async function surfacesFromSlip(
    slip: SlipData,
  ): Promise<{ document: string; bin: string; tcp: string }> {
    const { document } = buildDocument(slip, { widthMm: 58, ticketNo: 1 });
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "agentslip-write-"));
    homes.push(home);
    process.env.AGENTSLIP_HOME = home;
    const cfgFile = defaultConfig();
    cfgFile.driver = "file";
    await printSlip(slip, cfgFile);
    const bin = fs.readFileSync(cfgFile.file.path).toString("latin1");
    const { server, port, received } = await listen();
    try {
      const cfgTcp = defaultConfig();
      cfgTcp.driver = "escpos-tcp";
      cfgTcp.escpos = { host: "127.0.0.1", port };
      const printed = await printSlip({ ...slip, sessionId: `${slip.sessionId || "s"}-tcp` }, cfgTcp);
      expect(printed.printed).toBe(true);
      const tcp = (await received).toString("latin1");
      return { document, bin, tcp };
    } finally {
      server.close();
    }
  }

  const needle = "EscJson13leak99";
  const escapedContent = String.raw`{\"apiKey\":\"EscJson13leak99\"}`;

  it("toolDetail redacts escaped JSON before stringify", () => {
    const out = toolDetail({ file_path: "src/config.ts", content: escapedContent });
    expect(out).not.toContain(needle);
    expect(out).toMatch(/\[redacted\]/);
  });

  for (const agent of [
    { name: "Claude Code", fixture: "fixtures/claude-code/permission-request.json" },
    { name: "Codex", fixture: "fixtures/codex/permission-request.json" },
  ]) {
    it(`${agent.name} Write redacts double-escaped apiKey in document, .bin, and TCP`, async () => {
      const p = JSON.parse(fs.readFileSync(path.join(process.cwd(), agent.fixture), "utf8")) as Record<
        string,
        unknown
      >;
      p.tool_name = "Write";
      p.tool_input = { file_path: "src/config.ts", content: escapedContent };
      const data = await parseHook(p, frozen);
      expect(data).not.toBeNull();
      expect(data?.request).not.toContain(needle);
      const srf = await surfacesFromSlip(data as SlipData);
      expect(srf.document).not.toContain(needle);
      expect(srf.bin).not.toContain(needle);
      expect(srf.tcp).not.toContain(needle);
      expect(srf.document).toMatch(/\[redacted\]/);
    });
  }
});

function padTo(n: number): string {
  if (n <= 1) return "\n";
  return `${"n\n".repeat(Math.ceil(n / 2) + 2).slice(0, n - 1)}\n`;
}

function straddle(secret: string, needle: string): string {
  const overlap = secret.indexOf(needle) + needle.length + 4;
  const start = Math.max(0, REDACT_MAX_CHARS - overlap);
  return `${padTo(start)}${secret}\nzz\n`;
}

function fillerTokens(n: number): string {
  return (
    Array.from({ length: n }, (_, i) => {
      const id = String(i).padStart(4, "0");
      return `${"ghp"}_FILL${id}${"x".repeat(24)}`;
    }).join("\n") + "\n"
  );
}

/** ~30 long redactable tokens, then `secret` straddling the 8704 scan limit. */
function filledStraddle(secret: string, needle: string): string {
  const scanLimit = REDACT_MAX_CHARS + REDACT_SCAN_PAD;
  const fillers = fillerTokens(30);
  const overlap = Math.min(secret.length, Math.max(8, secret.indexOf(needle) + needle.length + 4));
  const start = Math.max(fillers.length, scanLimit - overlap);
  return `${fillers}${padTo(start - fillers.length)}${secret}\nzz\n`;
}

describe("boundary: secrets straddling the 8 KB cut", () => {
  const homes: string[] = [];
  const prevHome = process.env.AGENTSLIP_HOME;
  afterEach(() => {
    for (const h of homes.splice(0)) fs.rmSync(h, { recursive: true, force: true });
    if (prevHome === undefined) delete process.env.AGENTSLIP_HOME;
    else process.env.AGENTSLIP_HOME = prevHome;
  });

  async function surfacesFromSlip(
    slip: SlipData,
  ): Promise<{ document: string; bin: string; tcp: string }> {
    const { document } = buildDocument(slip, { widthMm: 58, ticketNo: 1 });
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "agentslip-bound-"));
    homes.push(home);
    process.env.AGENTSLIP_HOME = home;
    const cfgFile = defaultConfig();
    cfgFile.driver = "file";
    await printSlip(slip, cfgFile);
    const bin = fs.readFileSync(cfgFile.file.path).toString("latin1");
    const { server, port, received } = await listen();
    try {
      const cfgTcp = defaultConfig();
      cfgTcp.driver = "escpos-tcp";
      cfgTcp.escpos = { host: "127.0.0.1", port };
      const printed = await printSlip({ ...slip, sessionId: `${slip.sessionId || "s"}-tcp` }, cfgTcp);
      expect(printed.printed).toBe(true);
      const tcp = (await received).toString("latin1");
      return { document, bin, tcp };
    } finally {
      server.close();
    }
  }

  const cases: { name: string; secret: string; needle: string }[] = [
    {
      name: "ghp_",
      needle: "BdGhpL99",
      secret: `${"ghp"}_${"BdGhpL99"}${"x".repeat(16)}`,
    },
    {
      name: "JSON apiKey",
      needle: "BdJsonL99",
      secret: `{${'"'}${"apiKey"}${'"'}:${'"'}${"BdJsonL99"}${'"'}}`,
    },
    {
      name: "postgres URL",
      needle: "BdPgL99xx",
      secret: `${"postgres"}://${"admin"}:${"BdPgL99xx"}@${"h.test"}/db`,
    },
    {
      name: "key=",
      needle: "BdKeyL99xx",
      secret: `key=${"BdKeyL99xx"}${"y".repeat(16)}`,
    },
    {
      name: "Bearer",
      needle: "BdBearL99",
      secret: `Bearer ${"BdBearL99"}${"z".repeat(12)}`,
    },
    {
      name: "eyJ",
      needle: "BdEyjL99",
      secret: `${"eyJ"}${"BdEyjL99"}.${"b".repeat(8)}.${"c".repeat(8)}`,
    },
    {
      name: "Slack webhook",
      needle: "BdSlack99",
      secret: `${"https"}://${"hooks"}.slack.com/services/${"T00"}/${"B00"}/${"BdSlack99"}${"w".repeat(16)}`,
    },
    {
      name: "sk-ant",
      needle: "BdSkAnt99",
      secret: `${"sk"}-${"ant"}-${"BdSkAnt99"}${"x".repeat(16)}`,
    },
    {
      name: "gho_",
      needle: "BdGhoL99x",
      secret: `${"gho"}_${"BdGhoL99x"}${"y".repeat(16)}`,
    },
    {
      name: "--password",
      needle: "BdPwL99xx",
      secret: `--${"password"}=${"BdPwL99xx"}${"z".repeat(12)}`,
    },
  ];

  for (const c of cases) {
    it(`redact() hides straddling ${c.name}`, () => {
      const text = straddle(c.secret, c.needle);
      expect(text.slice(0, REDACT_MAX_CHARS - 1)).toContain(c.needle);
      const out = redact(text);
      expect(out).not.toContain(c.needle);
    });

    it(`hook slip hides straddling ${c.name} in document, .bin, and TCP`, async () => {
      const command = straddle(c.secret, c.needle);
      const p = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), "fixtures/claude-code/permission-request.json"), "utf8"),
      ) as Record<string, unknown>;
      p.tool_name = "Bash";
      p.tool_input = { command, description: "run" };
      const data = await parseHook(p, frozen);
      expect(data).not.toBeNull();
      expect(data?.request).not.toContain(c.needle);
      const srf = await surfacesFromSlip(data as SlipData);
      expect(srf.document).not.toContain(c.needle);
      expect(srf.bin).not.toContain(c.needle);
      expect(srf.tcp).not.toContain(c.needle);
    });

    it(`redact() hides ${c.name} after 30 fillers at the scan-window cut`, () => {
      const text = filledStraddle(c.secret, c.needle);
      const scanLimit = REDACT_MAX_CHARS + REDACT_SCAN_PAD;
      expect(text.slice(0, scanLimit)).toContain(c.needle);
      expect(text.length).toBeGreaterThan(scanLimit);
      const out = redact(text);
      expect(out).not.toContain(c.needle);
      expect(out).not.toContain(c.secret);
    });

    it(`hook slip hides filled-straddle ${c.name} in document, .bin, and TCP`, async () => {
      const command = filledStraddle(c.secret, c.needle);
      const p = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), "fixtures/claude-code/permission-request.json"), "utf8"),
      ) as Record<string, unknown>;
      p.tool_name = "Bash";
      p.tool_input = { command, description: "run" };
      const data = await parseHook(p, frozen);
      expect(data).not.toBeNull();
      expect(data?.request).not.toContain(c.needle);
      expect(data?.request).not.toContain(c.secret);
      const srf = await surfacesFromSlip(data as SlipData);
      expect(srf.document).not.toContain(c.needle);
      expect(srf.bin).not.toContain(c.needle);
      expect(srf.tcp).not.toContain(c.needle);
    });
  }
});

describe("double-escaped JSON in a Bash command", () => {
  it("redacts apiKey after a second stringify", () => {
    const needle = "EscJsonBashLeak99";
    const q = `${"\\".repeat(3)}"`;
    const text = `Bash: echo '${"{"}${q}${"apiKey"}${q}:${q}${needle}${q}${"}"}'`;
    const out = redact(text);
    expect(out).not.toContain(needle);
    expect(out).toMatch(/\[redacted\]/);
  });
});

describe("redactDeep budget and depth", () => {
  it("adversarial MultiEdit finishes under 500 ms and stays near 12 KB", () => {
    expect(REDACT_DEEP_MAX_CHARS).toBeGreaterThanOrEqual(8 * 1024);
    expect(REDACT_DEEP_MAX_CHARS).toBeLessThanOrEqual(16 * 1024);
    const edits = Array.from({ length: 300 }, () => ({
      old_string: "a-".repeat(4096),
      new_string: "eyJ-".repeat(2048),
    }));
    const t0 = performance.now();
    const out = redactDeep({ file_path: "x.ts", edits });
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(500);
    expect(JSON.stringify(out)).toContain("…");
    expect(redactDeepStats.chars).toBeLessThanOrEqual(REDACT_DEEP_MAX_CHARS + REDACT_MAX_CHARS);
    expect(redactDeepStats.calls).toBeLessThan(8);
  });

  it("does not leave raw text past the budget", () => {
    const marker = "RawPastBudget99";
    const out = redactDeep({
      a: "a-".repeat(4096),
      b: "eyJ-".repeat(2048),
      c: marker,
    }) as Record<string, unknown>;
    expect(JSON.stringify(out)).not.toContain(marker);
    expect(out.c).toBe("…");
  });

  it("10k nesting returns a value instead of throwing", () => {
    expect(REDACT_DEEP_MAX_DEPTH).toBeGreaterThanOrEqual(8);
    let o: unknown = "leaf";
    for (let i = 0; i < 10_000; i++) o = { n: o };
    let result: unknown;
    expect(() => {
      result = redactDeep(o);
    }).not.toThrow();
    expect(JSON.stringify(result)).toContain("…");
  });
});
