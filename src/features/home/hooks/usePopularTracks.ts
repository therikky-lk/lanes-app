import { useEffect, useState } from "react";
import { api, toClientTrack } from "@/shared/api";
import type { Track } from "@/shared/types";
import { replaceTrackCoversWithYandex } from "@/shared/media/yandexCover";

export type PopularTrackItem = Track;

export interface PopularAlbumItem {
  id: string;
  title: string;
  artist: string;
  coverUrl: string;
  totalTracks: number;
  albumType: string;
  explicit?: boolean;
}

export interface PopularArtistItem {
  id: string;
  name: string;
  imageUrl: string;
  followers: number;
  description: string;
  totalListens: number;
  totalTracks: number;
}

export interface PopularPlaylistItem {
  id: string;
  title: string;
  owner: string;
  coverUrl: string;
  totalTracks: number;
}

export type PopularItem =
  | { type: "track"; item: PopularTrackItem; playCount: number }
  | { type: "album"; item: PopularAlbumItem; playCount: number }
  | { type: "artist"; item: PopularArtistItem; playCount: number }
  | { type: "playlist"; item: PopularPlaylistItem; playCount: number };

export const popularTracksKeys = {
  all: ["popular"] as const,
  onlyTracks: ["popularTracks"] as const,
};

export const popularTracksAllTimeKeys = {
  allTime: ["popularTracksAllTime"] as const,
};

async function enrichTrackItems(items: PopularItem[]): Promise<PopularItem[]> {
  const tracks = items.filter((item): item is Extract<PopularItem, { type: "track" }> => item.type === "track");
  if (tracks.length === 0) return items;
  const enriched = await replaceTrackCoversWithYandex(tracks.map((item) => item.item));
  let index = 0;
  return items.map((item) => item.type === "track" ? { ...item, item: enriched[index++] } : item);
}

const cache = new Map<string, { data: PopularItem[]; timestamp: number }>();
const CACHE_TTL = 60_000;

export function usePopularTracksOnly(limit = 20) {
  const [data, setData] = useState<PopularItem[]>(() => cache.get(`tracks_7d_${limit}`)?.data ?? []);
  const [isLoading, setIsLoading] = useState(!cache.has(`tracks_7d_${limit}`));

  useEffect(() => {
    const cached = cache.get(`tracks_7d_${limit}`);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      setData(cached.data);
      setIsLoading(false);
      return;
    }

    let active = true;
    api
      .getPopularTracks("7d", limit)
      .then(async (res) => {
        if (!active) return;
        const rawItems: PopularItem[] = (res.items || []).map((entry) => ({
          type: "track",
          item: toClientTrack(entry.track),
          playCount: entry.playCount,
        }));
        const items = await enrichTrackItems(rawItems);
        if (!active) return;
        cache.set(`tracks_7d_${limit}`, { data: items, timestamp: Date.now() });
        setData(items);
      })
      .catch(() => {
        if (active) setData([]);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [limit]);

  return { data, isLoading };
}

export function usePopularTracksAllTime(limit = 20) {
  const [data, setData] = useState<PopularItem[]>(() => cache.get(`tracks_all_${limit}`)?.data ?? []);
  const [isLoading, setIsLoading] = useState(!cache.has(`tracks_all_${limit}`));

  useEffect(() => {
    const cached = cache.get(`tracks_all_${limit}`);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      setData(cached.data);
      setIsLoading(false);
      return;
    }

    let active = true;
    api
      .getPopularTracks("all", limit)
      .then(async (res) => {
        if (!active) return;
        const rawItems: PopularItem[] = (res.items || []).map((entry) => ({
          type: "track",
          item: toClientTrack(entry.track),
          playCount: entry.playCount,
        }));
        const items = await enrichTrackItems(rawItems);
        if (!active) return;
        cache.set(`tracks_all_${limit}`, { data: items, timestamp: Date.now() });
        setData(items);
      })
      .catch(() => {
        if (active) setData([]);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [limit]);

  return { data, isLoading };
}

export function usePopular(limit = 50) {
  const [data, setData] = useState<PopularItem[]>(() => cache.get(`popular_${limit}`)?.data ?? []);
  const [isLoading, setIsLoading] = useState(!cache.has(`popular_${limit}`));

  useEffect(() => {
    const cached = cache.get(`popular_${limit}`);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      setData(cached.data);
      setIsLoading(false);
      return;
    }

    let active = true;
    api
      .getPopularTracks("30d", limit)
      .then(async (res) => {
        if (!active) return;
        const enrichedTracks = await replaceTrackCoversWithYandex(
          (res.items || []).map((entry) => toClientTrack(entry.track)),
        );
        if (!active) return;
        const artistMap = new Map<string, PopularArtistItem>();
        for (const [index, entry] of (res.items || []).entries()) {
          const track = enrichedTracks[index];
          const artistName =
            track.artistList?.[0]?.name ||
            track.artists?.split(",")?.[0]?.trim() ||
            "";
          const artistId =
            track.artistList?.[0]?.id || track.artistId || artistName;
          if (artistName && !artistMap.has(artistName)) {
            artistMap.set(artistName, {
              id: artistId,
              name: artistName,
              imageUrl: track.coverUrl,
              followers: entry.playCount,
              description: "",
              totalListens: entry.playCount,
              totalTracks: 1,
            });
          }
        }
        const items: PopularItem[] = Array.from(artistMap.values()).map(
          (artist) => ({
            type: "artist",
            item: artist,
            playCount: artist.totalListens,
          }),
        );
        cache.set(`popular_${limit}`, { data: items, timestamp: Date.now() });
        setData(items);
      })
      .catch(() => {
        if (active) setData([]);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [limit]);

  return { data, isLoading };
}
