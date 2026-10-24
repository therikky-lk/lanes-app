// "My Vibe" picking logic, kept free of I/O so it can be tested.
//
// Taste: every liked track and every play counts toward its artist (likes
// weigh more, recent plays more than old ones, and what the listener liked or
// skipped during the current vibe shifts it further). Seeds for the radio
// engine are drawn from that taste; what comes back is filtered to music the
// listener has not heard yet, with only an occasional familiar track.
import type { Track } from "@/shared/types/track";

export type VibeMood = "happy" | "calm" | "sad";

export const VIBE_MOODS: readonly VibeMood[] = ["happy", "calm", "sad"];

export interface TasteSignals {
  liked: Track[];
  /** newest first; repeats count as more plays */
  history: Track[];
  /** liked while this vibe played */
  sessionLiked?: Track[];
  /** skipped in the first seconds while this vibe played */
  sessionSkipped?: Track[];
}

export interface TasteProfile {
  artists: Map<string, number>;
  /** track ids the listener already knows */
  known: Set<string>;
  seeds: { track: Track; weight: number }[];
}

export function artistKey(track: Pick<Track, "artists" | "artistList">): string {
  const name = track.artistList?.[0]?.name || track.artists?.split(/\s*(?:,|&|feat\.?|ft\.?|x)\s+/i)[0] || "";
  return name.trim().toLowerCase();
}

export function buildTaste(signals: TasteSignals): TasteProfile {
  const artists = new Map<string, number>();
  const known = new Set<string>();
  const seedWeights = new Map<string, { track: Track; weight: number }>();
  const bump = (track: Track, weight: number) => {
    if (!track?.id) return;
    known.add(track.id);
    const key = artistKey(track);
    if (key && key !== "unknown") artists.set(key, (artists.get(key) ?? 0) + weight);
    const entry = seedWeights.get(track.id) ?? { track, weight: 0 };
    entry.weight += weight;
    seedWeights.set(track.id, entry);
  };

  signals.liked.slice(0, 300).forEach((t, i) => bump(t, 3 * (1 - (i / 300) * 0.5)));
  signals.history.slice(0, 200).forEach((t, i) => bump(t, 1.5 * Math.exp(-i / 60)));
  for (const t of signals.sessionLiked ?? []) bump(t, 6);
  for (const t of signals.sessionSkipped ?? []) {
    known.add(t.id);
    const key = artistKey(t);
    if (key) artists.set(key, (artists.get(key) ?? 0) - 2);
    seedWeights.delete(t.id);
  }
  return {
    artists,
    known,
    seeds: [...seedWeights.values()].filter((s) => s.weight > 0).sort((a, b) => b.weight - a.weight),
  };
}

/** how much the listener likes this track's artist, 0..1 */
export function affinity(taste: TasteProfile, track: Track): number {
  const top = Math.max(1, ...taste.artists.values());
  const w = taste.artists.get(artistKey(track)) ?? 0;
  return Math.max(-1, Math.min(1, w / top));
}

/** weighted random picks without repeats, skipping recently used seeds */
export function pickWeighted<T extends { track: Track; weight: number }>(
  pool: T[],
  count: number,
  avoid: Set<string>,
  random: () => number = Math.random,
): Track[] {
  const items = pool.map((p) => ({ ...p, weight: avoid.has(p.track.id) ? p.weight * 0.1 : p.weight }));
  const out: Track[] = [];
  const usedArtists = new Set<string>();
  while (out.length < count && items.length) {
    const total = items.reduce((s, p) => s + Math.max(p.weight, 0.0001), 0);
    let r = random() * total;
    let index = items.length - 1;
    for (let i = 0; i < items.length; i++) {
      r -= Math.max(items[i].weight, 0.0001);
      if (r <= 0) {
        index = i;
        break;
      }
    }
    const [picked] = items.splice(index, 1);
    // seeds from different artists give a wider stream
    const key = artistKey(picked.track);
    if (usedArtists.has(key) && items.some((p) => !usedArtists.has(artistKey(p.track)))) continue;
    usedArtists.add(key);
    out.push(picked.track);
  }
  return out;
}

export interface SelectOptions {
  count: number;
  /** already queued or played in this vibe */
  exclude: Set<string>;
  /** familiar tracks allowed, as a share of the batch */
  familiarShare?: number;
  /** tracks of the chosen mood (from mood playlists): favored */
  moodIds?: Set<string>;
  random?: () => number;
}

/**
 * Rank radio candidates: new to the listener first, then by artist affinity,
 * with mood matches and a little randomness; at most one track per artist in a
 * row and a small share of familiar songs.
 */
export function selectFresh(candidates: Track[], taste: TasteProfile, options: SelectOptions): Track[] {
  const random = options.random ?? Math.random;
  const seen = new Set<string>();
  const unique = candidates.filter((t) => {
    if (!t?.id || seen.has(t.id) || options.exclude.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });
  const fresh = unique.filter((t) => !taste.known.has(t.id));
  const familiar = unique.filter((t) => taste.known.has(t.id));
  const score = (t: Track) =>
    affinity(taste, t) * 0.6 + (options.moodIds?.has(t.id) ? 0.8 : 0) + random() * 0.7;
  fresh.sort((a, b) => score(b) - score(a));
  familiar.sort((a, b) => score(b) - score(a));

  const familiarSlots = Math.min(Math.round(options.count * (options.familiarShare ?? 0.15)), familiar.length);
  const freshTaken = Math.min(fresh.length, options.count - familiarSlots);
  const picked = fresh.slice(0, freshTaken);
  // not enough new music: fill up with familiar tracks
  picked.push(...familiar.slice(0, options.count - picked.length));

  // spread artists
  const out: Track[] = [];
  const pool = picked;
  while (pool.length) {
    const last = out.length ? artistKey(out[out.length - 1]) : "";
    const i = pool.findIndex((t) => artistKey(t) !== last);
    out.push(pool.splice(i === -1 ? 0 : i, 1)[0]);
  }
  return out;
}
