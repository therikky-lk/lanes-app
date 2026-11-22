import { exactReleaseDate } from "@/shared/media/innertube/innertubeReleaseDate";
import { inReleaseWeek, type NewRelease, type ReleaseArtist } from "./weeklyReleases";

const KEY = "lane_release_feed_v1";
const MAX_ARTISTS = 2000;
export const RELEASE_CACHE_MS = 30 * 60_000;
export type ReleaseEntry = { checkedAt: number; releases: NewRelease[] };
export type ReleaseCache = Map<string, ReleaseEntry>;

export function releaseArtistKey(artist: ReleaseArtist): string {
  return artist.id ? `id:${artist.id}` : `name:${artist.name.trim().toLowerCase()}`;
}

function isRelease(value: unknown): value is NewRelease {
  if (!value || typeof value !== "object") return false;
  const release = value as Partial<NewRelease>;
  return typeof release.id === "string" && typeof release.title === "string" &&
    typeof release.artist === "string" && typeof release.coverUrl === "string" &&
    typeof release.totalTracks === "number" && typeof release.albumType === "string" &&
    typeof release.releaseDate === "string" && exactReleaseDate(release.releaseDate) === release.releaseDate;
}

export function readReleaseCache(owner: string): ReleaseCache {
  if (!owner) return new Map();
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (stored?.owner !== owner || !Array.isArray(stored.entries)) return new Map();
    const cache: ReleaseCache = new Map();
    for (const pair of stored.entries.slice(0, MAX_ARTISTS)) {
      if (!Array.isArray(pair) || typeof pair[0] !== "string") continue;
      const entry = pair[1];
      if (!entry || !Number.isFinite(entry.checkedAt) || entry.checkedAt < 0 ||
        entry.checkedAt > 8.64e15 || !Array.isArray(entry.releases)) continue;
      cache.set(pair[0], { checkedAt: entry.checkedAt, releases: entry.releases.filter(isRelease) });
    }
    return cache;
  } catch {
    return new Map();
  }
}

export function saveReleaseCache(owner: string, cache: ReleaseCache, today: string): boolean {
  if (!owner) return false;
  try {
    const entries = [...cache].slice(0, MAX_ARTISTS).map(([key, entry]) => [
      key, { ...entry, releases: entry.releases.filter(({ releaseDate }) => inReleaseWeek(releaseDate, today)) },
    ]);
    localStorage.setItem(KEY, JSON.stringify({ owner, entries }));
    return true;
  } catch {
    return false;
  }
}

export function selectReleaseCache(cache: ReleaseCache, artists: ReleaseArtist[]): ReleaseCache {
  const result: ReleaseCache = new Map();
  for (const artist of artists) {
    const key = releaseArtistKey(artist);
    const entry = cache.get(key);
    if (entry) result.set(key, entry);
  }
  return result;
}
