import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startViewerServer } from "./viewer-server.js";

describe("viewer server", () => {
  let server: http.Server;
  let port: number;
  let slips: string;

  beforeAll(async () => {
    slips = fs.mkdtempSync(path.join(os.tmpdir(), "agentslip-viewer-test-"));
    ({ server } = await startViewerServer({ port: 0, staticDir: "viewer/dist", slips }));
    port = (server.address() as { port: number }).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
    fs.rmSync(slips, { recursive: true, force: true });
  });

  function request(path: string, host: string): Promise<number | undefined> {
    return new Promise((resolve, reject) => {
      http.get({ host: "127.0.0.1", port, path, headers: { host } }, (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode));
      }).on("error", reject);
    });
  }

  it("rejects foreign Host headers and accepts loopback hosts", async () => {
    expect(await request("/api/slips", `attacker.example:${port}`)).toBe(403);
    expect(await request("/api/slips", `127.0.0.1:${port}`)).toBe(200);
    expect(await request("/api/slips", `localhost:${port}`)).toBe(200);
  });

  it("rejects malformed escape sequences without crashing", async () => {
    expect(await request("/slips/%zz", `127.0.0.1:${port}`)).toBe(400);
    expect(await request("/api/slips", `127.0.0.1:${port}`)).toBe(200);
  });
});
