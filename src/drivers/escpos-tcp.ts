import net from "node:net";

export type TcpResult = { ok: true } | { ok: false; error: string };

/**
 * Send ESC/POS bytes to a network printer. Always returns within `timeoutMs`.
 */
export function sendEscposTcp(
  bytes: Buffer,
  host: string,
  port: number,
  timeoutMs = 800,
): Promise<TcpResult> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (result: TcpResult) => {
      if (settled) return;
      settled = true;
      try {
        socket.destroy();
      } catch {
        // ignore
      }
      resolve(result);
    };

    const socket = net.connect({ host, port });
    socket.setTimeout(timeoutMs);
    socket.on("connect", () => {
      socket.write(bytes, (err) => {
        if (err) {
          done({ ok: false, error: err.message });
          return;
        }
        socket.end();
        done({ ok: true });
      });
    });
    socket.on("timeout", () => done({ ok: false, error: "timeout" }));
    socket.on("error", (err) => done({ ok: false, error: err.message }));
  });
}
