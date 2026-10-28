import fs from "node:fs";
import path from "node:path";
import type { RenderedSlip, SlipData } from "../types.js";
import { defaultSlipsDir } from "../paths.js";
import { formatLocalStamp } from "../clock.js";

export type SlipMeta = {
  file: string;
  kind: string;
  agent: string;
  ticketNo: number;
  sessionCode: string;
  createdAt: string;
};

export function slipsDir(override?: string): string {
  return override || defaultSlipsDir();
}

export function writeVirtualSlip(
  rendered: RenderedSlip,
  data: SlipData,
  dir?: string,
): string {
  const dest = slipsDir(dir);
  fs.mkdirSync(dest, { recursive: true });
  const stamp = formatLocalStamp(data.time);
  const name = `${String(rendered.ticketNo).padStart(4, "0")}-${data.kind}-${stamp}.svg`;
  const file = path.join(dest, name);
  fs.writeFileSync(file, rendered.svg, "utf8");
  const meta: SlipMeta = {
    file: name,
    kind: data.kind,
    agent: data.agent,
    ticketNo: rendered.ticketNo,
    sessionCode: rendered.sessionCode,
    createdAt: data.time.toISOString(),
  };
  const indexPath = path.join(dest, "index.json");
  let index: SlipMeta[] = [];
  try {
    index = JSON.parse(fs.readFileSync(indexPath, "utf8")) as SlipMeta[];
  } catch {
    index = [];
  }
  index.push(meta);
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
  return file;
}

export function listSlips(dir?: string): { meta: SlipMeta; svg: string; abs: string }[] {
  const dest = slipsDir(dir);
  const indexPath = path.join(dest, "index.json");
  let index: SlipMeta[] = [];
  try {
    index = JSON.parse(fs.readFileSync(indexPath, "utf8")) as SlipMeta[];
  } catch {
    if (!fs.existsSync(dest)) return [];
    index = fs
      .readdirSync(dest)
      .filter((f) => f.endsWith(".svg"))
      .sort()
      .map((file, i) => ({
        file,
        kind: "done",
        agent: "n/a",
        ticketNo: i + 1,
        sessionCode: "n/a",
        createdAt: "",
      }));
  }
  const out: { meta: SlipMeta; svg: string; abs: string }[] = [];
  for (const meta of index) {
    const abs = path.join(dest, meta.file);
    try {
      out.push({ meta, svg: fs.readFileSync(abs, "utf8"), abs });
    } catch {
      // skip missing
    }
  }
  return out.reverse();
}
