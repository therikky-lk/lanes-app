// Lane Connect relays: public ntfy servers. Every message is published to all
// of them and devices listen on all of them, so two devices meet as long as
// they share at least one reachable relay. The desktop app talks to the relays
// from the main process (no CORS, system networking); the phone uses a
// WebSocket and polls only while the socket is down.
import { diag } from "@/shared/platform/diag";

export const RELAYS = ["https://ntfy.sh", "https://ntfy.envs.net"];
const POLL_MS = 1500;

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
  // A WebSocket is the primary channel: messages arrive within a fraction of a
  // second, and unlike fetch/XHR it isn't routed through CapacitorHttp (which
  // buffers whole responses) and unlike SSE it survives Android WebView well.
  // While the socket is down, poll often and keep retrying the socket, so a
  // hiccup never leaves the device on slow polling for good.
  let closed = false;
  let socket: WebSocket | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let failures = 0;
  let since = String(Math.floor(Date.now() / 1000));

  const handle = (data: NtfyMessage) => {
    if (data.event && data.event !== "message") return;
    if (typeof data.message !== "string") return;
    if (data.id) since = data.id;
    deliver(data.message);
  };

  const socketOpen = () => socket?.readyState === WebSocket.OPEN;

  const poll = async () => {
    pollTimer = null;
    if (closed || socketOpen()) return;
    try {
      const res = await fetch(`${relay}/${topic}/json?poll=1&since=${encodeURIComponent(since)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!socketOpen()) status(true);
      for (const line of (await res.text()).split("\n")) {
        if (!line.trim()) continue;
        try {
          handle(JSON.parse(line) as NtfyMessage);
        } catch {}
      }
    } catch (error) {
      if (!socketOpen()) status(false, error instanceof Error ? error.message : String(error));
    }
    schedulePoll();
  };

  const schedulePoll = () => {
    if (closed || pollTimer || socketOpen()) return;
    pollTimer = setTimeout(() => void poll(), POLL_MS);
  };

  const connect = () => {
    retry = null;
    if (closed) return;
    const url = `${relay.replace(/^http/, "ws")}/${topic}/ws?since=${encodeURIComponent(since)}`;
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch (error) {
      status(false, error instanceof Error ? error.message : String(error));
      return reconnect();
    }
    socket = ws;
    let opened = false;
    // a socket stuck connecting counts as a failure
    const guard = setTimeout(() => {
      if (!opened && socket === ws) ws.close();
    }, 6000);
    ws.onopen = () => {
      opened = true;
      clearTimeout(guard);
      failures = 0;
      if (pollTimer) clearTimeout(pollTimer);
      pollTimer = null;
      status(true);
    };
    ws.onmessage = (event) => {
      try {
        handle(JSON.parse(String(event.data)) as NtfyMessage);
      } catch {}
    };
    ws.onerror = () => {};
    ws.onclose = () => {
      clearTimeout(guard);
      if (socket !== ws) return;
      socket = null;
      if (closed) return;
      if (opened) status(false, "socket closed");
      reconnect();
    };
  };

  const reconnect = () => {
    if (closed || retry) return;
    failures += 1;
    // fill the gap by polling until the socket is back
    if (failures === 1) void poll();
    else schedulePoll();
    const delay = Math.min(1000 * 2 ** Math.min(failures - 1, 4), 15_000);
    retry = setTimeout(connect, delay);
  };

  // phones suspend sockets in the background: reconnect as soon as we're back
  const onVisible = () => {
    if (closed || document.visibilityState !== "visible") return;
    if (!socketOpen()) {
      if (retry) clearTimeout(retry);
      retry = null;
      socket?.close();
      socket = null;
      failures = 0;
      void poll();
      connect();
    }
  };
  document.addEventListener("visibilitychange", onVisible);

  connect();

  return {
    close() {
      closed = true;
      document.removeEventListener("visibilitychange", onVisible);
      if (retry) clearTimeout(retry);
      if (pollTimer) clearTimeout(pollTimer);
      const ws = socket;
      socket = null;
      ws?.close();
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
