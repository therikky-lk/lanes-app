import { useEffect, useMemo, useState } from "react";
import { api, mediaUrl } from "@/shared/api";
import type { ArtistAlbum } from "@/shared/contracts";
import { innertubeCatalog } from "@/shared/media/innertube";
import { exactReleaseDate } from "@/shared/media/innertube/innertubeReleaseDate";
import { isSoundCloudCatalogId } from "@/shared/media/soundcloud";
import type { Track } from "@/shared/types";
import { useSessionOwner } from "./sessionAwareLoad";
import { inReleaseWeek, likedReleaseArtists, recentReleaseItems, releaseWeekStart, type NewRelease, type ReleaseArtist } from "./weeklyReleases";
import { diag } from "@/shared/platform/diag";
import { readReleaseCache, RELEASE_CACHE_MS, releaseArtistKey, saveReleaseCache, selectReleaseCache, type ReleaseCache } from "./releaseFeedCache";

const CONCURRENT_ARTISTS = 6;
const CONCURRENT_DATES = 2;
const MAX_DATE_LOOKUPS_PER_SHELF = 3;
const todayUtc = () => new Date().toISOString().slice(0, 10);

async function loadArtistReleases(ref: ReleaseArtist, today: string, signal: AbortSignal): Promise<NewRelease[]> {
  let id = ref.id;
  if (!id) {
    const matches = await innertubeCatalog.search(ref.name, "artist", signal);
    id = matches.find((match) => match.type === "artist" && match.name.trim().toLowerCase() === ref.name.toLowerCase())?.id;
    if (!id) return [];
  }
  signal.throwIfAborted();
  const artist = isSoundCloudCatalogId(id)
    ? await api.getArtist(id)
    : await innertubeCatalog.getArtistReleaseShelves(id, signal);
  const releases: NewRelease[] = [];
  const weekStart = releaseWeekStart(today);
  const oldestYear = Number(weekStart.slice(0, 4));
  const seen = new Set<string>();

  const pending: ArtistAlbum[] = [];
  const addRelease = (release: ArtistAlbum, date: string) => {
    if (!inReleaseWeek(date, today)) return;
    releases.push({
      id: release.id,
      title: release.title,
      artist: artist.name,
      coverUrl: release.cover ? mediaUrl(release.cover.url) : "",
      totalTracks: release.totalTracks ?? release.trackCount ?? 0,
      albumType: "releaseType" in release ? String(release.releaseType) : "album",
      explicit: release.explicit,
      releaseDate: date,
    });
  };

  for (const shelf of [artist.albums, artist.singles]) {
    let lookups = 0;
    for (const release of shelf) {
      signal.throwIfAborted();
      if (seen.has(release.id)) continue;
      seen.add(release.id);
      const date = exactReleaseDate(release.releaseDate);
      if (date) addRelease(release, date);
      else if ((!release.year || release.year >= oldestYear) && lookups < MAX_DATE_LOOKUPS_PER_SHELF) {
        lookups++;
        pending.push(release);
      }
    }
  }
  for (let index = 0; index < pending.length; index += CONCURRENT_DATES) {
    signal.throwIfAborted();
    await Promise.all(pending.slice(index, index + CONCURRENT_DATES).map(async (release) => {
      const date = await lookupReleaseDate(release, signal).catch(() => undefined);
      if (date) addRelease(release, date);
    }));
  }
  signal.throwIfAborted();
  return releases;
}

async function lookupReleaseDate(release: ArtistAlbum, signal: AbortSignal): Promise<string | undefined> {
  // This is a best-effort background lookup for a release already sourced from
  // its catalog. Don't additionally query the account API on a catalog miss.
  const album = isSoundCloudCatalogId(release.id)
    ? await api.getAlbum(release.id)
    : await innertubeCatalog.getAlbum(release.id, signal);
  const date = exactReleaseDate(album.releaseDate);
  const firstTrack = album.tracks[0]?.id;
  if (date || !firstTrack || !/^(?:yt:)?[\w-]{11}$/.test(firstTrack)) return date;
  signal.throwIfAborted();
  return innertubeCatalog.getTrackReleaseDate(firstTrack, signal);
}

