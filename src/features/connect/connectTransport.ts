// Relay over ntfy.sh: publish with a POST, receive with Server-Sent Events.
// When SSE can't get through (some networks/proxies cut long-lived streams),
// fall back to polling the topic every few seconds.
const RELAY = "https://ntfy.sh";
const POLL_MS = 3000;

export interface Relay {
  publish(text: string): Promise<void>;
  close(): void;
}

interface NtfyMessage {
  id?: string;
  event?: string;
  message?: string;
  time?: number;
}

export function openRelay(topic: string, onMessage: (text: string) => void, onStatus: (online: boolean) => void): Relay {
  let closed = false;
  let source: EventSource | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let sseFailures = 0;
  let polling = false;
  let since = String(Math.floor(Date.now() / 1000));
  const seen = new Set<string>();

  const deliver = (data: NtfyMessage) => {
    if (data.event && data.event !== "message") return;
    if (typeof data.message !== "string") return;
    if (data.id) {
      if (seen.has(data.id)) return;
      seen.add(data.id);
      if (seen.size > 500) seen.delete(seen.values().next().value as string);
      since = data.id;
    }
    onMessage(data.message);
  };

  const poll = async () => {
    if (closed || !polling) return;
    try {
      const res = await fetch(`${RELAY}/${topic}/json?poll=1&since=${encodeURIComponent(since)}`);
      if (!res.ok) throw new Error(String(res.status));
      onStatus(true);
      const text = await res.text();
      for (const line of text.split("\n")) {
        if (!line.trim()) continue;
        try {
          deliver(JSON.parse(line) as NtfyMessage);
        } catch {}
      }
    } catch {
      onStatus(false);
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
    source = new EventSource(`${RELAY}/${topic}/sse`);
    source.onopen = () => {
      sseFailures = 0;
      onStatus(true);
    };
    source.onmessage = (event) => {
      try {
        deliver(JSON.parse(event.data) as NtfyMessage);
      } catch {}
    };
    source.onerror = () => {
      onStatus(false);
      sseFailures += 1;
      if (sseFailures >= 2) {
        startPolling();
        return;
      }
      if (source?.readyState === EventSource.CLOSED) {
        source = null;
        retry = setTimeout(connect, 4000);
      }
    };
  };
  connect();
  // no stream within a few seconds: switch to polling right away
  setTimeout(() => {
    if (!closed && !polling && source && source.readyState !== EventSource.OPEN) startPolling();
  }, 8000);

  return {
    async publish(text: string) {
      if (closed) return;
      await fetch(`${RELAY}/${topic}`, { method: "POST", body: text });
    },
    close() {
      closed = true;
      polling = false;
      if (retry) clearTimeout(retry);
      if (pollTimer) clearTimeout(pollTimer);
      source?.close();
      source = null;
    },
  };
}
