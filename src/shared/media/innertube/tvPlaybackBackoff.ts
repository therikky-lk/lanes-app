const RELOAD_REQUIRED = /(?:the )?page needs to be reloaded/i;
const COOLDOWN_MS = 5 * 60_000;
const FAILURE_LIMIT = 3;

let repeatedReloads = 0;
let disabledUntil = 0;

export function tvPlaybackDelay(now = Date.now()): number {
  if (disabledUntil > now) return disabledUntil - now;
  if (disabledUntil) resetTvPlaybackBackoff();
  return 0;
}

export function recordTvPlaybackFailure(error: unknown, now = Date.now()): boolean {
  if (tvPlaybackDelay(now)) return false;
  const message = error instanceof Error ? error.message : String(error);
  if (!RELOAD_REQUIRED.test(message)) {
    repeatedReloads = 0;
    return false;
  }
  if (++repeatedReloads < FAILURE_LIMIT) return false;
  disabledUntil = now + COOLDOWN_MS;
  return true;
}

export function resetTvPlaybackBackoff(): void {
  repeatedReloads = 0;
  disabledUntil = 0;
}
