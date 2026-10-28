import fs from "node:fs";
import path from "node:path";
import type { RenderedSlip } from "../types.js";

export function writeEscposFile(rendered: RenderedSlip, destPath: string): string {
  const abs = path.resolve(destPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, rendered.escpos);
  return abs;
}
