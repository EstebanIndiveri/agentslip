import { parseHook } from "../hooks/parse.js";
import { printSlip } from "../print.js";
import { loadConfig } from "../config.js";
import { log } from "../log.js";
import { now } from "../clock.js";
import { examples } from "../examples.js";

export async function runTest(): Promise<void> {
  const config = loadConfig();
  for (const fx of examples) {
    const data = await parseHook(fx, now());
    if (!data) {
      log("test fixture failed to parse");
      continue;
    }
    await printSlip(data, config);
  }
  log("printed example DONE, NEEDS YOU, and SESSION tickets");
}
