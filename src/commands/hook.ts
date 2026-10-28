import { parseHook } from "../hooks/parse.js";
import { printSlip } from "../print.js";
import { log } from "../log.js";
import { now } from "../clock.js";

/** MUTATION CHECK: set to 60000 and the never-closing-stdin e2e must fail. */
export const STDIN_MS = 900;
export const HARD_MS = STDIN_MS + 900;

let exiting = false;

function writeJsonAndExit(): void {
  if (exiting) return;
  exiting = true;
  try {
    process.stdout.write("{}\n");
  } catch {
    // ignore
  }
  try {
    process.stdin.destroy();
  } catch {
    // ignore
  }
  process.exit(0);
}

export async function runHook(): Promise<void> {
  const hard = setTimeout(() => {
    log("hard timeout, exiting 0");
    writeJsonAndExit();
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
    /**
     * MUTATION CHECK: remove writeJsonAndExit from the hard-timeout path.
     * AGENTSLIP_HOOK_HANG_MS (test-only) sleeps here so HARD_MS fires first.
     */
    const hangMs = Number(process.env.AGENTSLIP_HOOK_HANG_MS);
    if (Number.isFinite(hangMs) && hangMs > 0) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, hangMs);
      });
    }
    const data = await parseHook(payload, now());
    if (!data) {
      log("unsupported or incomplete hook event");
      return;
    }
    await printSlip(data);
  } catch (err) {
    log(`hook error: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(hard);
    writeJsonAndExit();
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
      try {
        process.stdin.destroy();
      } catch {
        // ignore
      }
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
