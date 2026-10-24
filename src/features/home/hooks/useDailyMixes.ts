import { useEffect, useState } from "react";
import { api, toClientTrack, mediaUrl } from "@/shared/api";
import { queryCache } from "@/shared/cache/queryCache";
import type { Track } from "@/shared/types";
import type { CollectionPageData } from "@/features/collection/hooks/useCollection";
import { loadWithRetry, useSessionOwner } from "./sessionAwareLoad";
import { buildDailyMixes, type MixSeedTrack } from "../mixes/buildDailyMixes";
import { createTranslatorSync, getStoredLocale } from "@/languages";

export interface DailyMix {
  id: string;
  title: string;
  description: string;
  clusterArtists: string[];
  coverUrl?: string;
  trackCount: number;
  tracks: Track[];
  /** number shown on the cover */
  mixIndex?: number;
  /** up to four covers from different artists for the cover mosaic */
  mosaic?: string[];
}

export function mixMosaic(tracks: Track[]): string[] {
  const seen = new Set<string>();
  const covers: string[] = [];
  for (const track of tracks) {
    const artist = (track.artistList?.[0]?.name || track.artists || "").toLowerCase();
    if (!track.coverUrl || seen.has(artist) || covers.includes(track.coverUrl)) continue;
    seen.add(artist);
    covers.push(track.coverUrl);
    if (covers.length === 4) break;
  }
  return covers;
}

function mixLabel(): string {
  const t = createTranslatorSync(getStoredLocale());
  const label = t("home.mix_label");
  return label && label !== "home.mix_label" ? label : "Mix";
}

export function getDailyMixArtists(
  clusterArtists?: string[],
  tracks?: Track[],
  targetCount: number = 4,
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  const addName = (raw?: string) => {
    if (!raw) return;
    const name = raw.trim();
    if (!name || name.toLowerCase() === "unknown" || seen.has(name.toLowerCase())) {
      return;
    }
    seen.add(name.toLowerCase());
    result.push(name);
  };

  if (Array.isArray(clusterArtists)) {
    for (const name of clusterArtists) {
      addName(name);
      if (result.length >= targetCount) return result;
    }
  }

  if (Array.isArray(tracks)) {
    for (const track of tracks) {
      if (track.artistList && track.artistList.length > 0) {
        for (const a of track.artistList) {
          addName(a.name);
          if (result.length >= targetCount) return result;
        }
      } else if (track.artists) {
        const parts = track.artists.split(",").map((p) => p.trim()).filter(Boolean);
        for (const part of parts) {
          addName(part);
          if (result.length >= targetCount) return result;
        }
      }
    }
  }

  return result;
}

const cache = { data: [] as DailyMix[], timestamp: 0, owner: "" };

// ---- client-built mixes (Lane) -------------------------------------------

const LANE_MIXES_KEY = "lane_daily_mixes_v4";
const today = () => new Date().toLocaleDateString("en-CA");

interface StoredMixes {
  day: string;
  owner: string;
  mixes: DailyMix[];
}

function readStoredMixes(owner: string): DailyMix[] | null {
  try {
    const stored = JSON.parse(localStorage.getItem(LANE_MIXES_KEY) || "null") as StoredMixes | null;
    return stored && stored.day === today() && stored.owner === owner && stored.mixes.length > 0 ? stored.mixes : null;
  } catch {
    return null;
  }
}

function cacheCollection(mix: DailyMix) {
  const collectionData: CollectionPageData = {
    type: "playlist",
    title: mix.title,
    author: mix.clusterArtists.length > 0 ? mix.clusterArtists.join(", ") : "Daily Mix",
    description: mix.description,
    coverUrl: mix.coverUrl || "",
    tracks: mix.tracks,
    isDailyMix: true,
    ...(mix.mixIndex ? { mixCover: { index: mix.mixIndex, covers: mix.mosaic ?? [], label: mixLabel() } } : {}),
  };
  queryCache.set(`collection:playlist:${mix.id}`, collectionData);
}

let building: Promise<DailyMix[]> | null = null;