function itemsFrom(cache: ReleaseCache, today: string) {
  return recentReleaseItems([...cache.values()].flatMap(({ releases }) => releases), today);
}

export function useNewReleases(tracks: Track[], likesLoading: boolean) {
  const owner = useSessionOwner();
  const serialized = useMemo(() => likesLoading ? null : JSON.stringify(likedReleaseArtists(tracks)), [tracks, likesLoading]);
  const key = JSON.stringify([owner, serialized]);
  const cachedItems = useMemo(() => {
    const cache = readReleaseCache(owner);
    return itemsFrom(serialized === null ? cache : selectReleaseCache(cache, JSON.parse(serialized)), todayUtc());
  }, [owner, serialized]);
  const [result, setResult] = useState<{
    key: string; items: ReturnType<typeof recentReleaseItems>; done: boolean; hasError: boolean;
  }>();
  useEffect(() => {
    if (serialized === null) return;
    const artists: ReleaseArtist[] = JSON.parse(serialized);
    const controller = new AbortController();
    const { signal } = controller;
    const today = todayUtc();
    const now = Date.now();
    const started = performance.now();
    const stored = readReleaseCache(owner);
    const cache = selectReleaseCache(stored, artists);
    const queue = artists.filter((artist) => {
      const checked = cache.get(releaseArtistKey(artist))?.checkedAt;
      return checked === undefined || checked > now || now - checked >= RELEASE_CACHE_MS ||
        new Date(checked).toISOString().slice(0, 10) !== today;
    });
    const publish = (done: boolean, hasError = false) => {
      const items = itemsFrom(cache, today);
      setResult({ key, items, done, hasError });
      return items.length;
    };

    async function refresh() {
      let failures = 0;
      let persisted = owner ? true : false;
      diag(`new releases: artists=${artists.length} cached=${cache.size} fresh=${artists.length - queue.length} visible=${publish(false)} queued=${queue.length}`);
      if (stored.size !== cache.size) persisted = saveReleaseCache(owner, cache, today);
      for (let index = 0; index < queue.length && !signal.aborted; index += CONCURRENT_ARTISTS) {
        const batch = queue.slice(index, index + CONCURRENT_ARTISTS);
        await Promise.all(batch.map(async (artist) => {
          try {
            const releases = await loadArtistReleases(artist, today, signal);
            if (!signal.aborted) {
              const artistKey = releaseArtistKey(artist);
              const saved = cache.get(artistKey)?.releases ?? [];
              const byId = new Map([...saved, ...releases].filter(({ releaseDate }) => inReleaseWeek(releaseDate, today))
                .map((release) => [release.id, release]));
              cache.set(artistKey, { checkedAt: Date.now(), releases: [...byId.values()] });
            }
          } catch {
            if (!signal.aborted) failures++;
          }
        }));
        if (signal.aborted) return;
        persisted = saveReleaseCache(owner, cache, today);
        const visible = publish(false);
        const processed = index + batch.length;
        if (index === 0 || processed === queue.length || processed % (CONCURRENT_ARTISTS * 4) === 0) {
          diag(`new releases batch: processed=${processed}/${queue.length} visible=${visible} errors=${failures} elapsed=${Math.round(performance.now() - started)}ms`);
        }
      }
      if (signal.aborted) return;
      const visible = publish(true, queue.length > 0 && failures === queue.length && cache.size === 0);
      diag(`new releases done: visible=${visible} cached=${cache.size} errors=${failures} saved=${persisted} elapsed=${Math.round(performance.now() - started)}ms`);
    }
    void refresh();
    return () => controller.abort();
  }, [owner, serialized, key]);

  const visible = result?.key === key ? result : undefined;
  return {
    items: visible?.items ?? cachedItems,
    isLoading: likesLoading || (serialized !== "[]" && !visible?.done),
    hasError: visible?.hasError ?? false,
  };
}
