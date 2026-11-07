// Android test builds: a small in-memory log of what went wrong, shown in
// Settings ▸ About so it can be copied or screenshotted.
type Listener = () => void;
const lines: string[] = [];
const listeners = new Set<Listener>();
const recent = new Map<string, number>();

/** Keep the first failure visible without filling the log on every retry. */
export function diagThrottled(key: string, message: string, intervalMs = 60_000): void {
  const now = Date.now();
  if (now - (recent.get(key) ?? -Infinity) < intervalMs) return;
  recent.delete(key);
  recent.set(key, now);
  if (recent.size > 100) recent.delete(recent.keys().next().value!);
  diag(message);
}

export function diag(message: string): void {
  const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  lines.push(`${time}  ${message}`);
  if (lines.length > 80) lines.splice(0, lines.length - 80);
  listeners.forEach((l) => l());
}

export function diagLines(): readonly string[] {
  return lines;
}

export function onDiag(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
