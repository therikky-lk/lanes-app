// Development-only diagnostics. Release builds do not keep a diagnostic log.
const recent = new Map<string, number>();

/** Keep the first failure visible without filling the log on every retry. */
export function diagThrottled(key: string, message: string, intervalMs = 60_000): void {
  if (!import.meta.env.DEV) return;
  const now = Date.now();
  if (now - (recent.get(key) ?? -Infinity) < intervalMs) return;
  recent.delete(key);
  recent.set(key, now);
  if (recent.size > 100) recent.delete(recent.keys().next().value!);
  diag(message);
}

export function diag(message: string): void {
  if (import.meta.env.DEV) console.debug(`[Lane] ${message}`);
}