/** liked tracks + history -> ten long mixes grown with the radio engine */
async function buildClientMixes(owner: string): Promise<DailyMix[]> {
  const [history, liked] = await Promise.all([
    api.getHistory(undefined, 200).catch(() => ({ items: [] as { track?: unknown }[] })),
    api.listLikedTracks(300).catch(() => ({ items: [] as { track?: unknown }[] })),
  ]);
  const seeds: MixSeedTrack[] = [];
  for (const entry of (liked.items || []) as { track?: Parameters<typeof toClientTrack>[0] }[]) {
    if (entry.track) seeds.push({ ...toClientTrack(entry.track), weight: 3 });
  }
  for (const entry of (history.items || []) as { track?: Parameters<typeof toClientTrack>[0] }[]) {
    if (entry.track) seeds.push({ ...toClientTrack(entry.track), weight: 1 });
  }
  if (seeds.length < 5) return [];

  const t = createTranslatorSync(getStoredLocale());
  const built = await buildDailyMixes(seeds, {
    mixCount: 10,
    artistTracks: (name) =>
      api.search(name, "track").then((r) =>
        r.items.flatMap((item) => (item.type === "track" ? [toClientTrack(item as Parameters<typeof toClientTrack>[0])] : [])).slice(0, 15),
      ),
    radio: (seed) => api.getRadio(seed.id, { k: 30 }).then((r) => (r.items || []).map((item) => toClientTrack(item))),
  });
  const mixes: DailyMix[] = built.map((mix) => {
    const artists = getDailyMixArtists(mix.artists, mix.tracks, 4);
    return {
      id: mix.id,
      title: t("home.daily_mix", { n: mix.index }) || `Daily Mix ${mix.index}`,
      description: artists.join(", "),
      clusterArtists: artists,
      coverUrl: mix.tracks.find((tr) => tr.coverUrl)?.coverUrl,
      trackCount: mix.tracks.length,
      tracks: mix.tracks,
      mixIndex: mix.index,
      mosaic: mixMosaic(mix.tracks),
    };
  });
  if (mixes.length > 0) {
    try {
      localStorage.setItem(LANE_MIXES_KEY, JSON.stringify({ day: today(), owner, mixes } satisfies StoredMixes));
    } catch {}
  }
  return mixes;
}
const CACHE_TTL = 120_000;

function cachedMixesFor(owner: string): DailyMix[] {
  return cache.owner === owner ? cache.data : [];
}

export function useDailyMixes() {
  const owner = useSessionOwner();
  const [data, setData] = useState<DailyMix[]>(() => cachedMixesFor(owner));
  const [isLoading, setIsLoading] = useState(() => cachedMixesFor(owner).length === 0);

  useEffect(() => {
    const stored = readStoredMixes(owner);
    if (stored) {
      stored.forEach(cacheCollection);
      setData(stored);
      setIsLoading(false);
      return;
    }
    const cached = cachedMixesFor(owner);
    setData(cached);
    if (cached.length > 0 && Date.now() - cache.timestamp < CACHE_TTL) {
      setIsLoading(false);
      return;
    }

    let active = true;
    setIsLoading(cached.length === 0);
    loadWithRetry(() => api.getDailyMixes(), () => active)
      .then((res) => {
        if (!active) return;
        const mixes: DailyMix[] = (res.items || []).map((mix, mixPosition) => {
          const clientTracks = (mix.tracks || []).map((t) => toClientTrack(t));
          const primaryCover =
            mix.cover?.url ? mediaUrl(mix.cover.url) :
            (clientTracks[0]?.coverUrl ||
            clientTracks[1]?.coverUrl);

          const computedArtists = getDailyMixArtists(mix.clusterArtists, clientTracks, 4);

          const mixItem: DailyMix = {
            id: mix.id,
            title: mix.title,
            description: mix.description,
            clusterArtists: computedArtists,
            coverUrl: primaryCover,
            trackCount: mix.trackCount || clientTracks.length,
            tracks: clientTracks,
            mixIndex: mixPosition + 1,
            mosaic: mixMosaic(clientTracks),
          };

          // Pre-cache collection playlist page so clicking opens instantly
          const collectionData: CollectionPageData = {
            type: "playlist",
            title: mix.title,
            author: computedArtists.length > 0 ? computedArtists.join(", ") : "Daily Mix",
            description: mix.description,
            coverUrl: primaryCover || "",
            tracks: clientTracks,
            isDailyMix: true,
            mixCover: { index: mixPosition + 1, covers: mixMosaic(clientTracks), label: mixLabel() },
          };
          queryCache.set(`collection:playlist:${mix.id}`, collectionData);

          return mixItem;
        });

        cache.data = mixes;
        cache.timestamp = Date.now();
        cache.owner = owner;
        setData(mixes);
      })
      .catch(() => {
        if (active) setData([]);
      })
      .finally(() => {
        if (active) setIsLoading(false);
        // then replace them with longer mixes built from the listener's taste
        building = building ?? buildClientMixes(owner).finally(() => {
          building = null;
        });
        void building
          .then((mixes) => {
            if (!active || mixes.length < 2) return;
            // never swap fuller server mixes for a thinner client set
            if (mixes.length < cache.data.length && cache.owner === owner) return;
            mixes.forEach(cacheCollection);
            cache.data = mixes;
            cache.timestamp = Date.now();
            cache.owner = owner;
            setData(mixes);
          })
          .catch(() => undefined);
      });

    return () => {
      active = false;
    };
  }, [owner]);

  return { data, isLoading };
}
