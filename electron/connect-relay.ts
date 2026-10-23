// Lane Connect relay for the desktop app, run in the main process with Node's
// own networking: no renderer CORS rules, system DNS, and errors we can report.
import { ipcMain, type WebContents } from "electron";

const TOPIC = /^lane_[a-f0-9]{20,64}$/;
const ALLOWED_RELAYS = new Set(["https://ntfy.sh", "https://ntfy.envs.net"]);

interface Subscription {
  abort: AbortController;
}

const subscriptions = new Map<string, Subscription>();

function key(relay: string, topic: string): string {
  return `${relay}/${topic}`;
}

async function streamLoop(sender: WebContents, relay: string, topic: string, abort: AbortController): Promise<void> {
  let backoff = 2000;
  while (!abort.signal.aborted && !sender.isDestroyed()) {
    try {
      const res = await fetch(`${relay}/${topic}/json`, { signal: abort.signal });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      sender.send("connect:status", { relay, online: true });
      backoff = 2000;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line) continue;
          try {
            const msg = JSON.parse(line) as { event?: string; message?: string; id?: string };
            if (msg.event === "message" && typeof msg.message === "string" && !sender.isDestroyed()) {
              sender.send("connect:message", { relay, id: msg.id, text: msg.message });
            }
          } catch {}
        }
      }
      throw new Error("stream ended");
    } catch (error) {
      if (abort.signal.aborted || sender.isDestroyed()) return;
      sender.send("connect:status", { relay, online: false, error: error instanceof Error ? error.message : String(error) });
      await new Promise((r) => setTimeout(r, backoff));
      backoff = Math.min(backoff * 2, 30_000);
    }
  }
}

export function registerConnectRelay(): void {
  ipcMain.handle("connect:subscribe", (event, request: { relay: string; topic: string }) => {
    if (!ALLOWED_RELAYS.has(request.relay) || !TOPIC.test(request.topic)) throw new Error("not allowed");
    const k = key(request.relay, request.topic);
    subscriptions.get(k)?.abort.abort();
    const abort = new AbortController();
    subscriptions.set(k, { abort });
    void streamLoop(event.sender, request.relay, request.topic, abort);
    return true;
  });
  ipcMain.handle("connect:unsubscribe", (_event, request: { relay: string; topic: string }) => {
    const k = key(request.relay, request.topic);
    subscriptions.get(k)?.abort.abort();
    subscriptions.delete(k);
    return true;
  });
  ipcMain.handle("connect:publish", async (_event, request: { relay: string; topic: string; text: string }) => {
    if (!ALLOWED_RELAYS.has(request.relay) || !TOPIC.test(request.topic)) throw new Error("not allowed");
    const res = await fetch(`${request.relay}/${request.topic}`, { method: "POST", body: request.text });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return true;
  });
}
