// Relay over ntfy.sh: publish with a POST, receive with Server-Sent Events.
const RELAY = "https://ntfy.sh";

export interface Relay {
  publish(text: string): Promise<void>;
  close(): void;
}

export function openRelay(topic: string, onMessage: (text: string) => void, onStatus: (online: boolean) => void): Relay {
  let closed = false;
  let source: EventSource | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;

  const connect = () => {
    if (closed) return;
    source = new EventSource(`${RELAY}/${topic}/sse`);
    source.onopen = () => onStatus(true);
    source.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as { event?: string; message?: string };
        if (data.event === "message" && typeof data.message === "string") onMessage(data.message);
      } catch {}
    };
    source.onerror = () => {
      onStatus(false);
      // EventSource retries by itself, but gives up on some errors: restart
      if (source?.readyState === EventSource.CLOSED) {
        source = null;
        retry = setTimeout(connect, 5000);
      }
    };
  };
  connect();

  return {
    async publish(text: string) {
      if (closed) return;
      await fetch(`${RELAY}/${topic}`, { method: "POST", body: text });
    },
    close() {
      closed = true;
      if (retry) clearTimeout(retry);
      source?.close();
      source = null;
    },
  };
}
