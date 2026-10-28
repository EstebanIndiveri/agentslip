import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const root = path.dirname(fileURLToPath(import.meta.url));

function slipsRoot(): string {
  if (process.env.AGENTSLIP_HOME) return path.join(process.env.AGENTSLIP_HOME, "slips");
  return path.join(os.homedir(), ".agentslip", "slips");
}

function slipsPlugin(): Plugin {
  return {
    name: "agentslip-slips",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url || "";
        const dir = slipsRoot();
        if (url.startsWith("/api/slips")) {
          let index: { file: string; kind?: string; agent?: string; ticketNo?: number; sessionCode?: string; createdAt?: string }[] =
            [];
          try {
            index = JSON.parse(fs.readFileSync(path.join(dir, "index.json"), "utf8")) as typeof index;
          } catch {
            if (fs.existsSync(dir)) {
              index = fs
                .readdirSync(dir)
                .filter((f) => f.endsWith(".svg"))
                .sort()
                .map((file, i) => ({ file, ticketNo: i + 1, kind: "done", agent: "n/a" }));
            }
          }
          const items = [...index].reverse().map((m) => ({
            file: m.file,
            kind: m.kind ?? "done",
            agent: m.agent ?? "n/a",
            ticketNo: m.ticketNo ?? 0,
            sessionCode: m.sessionCode ?? "n/a",
            createdAt: m.createdAt ?? "",
            url: `/slips/${encodeURIComponent(m.file)}`,
          }));
          res.setHeader("content-type", "application/json");
          res.setHeader("cache-control", "no-store");
          res.end(JSON.stringify(items));
          return;
        }
        if (url.startsWith("/slips/")) {
          const file = decodeURIComponent(url.slice("/slips/".length).split("?")[0]);
          const abs = path.join(dir, file);
          const rootDir = path.resolve(dir);
          const target = path.resolve(abs);
          if (
            (target !== rootDir && !target.startsWith(rootDir + path.sep)) ||
            !fs.existsSync(abs)
          ) {
            res.statusCode = 404;
            res.end("not found");
            return;
          }
          res.setHeader("content-type", "image/svg+xml");
          res.setHeader("cache-control", "no-store");
          res.end(fs.readFileSync(abs));
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  root,
  plugins: [slipsPlugin()],
  build: {
    outDir: path.join(root, "dist"),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: false,
  },
});
