import { compactPlaylistCover, getCustomPlaylistCover, getPlaylistCover, rememberServerCover } from "../services/playlistCovers";
import { readCoverMarker, readLocalEntries, withCoverMarker, withLocalEntries } from "../services/playlistCoverMarker";
import { buildLocalPlaylistEntry, localEntryToTrack } from "@/features/local/localPlaylistTracks";
import { isLocalLikesPlaylist } from "@/features/local/localLikesSync";
import { getImportedPlaylistMeta } from "../services/import/importedPlaylistMeta";
import { useEffect, useState, useSyncExternalStore } from "react";
import { api, ApiError, getAuthSession, mediaUrl, toClientTrack, type ApiUserPlaylistItem } from "@/shared/api";
import { queryCache } from "@/shared/cache/queryCache";
import type { Track } from "@/shared/types";
import { fillMissingTrackCovers } from "@/shared/media/yandexCover";

export interface LibraryPlaylistSummary {
  id: string;
  title: string;
  description?: string;
  trackCount: number;
  coverUrl: string;
  coverUrls: string[];
  updatedAt: string;
  createdAt: string;
  revision: number;
}

export interface LibraryPlaylistDetail {
  id: string;
  title: string;
  description?: string;
  trackCount: number;
  coverUrl: string;
  coverUrls: string[];
  revision: number;
  tracks: Track[];
}

type PlaylistList = { playlists: LibraryPlaylistSummary[]; total: number };

const COVER_CACHE_KEY = "liner:playlist-covers-v2";
type CoverCacheEntry = { coverUrls: string[]; trackCount: number; updatedAt: string };
type CoverCache = Record<string, CoverCacheEntry>;

function readCoverCache(): CoverCache {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(COVER_CACHE_KEY) ?? "{}"); } catch { return {}; }
}

function writeCoverCache(c: CoverCache) {
  try { localStorage.setItem(COVER_CACHE_KEY, JSON.stringify(c)); } catch {}
}

function extractCovers(items: ApiUserPlaylistItem[]): string[] {
  return items
    .map((i) => (i.track.cover ? mediaUrl(i.track.cover.url) : ""))
    .filter(Boolean)
    .filter((url, idx, arr) => arr.indexOf(url) === idx)
    .slice(0, 4);
}

const EMPTY: PlaylistList = { playlists: [], total: 0 };
let cache = EMPTY;
let loaded = false;
let request: Promise<void> | null = null;
const listeners = new Set<() => void>();
let view = { data: cache, error: undefined as unknown, isLoading: true };

export function notifyLibraryChanged() {
  window.dispatchEvent(new Event("library:changed"));
  // a change made on this device: Lane Connect tells the user's other devices
  window.dispatchEvent(new Event("library:local-change"));
}

// optimistically drop playlist from store so ui reacts instantly without waiting on network
export function evictPlaylistFromCache(id: string) {
  cache = {
    playlists: cache.playlists.filter((p) => p.id !== id),
    total: Math.max(0, cache.total - 1),
  };
  queryCache.delete(`playlist:detail:${id}`);
  emit();
}

