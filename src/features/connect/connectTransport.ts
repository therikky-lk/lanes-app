// Lane Connect relays: public ntfy servers. Every message is published to all
// of them and devices listen on all of them, so two devices meet as long as
// they share at least one reachable relay. The desktop app talks to the relays
// from the main process (no CORS, system networking); the phone uses SSE and
// falls back to polling when long-lived streams don't get through.
import { diag } from "@/shared/platform/diag";

export const RELAYS = ["https://ntfy.sh", "https://ntfy.envs.net"];
const POLL_MS = 3000;

export interface Relay {
  publish(text: string): Promise<void>;
  close(): void;
}

interface NtfyMessage {
  id?: string;
  event?: string;
  message?: string;
}

type Sub = { close(): void };

function browserSubscribe(
  relay: string,
  topic: string,
  deliver: (text: string) => void,
  status: (online: boolean, error?: string) => void,
): Sub {
  let closed = false;
  let source: EventSource | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let polling = false;
  let failures = 0;
  let since = String(Math.floor(Date.now() / 1000));

  const handle = (data: NtfyMessage) => {
    if (data.event && data.event !== "message") return;
    if (typeof data.message !== "string") return;
    if (data.id) since = data.id;
    deliver(data.message);
  };

  const poll = async () => {
    if (closed) return;
    try {
      const res = await fetch(`${relay}/${topic}/json?poll=1&since=${encodeURIComponent(since)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      status(true);
      for (const line of (await res.text()).split("\n")) {
        if (!line.trim()) continue;
        try {
          handle(JSON.parse(line) as NtfyMessage);
        } catch {}
      }
    } catch (error) {
      status(false, error instanceof Error ? error.message : String(error));
    }
    pollTimer = setTimeout(() => void poll(), POLL_MS);
  };

  const startPolling = () => {
    if (polling || closed) return;
    polling = true;
    source?.close();
    source = null;
    void poll();
  };

  const connect = () => {
    if (closed || polling) return;
    source = new EventSource(`${relay}/${topic}/sse`);
    source.onopen = () => {
      failures = 0;
      status(true);
    };
    source.onmessage = (event) => {
      try {
        handle(JSON.parse(event.data) as NtfyMessage);
      } catch {}
    };
    source.onerror = () => {
      status(false, "stream error");
      if (++failures >= 2) return startPolling();
      if (source?.readyState === EventSource.CLOSED) {
        source = null;
        retry = setTimeout(connect, 4000);
      }
    };
  };
  connect();
  setTimeout(() => {
    if (!closed && !polling && source && source.readyState !== EventSource.OPEN) startPolling();
  }, 8000);

  return {
    close() {
      closed = true;
      if (retry) clearTimeout(retry);
      if (pollTimer) clearTimeout(pollTimer);
      source?.close();
    },
  };
}

export function openRelay(topic: string, onMessage: (text: string) => void, onStatus: (online: boolean) => void): Relay {
  const electron = typeof window !== "undefined" ? window.linerElectron : undefined;
  const online = new Map<string, boolean>();
  const lastError = new Map<string, string>();
  const seen = new Set<string>();

  const deliver = (text: string) => {
    // the same message comes from every relay: handle it once
    if (seen.has(text)) return;
    seen.add(text);
    if (seen.size > 300) seen.delete(seen.values().next().value as string);
    onMessage(text);
  };
  const status = (relay: string, isOnline: boolean, error?: string) => {
    const was = online.get(relay);
    online.set(relay, isOnline);
    if (was !== isOnline) diag(`connect: ${relay.replace("https://", "")} ${isOnline ? "connected" : `unreachable${error ? ` (${error})` : ""}`}`);
    else if (!isOnline && error && lastError.get(relay) !== error) diag(`connect: ${relay.replace("https://", "")} unreachable (${error})`);
    if (error) lastError.set(relay, error);
    onStatus([...online.values()].some(Boolean));
  };

  const subs: Sub[] = [];
  const cleanups: (() => void)[] = [];
  if (electron?.connectSubscribe && electron.onConnectMessage && electron.onConnectStatus) {
    cleanups.push(electron.onConnectMessage((msg) => RELAYS.includes(msg.relay) && deliver(msg.text)));
    cleanups.push(electron.onConnectStatus((s) => RELAYS.includes(s.relay) && status(s.relay, s.online, s.error)));
    for (const relay of RELAYS) {
      void electron.connectSubscribe(relay, topic).catch((e: unknown) => status(relay, false, String(e)));
      cleanups.push(() => void electron.connectUnsubscribe?.(relay, topic));
    }
  } else {
    for (const relay of RELAYS) subs.push(browserSubscribe(relay, topic, deliver, (ok, err) => status(relay, ok, err)));
  }

  return {
    async publish(text: string) {
      const results = await Promise.allSettled(
        RELAYS.map((relay) =>
          electron?.connectPublish
            ? electron.connectPublish(relay, topic, text)
            : fetch(`${relay}/${topic}`, { method: "POST", body: text }).then((r) => {
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
              }),
        ),
      );
      if (results.every((r) => r.status === "rejected")) {
        const reason = (results[0] as PromiseRejectedResult).reason;
        throw reason instanceof Error ? reason : new Error(String(reason));
      }
    },
    close() {
      subs.forEach((s) => s.close());
      cleanups.forEach((c) => c());
    },
  };
}
