import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { defaultConfig } from "./config.js";
import { printSlip } from "./print.js";
import { redact, REDACTION_ENABLED } from "./redact.js";
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