function emit() {
  view = { data: cache, error: undefined, isLoading: false };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshot() {
  return view;
}

const SERVER_SNAPSHOT = { data: EMPTY, error: undefined as unknown, isLoading: true };

function load(force = false): Promise<void> {
  if (request) return request;
  const session = getAuthSession();
  if (!session?.accessToken) {
    cache = EMPTY;
    loaded = false;
    emit();
    return Promise.resolve();
  }
  if (loaded && !force) return Promise.resolve();

  if (!loaded) {
    view = { data: cache, error: undefined, isLoading: true };
    emit();
  }

  request = (async () => {
    const coverCache = readCoverCache();
    const listed = await api.listPlaylists();
    // the hidden list behind likes of the user's own files is not a playlist to show
    const response = { ...listed, items: listed.items.filter((p) => !isLocalLikesPlaylist(p)) };

    const playlists = await Promise.all(
      response.items.map(async (playlist) => {
        const cached = coverCache[playlist.id];

        // the user's own files ride in the description
        const localCount = readLocalEntries(playlist.description).length;
        if (cached && cached.updatedAt === playlist.updatedAt) {
          return {
            ...playlist,
            trackCount: cached.trackCount + localCount,
            coverUrl: cached.coverUrls[0] ?? "",
            coverUrls: cached.coverUrls,
          };
        }

        let detail: { items: ApiUserPlaylistItem[] };
        try {
          detail = await api.getUserPlaylist(playlist.id);
        } catch {
          // Keep the playlist visible if one detail/cover request fails.
          return {
            ...playlist,
            trackCount: localCount,
            coverUrl: "",
            coverUrls: [],
          };
        }
        const covers = extractCovers(detail.items);
        const entry: CoverCacheEntry = {
          coverUrls: covers,
          trackCount: detail.items.length,
          updatedAt: playlist.updatedAt,
        };
        coverCache[playlist.id] = entry;
        return {
          ...playlist,
          trackCount: detail.items.length + localCount,
          coverUrl: covers[0] ?? "",
          coverUrls: covers,
        };
      })
    );

    const liveIds = new Set(response.items.map((p) => p.id));
    for (const id of Object.keys(coverCache)) {
      if (!liveIds.has(id)) delete coverCache[id];
    }
    writeCoverCache(coverCache);

    // imported playlists show their original artwork (e.g. the Spotify cover);
    // it travels with the playlist's description so every device has it
    for (const playlist of playlists) {
      const fromServer = readCoverMarker(playlist.description);
      rememberServerCover(playlist.id, fromServer);
      const customCover = getCustomPlaylistCover(playlist.id);
      if (customCover) {
        // Older app versions kept user-picked covers locally. Compress and
        // attach them to the playlist so every signed-in device can restore it.
        void compactPlaylistCover(customCover)
          .then((cover) => {
            if (cover === fromServer) return;
            return api.updatePlaylist(playlist.id, { description: withCoverMarker(playlist.description, cover) });
          })
          .catch(() => undefined);
      }
      const local = getImportedPlaylistMeta(playlist.id)?.coverUrl;
      if (local && !fromServer) {
        // imported on this device before the cover was synced: send it up once
        void api
          .updatePlaylist(playlist.id, { description: withCoverMarker(playlist.description, local) })
          .catch(() => undefined);
      }
    }
    for (const playlist of playlists) {
      const importedCover = getPlaylistCover(playlist.id);
      if (importedCover) {
        playlist.coverUrl = importedCover;
        playlist.coverUrls = [importedCover];
      }
    }
    cache = { playlists, total: playlists.length };
    loaded = true;
  })()
    .catch((err) => {
      if (!loaded) cache = EMPTY;
      loaded = true;
      view.error = err;
    })
    .finally(() => {
      request = null;
      emit();
    });
  return request;
}

if (typeof window !== "undefined") {
  const handleRefresh = () => {
    const session = getAuthSession();
    if (!session?.accessToken) {
      cache = EMPTY;
      loaded = false;
      emit();
    } else {
      void load(true);
    }
  };
  window.addEventListener("library:changed", handleRefresh);
  window.addEventListener("auth:changed", handleRefresh);
  window.addEventListener("focus", handleRefresh);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") handleRefresh();
  });
}

function toTrack(item: ApiUserPlaylistItem): Track {
  const base = toClientTrack(item.track);
  return {
    ...base,
    playlistItemId: item.id,
  };
}

export function usePlaylistsList() {
  const state = useSyncExternalStore(subscribe, snapshot, () => SERVER_SNAPSHOT);
  useEffect(() => {
    void load(true);
    const refreshTimer = window.setInterval(() => {
      void load(true);
    }, 30_000);
    return () => window.clearInterval(refreshTimer);
  }, []);
  return state;
}

