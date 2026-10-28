import { describe, expect, it } from "vitest";
import { redact, REDACTION_ENABLED } from "./redact.js";
import { buildDocument, renderFromDocument } from "./slips/document.js";
import type { SlipData } from "./types.js";

const SECRET_TEXT =
  "key sk-ant-api03-EXAMPLEKEYNOTREAL000000000000 and ghp_abcdefghijklmnopqrstuvwx000011 " +
  "AKIAIOSFODNN7EXAMPLE0 xoxb-1234567890-abcdefghijk OPENAI_API_KEY=sk-proj-EXAMPLEKEYNOTREAL " +
  "https://alice:s3cr3tpass@example.com/repo.git SECRET_KEY=super-secret-value " +
  "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aaa.bbb";

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

  it("does not leak secrets into SVG or ESC/POS", () => {
    const data: SlipData = {
      kind: "needs-you",
      agent: "Claude Code",
      event: "PermissionRequest",
      sessionId: "sec",
      time: new Date("2026-10-27T15:00:00.000Z"),
      request: SECRET_TEXT,
    };
    const built = buildDocument(data, { widthMm: 58, ticketNo: 1, redactEnabled: true });
    const { svg, escpos } = renderFromDocument(built.document, built.cpl);
    const hex = escpos.toString("latin1");
    for (const needle of [
      "sk-ant-api03",
      "ghp_abcdefghijklmnopqrstuvwx000011",
      "s3cr3tpass",
      "super-secret-value",
    ]) {
      expect(svg).not.toContain(needle);
      expect(hex).not.toContain(needle);
    }
  });
});
