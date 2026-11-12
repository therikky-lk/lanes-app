import { retryAfterMs } from "@/shared/utils/networkRetry";

type Provider = "youtube" | "soundcloud" | "liner";
const deadlines = new Map<Provider, number>();

export class PlaybackRateLimitError extends Error {
  constructor(public readonly retryAt: number) {
    super("Playback provider returned HTTP 429");
    this.name = "PlaybackRateLimitError";
  }
}

export function recordPlaybackRateLimit(response: Response, provider: Provider, fallbackMs = 30_000): PlaybackRateLimitError {
  const now = Date.now();
  const retryAt = Math.max(deadlines.get(provider) ?? 0,
    now + retryAfterMs(response.headers.get("retry-after"), fallbackMs, now));
  deadlines.set(provider, retryAt);
  return new PlaybackRateLimitError(retryAt);
}

export function requirePlaybackProvider(provider: Provider): void {
  const retryAt = deadlines.get(provider) ?? 0;
  if (retryAt > Date.now()) throw new PlaybackRateLimitError(retryAt);
}

export function playbackPrefetchDelay(): number {
  return Math.max(0, ...Array.from(deadlines.values(), retryAt => retryAt - Date.now()));
}
