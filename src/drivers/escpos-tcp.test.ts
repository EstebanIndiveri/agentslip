import net from "node:net";
import { describe, expect, it } from "vitest";
import { sendEscposTcp } from "./escpos-tcp.js";
import { renderSlip } from "../slips/document.js";
import { defaultConfig } from "../config.js";
import type { SlipData } from "../types.js";

const data: SlipData = {
  kind: "done",
  agent: "Claude Code",
  event: "Stop",
  sessionId: "abc123",
  repo: "demo-app",
  branch: "main",
  time: new Date("2026-10-27T15:00:00.000Z"),
  gitShortstat: "1 file changed, 3 insertions(+)",
  summary: "I've completed the refactoring. Here's a summary...",
};

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

describe("escpos-tcp fake printer", () => {
  it("receives bytes that match the snapshot render", async () => {
    const { server, port, received } = await listen();
    try {
      const rendered = renderSlip(data, defaultConfig(), 1);
      const result = await sendEscposTcp(rendered.escpos, "127.0.0.1", port, 800);
      expect(result.ok).toBe(true);
      const bytes = await received;
      expect(bytes.equals(rendered.escpos)).toBe(true);
    } finally {
      server.close();
    }
  });

  it("returns quickly when the printer is down", async () => {
    const start = Date.now();
    const result = await sendEscposTcp(Buffer.from("x"), "127.0.0.1", 1, 800);
    const ms = Date.now() - start;
    expect(result.ok).toBe(false);
    expect(ms).toBeLessThan(2000);
  });
});
