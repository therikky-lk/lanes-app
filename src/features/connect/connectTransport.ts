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
  let pollFailures = 0;
  let pollController: AbortController | null = null;
  let since = String(Math.floor(Date.now() / 1000));

  const handle = (data: NtfyMessage) => {
    if (data.event && data.event !== "message") return;
    if (typeof data.message !== "string") return;
    if (data.id) since = data.id;
    deliver(data.message);
  };

  const socketOpen = () => socket?.readyState === WebSocket.OPEN;
  const networkOnline = () => navigator.onLine !== false;

  const poll = async () => {
    pollTimer = null;
    if (closed || socketOpen() || pollController || !networkOnline()) return;
    const controller = new AbortController();
    pollController = controller;
    const timeout = setTimeout(() => controller.abort(), 6000);
    try {
      const res = await fetch(`${relay}/${topic}/json?poll=1&since=${encodeURIComponent(since)}`, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (closed || !networkOnline()) return;
      pollFailures = 0;
      if (!socketOpen()) status(true);
      for (const line of (await res.text()).split("\n")) {
        if (!line.trim()) continue;
        try {
          handle(JSON.parse(line) as NtfyMessage);
        } catch {}
      }
    } catch (error) {
      pollFailures += 1;
      if (!closed && networkOnline() && !socketOpen()) status(false, error instanceof Error ? error.message : String(error));
    } finally {
      clearTimeout(timeout);
      if (pollController === controller) pollController = null;
    }
    schedulePoll();
  };

  const schedulePoll = () => {
    if (closed || pollTimer || socketOpen() || !networkOnline()) return;
    pollTimer = setTimeout(() => void poll(), Math.min(POLL_MS * 2 ** Math.min(pollFailures, 6), 120_000));
  };

  const connect = () => {
    retry = null;
    if (closed || !networkOnline()) return;
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
      pollFailures = 0;
      pollController?.abort();
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
    if (closed || retry || !networkOnline()) return;
    failures += 1;
    // fill the gap by polling until the socket is back
    if (failures === 1) void poll();
    else schedulePoll();
    const delay = Math.min(1000 * 2 ** Math.min(failures - 1, 7), 120_000);
    retry = setTimeout(connect, delay);
  };

  // phones suspend sockets in the background: reconnect as soon as we're back
  const onVisible = () => {
    if (closed || !networkOnline() || document.visibilityState !== "visible") return;
    if (!socketOpen()) {
      if (retry) clearTimeout(retry);
      retry = null;
      socket?.close();
      socket = null;
      failures = 0;
      pollFailures = 0;
      void poll();
      connect();
    }
  };
  const onOffline = () => {
    if (retry) clearTimeout(retry);
    retry = null;
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = null;
    pollController?.abort();
    socket?.close();
    socket = null;
    if (!closed) status(false, "network offline");
  };
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("online", onVisible);
  window.addEventListener("offline", onOffline);

  connect();

  return {
    close() {
      closed = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
      window.removeEventListener("offline", onOffline);
      pollController?.abort();
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
  const seen = new Set<string>();
  let closed = false;
  const cooldowns = new Map<string, number>();

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
      if (closed) throw new Error("Relay closed");
      if (typeof navigator !== "undefined" && navigator.onLine === false) throw new Error("Network offline");
      const publishOne = async (relay: string) => {
        if (Date.now() < (cooldowns.get(relay) ?? 0)) throw new Error("HTTP 429 (relay cooldown)");
        let lastError: unknown;
        for (let attempt = 0; attempt < 3; attempt++) {
          if (closed || (typeof navigator !== "undefined" && navigator.onLine === false)) break;
          try {
            if (electron?.connectPublish) {
              await electron.connectPublish(relay, topic, text);
            } else {
              const response = await fetch(`${relay}/${topic}`, { method: "POST", body: text, signal: AbortSignal.timeout(6000) });
              if (!response.ok) throw new Error(`HTTP ${response.status}`);
            }
            return;
          } catch (error) {
            lastError = error;
            if (/\b429\b/.test(String(error))) {
              cooldowns.set(relay, Date.now() + 5 * 60_000);
              break;
            }
            if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
          }
        }
        throw lastError instanceof Error ? lastError : new Error(String(lastError));
      };
      const available = RELAYS.filter(relay => Date.now() >= (cooldowns.get(relay) ?? 0));
      const reachable = available.filter(relay => online.get(relay));
      if (available.length === 0) throw new Error("HTTP 429 (relays cooling down)");
      try {
        // One delivered copy is enough; a failed mirror must not delay controls.
        await Promise.any((reachable.length ? reachable : available).map(publishOne));
      } catch (error) {
        const reason = error instanceof AggregateError ? error.errors[0] : error;
        throw reason instanceof Error ? reason : new Error(String(reason));
      }
    },
    close() {
      closed = true;
      subs.forEach((s) => s.close());
      cleanups.forEach((c) => c());
    },
  };
}
