import { useEffect, useState } from "react";
import { api, toClientTrack, mediaUrl } from "@/shared/api";
import { queryCache } from "@/shared/cache/queryCache";
import type { Track } from "@/shared/types";
import type { CollectionPageData } from "@/features/collection/hooks/useCollection";
import { loadWithRetry, useSessionOwner } from "./sessionAwareLoad";
import { buildDailyMixes, type MixSeedTrack } from "../mixes/buildDailyMixes";
import { createTranslatorSync, getStoredLocale } from "@/languages";
import { diag } from "@/shared/platform/diag";
import { loadListeningSignals } from "./listeningSignals";
import { isVideoTrack } from "@/shared/media/isVideoTrack";

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
    if (!track.coverUrl || isVideoTrack(track) || seen.has(artist) || covers.includes(track.coverUrl)) continue;
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

const cache = { data: [] as DailyMix[], timestamp: 0, owner: "", client: false };

// ---- client-built mixes (Lane) -------------------------------------------

const LANE_MIXES_KEY = "lane_daily_mixes_v5";
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

/** liked tracks + history -> five long mixes grown with the radio engine */
async function buildClientMixes(owner: string): Promise<DailyMix[]> {
  const { liked, history } = await loadListeningSignals(300, 200);
  const seeds: MixSeedTrack[] = [
    ...liked.map((t) => ({ ...t, weight: 3 })),
    ...history.map((t) => ({ ...t, weight: 1 })),
  ];
  diag(`mixes: building from ${liked.length} likes and ${history.length} plays`);
  if (seeds.length < 5) return [];

  const t = createTranslatorSync(getStoredLocale());
  const built = await buildDailyMixes(seeds, {
    mixCount: 5,
    tracksPerMix: 50,
    artistTracks: (name) =>
      api.search(name, "track").then((r) =>
        r.items.flatMap((item) => (item.type === "track" ? [toClientTrack(item as Parameters<typeof toClientTrack>[0])] : [])).slice(0, 15),
      ),
    radio: (seed) => api.getRadio(seed.id, { k: 30 }).then((r) => (r.items || []).map((item) => toClientTrack(item))),
  });
  const mixes: DailyMix[] = built.slice(0, 5).map((mix) => {
    const artists = getDailyMixArtists(mix.artists, mix.tracks, 4);
    return {
      id: mix.id,
      title: t("home.daily_mix", { n: mix.index }) || `Daily Mix ${mix.index}`,
      description: artists.join(", "),
      clusterArtists: artists,
      coverUrl: mix.tracks.find((tr) => tr.coverUrl)?.coverUrl,
      trackCount: Math.min(50, mix.tracks.length),
      tracks: mix.tracks.slice(0, 50),
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

    // longer mixes built from the listener's own taste: started at once, next
    // to the server request; kept in the module cache even if this screen is
    // left meanwhile, and shown as soon as they're richer than what's shown
    const total = (list: DailyMix[]) => list.reduce((n, m) => n + m.tracks.length, 0);
    building = building ?? buildClientMixes(owner).finally(() => {
      building = null;
    });
    void building
      .then((mixes) => {
        diag(`mixes: built ${mixes.length} mixes, ${total(mixes)} tracks`);
        if (mixes.length < 2) return;
        if (cache.owner === owner && cache.data.length && total(mixes) <= total(cache.data) && !cache.client) return;
        mixes.forEach(cacheCollection);
        cache.data = mixes;
        cache.timestamp = Date.now();
        cache.owner = owner;
        cache.client = true;
        if (active) {
          setData(mixes);
          setIsLoading(false);
        }
      })
      .catch((error) => diag(`mixes: build failed (${error instanceof Error ? error.message : String(error)})`));

    loadWithRetry(() => api.getDailyMixes(), () => active)
      .then((res) => {
        if (!active) return;
        const mixes: DailyMix[] = (res.items || []).slice(0, 5).map((mix, mixPosition) => {
          const clientTracks = (mix.tracks || []).slice(0, 50).map((t) => toClientTrack(t));
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
            trackCount: Math.min(50, clientTracks.length),
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

        // the client set is already in: keep it
        if (cache.client && cache.owner === owner) return;
        cache.data = mixes;
        cache.timestamp = Date.now();
        cache.owner = owner;
        setData(mixes);
      })
      .catch(() => {
        if (active && !(cache.client && cache.owner === owner)) setData([]);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [owner]);

  return { data, isLoading };
}
