import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { listSlips, slipsDir } from "./drivers/virtual.js";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".png": "image/png",
  ".gif": "image/gif",
  ".map": "application/json",
};

export function startViewerServer(opts: {
  port: number;
  staticDir: string;
  slips?: string;
}): Promise<{ server: http.Server; url: string }> {
  const dir = slipsDir(opts.slips);
  const server = http.createServer((req, res) => {
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : opts.port;
    // Reject attacker-controlled DNS names even when they resolve to loopback.
    if (req.headers.host !== `127.0.0.1:${port}` && req.headers.host !== `localhost:${port}`) {
      res.writeHead(403);
      res.end("forbidden host");
      return;
    }
    let url: URL;
    try {
      url = new URL(req.url || "/", "http://127.0.0.1");
    } catch {
      res.writeHead(400);
      res.end("bad URL");
      return;
    }
    if (url.pathname === "/api/slips") {
      const items = listSlips(dir).map((s) => ({
        file: s.meta.file,
        kind: s.meta.kind,
        agent: s.meta.agent,
        ticketNo: s.meta.ticketNo,
        sessionCode: s.meta.sessionCode,
        createdAt: s.meta.createdAt,
        url: `/slips/${encodeURIComponent(s.meta.file)}`,
      }));
      res.writeHead(200, {
        "content-type": "application/json",
        "cache-control": "no-store",
      });
      res.end(JSON.stringify(items));
      return;
    }
    if (url.pathname.startsWith("/slips/")) {
      let file: string;
      try {
        file = decodeURIComponent(url.pathname.slice("/slips/".length));
      } catch {
        res.writeHead(400);
        res.end("bad path");
        return;
      }
      if (file.includes("..") || path.isAbsolute(file)) {
        res.writeHead(400);
        res.end("bad path");
        return;
      }
      const abs = path.join(dir, file);
      if (!isInside(abs, dir)) {
        res.writeHead(400);
        res.end("bad path");
        return;
      }
      try {
        const body = fs.readFileSync(abs);
        res.writeHead(200, { "content-type": "image/svg+xml", "cache-control": "no-store" });
        res.end(body);
      } catch {
        res.writeHead(404);
        res.end("not found");
      }
      return;
    }
    let rel = url.pathname === "/" ? "/index.html" : url.pathname;
    const abs = path.join(opts.staticDir, rel);
    if (!isInside(abs, opts.staticDir)) {
      res.writeHead(400);
      res.end("bad path");
      return;
    }
    try {
      const body = fs.readFileSync(abs);
      const ext = path.extname(abs);
      res.writeHead(200, { "content-type": MIME[ext] || "application/octet-stream" });
      res.end(body);
    } catch {
      if (rel !== "/index.html") {
        try {
          const body = fs.readFileSync(path.join(opts.staticDir, "index.html"));
          res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
          res.end(body);
          return;
        } catch {
          // fall through
        }
      }
      res.writeHead(404);
      res.end("not found");
    }
  });
  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(opts.port, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : opts.port;
      resolve({ server, url: `http://127.0.0.1:${port}/` });
    });
  });
}

function isInside(abs: string, root: string): boolean {
  const resolved = path.resolve(root);
  const target = path.resolve(abs);
  return target === resolved || target.startsWith(resolved + path.sep);
}