export function usePlaylist(id: string | null) {
  const cacheKey = id ? `playlist:detail:${id}` : null;
  const cached = cacheKey ? queryCache.get<LibraryPlaylistDetail>(cacheKey) : undefined;
  const [data, setData] = useState<LibraryPlaylistDetail | null>(cached ?? null);
  const [error, setError] = useState<unknown>();
  const [isLoading, setIsLoading] = useState(!cached && Boolean(id));

  useEffect(() => {
    if (!id || !cacheKey) {
      setData(null);
      setIsLoading(false);
      return;
    }

    const initial = queryCache.get<LibraryPlaylistDetail>(cacheKey);
    if (initial) {
      setData(initial);
      setIsLoading(false);
    } else {
      setData(null);
      setIsLoading(true);
    }
    let active = true;

    const fetchDetail = async (isBackground = false) => {
      if (!isBackground && !queryCache.get(cacheKey)) setIsLoading(true);
      try {
        const response = await api.getUserPlaylist(id);
        if (!active) return;

        const covers = extractCovers(response.items);
        const syncedCover = readCoverMarker(response.playlist.description);
        rememberServerCover(id, syncedCover);
        const playlistCover = getPlaylistCover(id);
        const localCover = getCustomPlaylistCover(id) ?? getImportedPlaylistMeta(id)?.coverUrl;
        if (localCover && localCover !== syncedCover) {
          void compactPlaylistCover(localCover)
            .then((cover) => {
              if (cover !== syncedCover) {
                return api.updatePlaylist(id, { description: withCoverMarker(response.playlist.description, cover) });
              }
              return undefined;
            })
            .catch(() => undefined);
        }

        const coverCache = readCoverCache();
        coverCache[id] = {
          coverUrls: covers,
          trackCount: response.items.length,
          updatedAt: response.playlist.updatedAt,
        };
        writeCoverCache(coverCache);

        const remoteTracks = await fillMissingTrackCovers(response.items.map(toTrack));
        const localTracks = readLocalEntries(response.playlist.description).map(localEntryToTrack);
        const detail: LibraryPlaylistDetail = {
          id: response.playlist.id,
          title: response.playlist.title,
          description: response.playlist.description,
          trackCount: response.items.length + localTracks.length,
          coverUrl: playlistCover ?? covers[0] ?? "",
          coverUrls: playlistCover ? [playlistCover] : covers,
          revision: response.playlist.revision,
          tracks: [...remoteTracks, ...localTracks],
        };
        queryCache.set(cacheKey, detail);
        setData(detail);
      } catch (err) {
        if (active) setError(err);
      } finally {
        if (active) setIsLoading(false);
      }
    };

    void fetchDetail(Boolean(initial));
    const refresh = () => void fetchDetail(true);
    window.addEventListener("library:changed", refresh);
    return () => {
      active = false;
      window.removeEventListener("library:changed", refresh);
    };
  }, [id, cacheKey]);

  return { data, error, isLoading };
}

/** add one of the user's own files: it's kept in the playlist's description */
export async function addLocalTrackToPlaylist(playlistId: string, trackId: string): Promise<void> {
  const entry = await buildLocalPlaylistEntry(trackId);
  if (!entry) throw new ApiError(404, "Local track was not found.");
  const { playlist } = await api.getUserPlaylist(playlistId);
  const entries = readLocalEntries(playlist.description);
  if (entries.some((e) => e.id === entry.id)) throw new ApiError(409, "Track is already in the playlist.");
  await api.updatePlaylist(playlistId, { description: withLocalEntries(playlist.description, [...entries, entry]) });
  queryCache.delete(`playlist:detail:${playlistId}`);
}

export async function removeLocalTrackFromPlaylist(playlistId: string, trackId: string): Promise<void> {
  const { playlist } = await api.getUserPlaylist(playlistId);
  const entries = readLocalEntries(playlist.description);
  await api.updatePlaylist(playlistId, {
    description: withLocalEntries(
      playlist.description,
      entries.filter((e) => e.id !== trackId),
    ),
  });
  queryCache.delete(`playlist:detail:${playlistId}`);
}
