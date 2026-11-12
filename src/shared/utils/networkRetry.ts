const CONNECTION_LOSS = /ERR_NETWORK_CHANGED|ERR_CONNECTION_CLOSED|ERR_CONNECTION_RESET|network changed|connection (?:closed|reset)/i;

export function isConnectionLoss(error: unknown): boolean {
  return CONNECTION_LOSS.test(error instanceof Error ? error.message : String(error));
}

export function retryAfterMs(value: string | null, fallbackMs: number, now = Date.now()): number {
  const input = value?.trim();
  if (!input) return fallbackMs;
  if (/^\d+$/.test(input)) {
    const ms = Number(input) * 1000;
    return Number.isSafeInteger(ms) && now + ms <= Number.MAX_SAFE_INTEGER ? ms : fallbackMs;
  }
  if (!/^[a-z]{3},/i.test(input)) return fallbackMs;
  const date = Date.parse(input);
  return Number.isFinite(date) ? Math.max(0, date - now) : fallbackMs;
}
