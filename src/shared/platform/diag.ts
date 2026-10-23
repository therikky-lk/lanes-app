// Android test builds: a small in-memory log of what went wrong, shown in
// Settings ▸ About so it can be copied or screenshotted.
type Listener = () => void;
const lines: string[] = [];
const listeners = new Set<Listener>();

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
