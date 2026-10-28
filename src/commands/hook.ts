import { parseHook } from "../hooks/parse.js";
import { printSlip } from "../print.js";
import { log } from "../log.js";
import { now } from "../clock.js";

const STDIN_MS = 900;
const HARD_MS = 1800;

export async function runHook(): Promise<void> {
  const hard = setTimeout(() => {
    log("hard timeout, exiting 0");
    process.exit(0);
  }, HARD_MS);
  hard.unref();

  try {
    const raw = await readStdin(STDIN_MS);
    if (!raw.trim()) {
      log("empty stdin");
      return;
    }
    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      log("invalid JSON payload");
      return;
    }
    const data = parseHook(payload, now());
    if (!data) {
      log("unsupported or incomplete hook event");
      return;
    }
    await printSlip(data);
  } catch (err) {
    log(`hook error: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(hard);
    // Codex Stop/SubagentStop expect JSON on stdout when exiting 0.
    try {
      process.stdout.write("{}\n");
    } catch {
      // ignore
    }
  }
}

export function readStdin(timeoutMs: number): Promise<string> {
  return new Promise((resolve) => {
    if (process.stdin.readableEnded) {
      resolve("");
      return;
    }
    const chunks: Buffer[] = [];
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(Buffer.concat(chunks).toString("utf8"));
    };
    const timer = setTimeout(finish, timeoutMs);
    process.stdin.on("data", (c: Buffer | string) => {
      chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
    });
    process.stdin.on("end", finish);
    process.stdin.on("error", finish);
    process.stdin.resume();
  });
}
