import type { LyricsCandidate } from "@/shared/contracts/lyrics";

type LyricsCacheState = {
  candidate: LyricsCandidate;
  timestamp?: number;
  lastCheckedAt?: number;
  userLocked?: boolean;
  sourceApi?: string;
  complete?: boolean;
  fallback?: boolean;
};

export function needsLyricsRefresh(cache: LyricsCacheState, sourceApi: string, now = Date.now()): boolean {
  if (cache.userLocked) return false;
  if (!cache.complete || cache.sourceApi !== sourceApi) return true;
  const candidate = cache.candidate;
  const provisional = cache.fallback || /^(lrclib|youtube music)$/i.test(candidate.provider) ||
    (/^(cadence|polaris|polaris[ _-]mono)$/i.test(candidate.provider) &&
      !["word_level", "syllable_level"].includes(candidate.syncLevel));
  const ttl = provisional ? 5 * 60_000 : 7 * 24 * 60 * 60_000;
  return now - (cache.lastCheckedAt || cache.timestamp || 0) >= ttl;
}
