import type { LyricsStreamEvent } from "@/shared/contracts/lyrics";

/** Decode SSE without losing events after heartbeats, CRLF or a final EOF. */
export async function* decodeLyricsStream(response: Response): AsyncGenerator<LyricsStreamEvent> {
  if (response.headers.get("content-type")?.includes("application/json")) {
    const body = await response.json();
    if (body.instrumental === true) yield { type: "done", cached: false, instrumental: true };
    else if (body.type === "done" || body.type === "provider" || body.type === "metadata") yield body;
    else yield { type: "done", cached: true, status: "not_found" };
    return;
  }
  if (!response.body) throw new Error("Empty lyrics stream");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const parse = (block: string): LyricsStreamEvent | null => {
    const data = block.split(/\r\n|\r|\n/).filter(line => line.startsWith("data:"))
      .map(line => line.slice(5).replace(/^ /, "")).join("\n");
    if (!data) return null;
    try {
      const event = JSON.parse(data);
      return ["metadata", "provider", "done"].includes(event.type) ? event : null;
    } catch { return null; }
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let separator: RegExpExecArray | null;
      while ((separator = /\r\n\r\n|\n\n|\r\r/.exec(buffer))) {
        const event = parse(buffer.slice(0, separator.index));
        buffer = buffer.slice(separator.index + separator[0].length);
        if (event) yield event;
      }
      if (done) {
        const event = parse(buffer);
        if (event) yield event;
        break;
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
