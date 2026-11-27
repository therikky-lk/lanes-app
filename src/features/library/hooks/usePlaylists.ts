import { compactPlaylistCover, getCustomPlaylistCover, getPlaylistCover, rememberServerCover } from "../services/playlistCovers";
import { canSyncCoverMarker, readCoverMarker, readLocalEntries, withCoverMarker, withLocalEntries } from "../services/playlistCoverMarker";
import { buildLocalPlaylistEntry, localEntrySnapshot, localEntryToTrack } from "@/features/local/localPlaylistTracks";
import { isLocalLikesPlaylist } from "@/features/local/localLikesSync";
import { getImportedPlaylistMeta, recoverSpotifyPlaylistCover } from "../services/import/importedPlaylistMeta";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { api, ApiError, getAuthSession, mediaUrl, toClientTrack, type ApiUserPlaylistItem } from "@/shared/api";
import { queryCache } from "@/shared/cache/queryCache";
import type { Track } from "@/shared/types";
import { isNativeApp } from "@/shared/platform/native";
import { diag } from "@/shared/platform/diag";
import {
  confirmPlaylistRemovals, isPlaylistRemoved, playlistLibraryOwner, playlistRemovalGeneration,
  playlistRemovalSnapshot, subscribePlaylistRemovals,
} from "../services/playlistRemovals";

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
  isPublic: boolean;
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

async function loadPlaylistPreview(id: string) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      api.getUserPlaylist(id, { signal: controller.signal }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error("Playlist preview timed out")); }, 5000);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

const EMPTY: PlaylistList = { playlists: [], total: 0 };
let cache = EMPTY;
let loaded = false;
let request: Promise<void> | null = null;
let refreshQueued = false;
let listConsumers = 0;
let listRefreshTimer: number | null = null;
const listeners = new Set<() => void>();
let view = { data: cache, error: undefined as unknown, isLoading: true };
const confirmedImports = new Map<string, { owner: string; playlist: LibraryPlaylistSummary; expires: number }>();

function withConfirmedImports(playlists: LibraryPlaylistSummary[], owner: string | null) {
  const ids = new Set(playlists.map(playlist => playlist.id));
  const additions: LibraryPlaylistSummary[] = [];
  for (const [id, pending] of confirmedImports) {
    if (pending.expires < Date.now() || isPlaylistRemoved(id, pending.owner)) { confirmedImports.delete(id); continue; }
    if (pending.owner === owner && !ids.has(id)) additions.push(pending.playlist);
  }
  return [...additions, ...playlists];
}

/** Publish only a server-created, successfully saved import, not an optimistic draft. */
export function registerImportedPlaylist(
  playlist: Awaited<ReturnType<typeof api.createPlaylist>>,
  tracks: Parameters<typeof toClientTrack>[0][],
  owner: string | null,
) {
  if (!owner || owner !== playlistLibraryOwner()) return;
  const coverUrls = [...new Set(tracks.map(track => track.cover?.url ? mediaUrl(track.cover.url) : "").filter(Boolean))].slice(0, 4);
  const playlistCover = getPlaylistCover(playlist.id, playlist.description);
  const summary: LibraryPlaylistSummary = {
    ...playlist, trackCount: tracks.length, coverUrl: playlistCover || coverUrls[0] || "",
    coverUrls: playlistCover ? [playlistCover] : coverUrls, revision: playlist.revision ?? 0,
  };
  confirmedImports.set(playlist.id, { owner, playlist: summary, expires: Date.now() + 5 * 60_000 });
  const playlists = withConfirmedImports(cache.playlists.filter(item => item.id !== playlist.id), owner);
  cache = { playlists, total: playlists.length };
  queryCache.delete(`playlist:detail:${playlist.id}`);
  emit();
  notifyLibraryChanged();
}

export function notifyLibraryChanged() {
  window.dispatchEvent(new Event("library:changed"));
  // a change made on this device: Lane Connect tells the user's other devices
  window.dispatchEvent(new Event("library:local-change"));
}

// optimistically drop playlist from store so ui reacts instantly without waiting on network
export function evictPlaylistFromCache(id: string) {
  confirmedImports.delete(id);
  const playlists = cache.playlists.filter((p) => p.id !== id);
  cache = {
    playlists,
    total: playlists.length,
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
  if (request) {
    if (force) refreshQueued = true;
    return request;
  }
  const session = getAuthSession();
  if (!session?.accessToken) {
    cache = EMPTY;
    loaded = false;
    emit();
    return Promise.resolve();
  }
  if (loaded && !force) return Promise.resolve();
  const owner = playlistLibraryOwner();
  const generation = playlistRemovalGeneration();

  if (!loaded) {
    view = { data: cache, error: undefined, isLoading: true };
    emit();
  }

  request = (async () => {
    const coverCache = readCoverCache();
    const listed = await api.listPlaylists();
    // the hidden list behind likes of the user's own files is not a playlist to show
    const response = { ...listed, items: listed.items.filter((p) => !isLocalLikesPlaylist(p)) };

    // Show the server list before loading every playlist's tracks/artwork.
    // One hanging detail used to hide all newly imported playlists.
    if (owner !== playlistLibraryOwner() || generation !== playlistRemovalGeneration()) return;
    const summaries = response.items.map(playlist => {
      const previous = cache.playlists.find(item => item.id === playlist.id);
      const saved = coverCache[playlist.id];
      return {
        ...playlist,
        trackCount: previous?.trackCount ?? saved?.trackCount ?? 0,
        coverUrl: previous?.coverUrl ?? saved?.coverUrls[0] ?? "",
        coverUrls: previous?.coverUrls ?? saved?.coverUrls ?? [],
      };
    });
    const immediate = withConfirmedImports(summaries, owner);
    cache = { playlists: immediate, total: immediate.length };
    emit();

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
          detail = await loadPlaylistPreview(playlist.id);
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
        const serverTrackIds = new Set(detail.items.map((item) => item.track.id));
        const legacyLocalCount = readLocalEntries(playlist.description).filter((item) => !serverTrackIds.has(item.id)).length;
        const entry: CoverCacheEntry = {
          coverUrls: covers,
          trackCount: detail.items.length,
          updatedAt: playlist.updatedAt,
        };
        coverCache[playlist.id] = entry;
        return {
          ...playlist,
          trackCount: detail.items.length + legacyLocalCount,
          coverUrl: covers[0] ?? "",
          coverUrls: covers,
        };
      })
    );

    // A list fetched before a deletion/account change must not resurrect its old items.
    if (owner !== playlistLibraryOwner() || generation !== playlistRemovalGeneration()) return;
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
            if (owner !== playlistLibraryOwner() || isPlaylistRemoved(playlist.id, owner)) return;
            if (cover === fromServer || !canSyncCoverMarker(playlist.description, cover)) return;
            return api.updatePlaylist(playlist.id, { description: withCoverMarker(playlist.description, cover) });
          })
          .catch(() => undefined);
      }
      const local = getImportedPlaylistMeta(playlist.id)?.coverUrl;
      if (local && !fromServer && canSyncCoverMarker(playlist.description, local)) {
        // imported on this device before the cover was synced: send it up once
        void api
          .updatePlaylist(playlist.id, { description: withCoverMarker(playlist.description, local) })
          .catch(() => undefined);
      }
    }
    for (const playlist of playlists) {
      const importedCover = getPlaylistCover(playlist.id, playlist.description);
      if (importedCover) {
        playlist.coverUrl = importedCover;
        playlist.coverUrls = [importedCover];
      }
    }
    const merged = withConfirmedImports(playlists, owner);
    for (const playlist of playlists) {
      const pending = confirmedImports.get(playlist.id);
      if (pending?.owner === owner) confirmedImports.delete(playlist.id);
    }
    cache = { playlists: merged, total: merged.length };
    loaded = true;
    confirmPlaylistRemovals("owned", new Set(listed.items.map(playlist => playlist.id)), generation, owner);
  })()
    .catch((err) => {
      if (!loaded) cache = EMPTY;
      loaded = true;
      view.error = err;
    })
    .finally(() => {
      request = null;
      emit();
      const reload = refreshQueued || owner !== playlistLibraryOwner() || generation !== playlistRemovalGeneration();
      refreshQueued = false;
      if (reload) void load(true);
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

type UserPlaylistResponse = Awaited<ReturnType<typeof api.getUserPlaylist>>;
const localTrackMigrationRequests = new Map<string, Promise<UserPlaylistResponse>>();

/** Move old description-packed local tracks into playlist rows before removing their marker. */
async function migrateLocalPlaylistEntries(playlistId: string, initial: UserPlaylistResponse): Promise<UserPlaylistResponse> {
  const entries = readLocalEntries(initial.playlist.description);
  if (!entries.length) return initial;
  const ongoing = localTrackMigrationRequests.get(playlistId);
  if (ongoing) return ongoing;

  const request = (async () => {
    const currentIds = new Set(initial.items.map((item) => item.track.id));
    const missing = entries.filter((entry) => !currentIds.has(entry.id));
    if (missing.length) {
      try { await api.addPlaylistTrackSnapshots(playlistId, missing.map(localEntrySnapshot)); }
      catch { /* Keep the metadata marker as the durable copy if migration fails. */ }
    }

    let latest = initial;
    try { latest = await api.getUserPlaylist(playlistId, { signal: new AbortController().signal }); } catch { return initial; }
    const persistedIds = new Set(latest.items.map((item) => item.track.id));
    if (!entries.every((entry) => persistedIds.has(entry.id))) return latest;

    // Remove the old blob only after every local item is verified in the new rows.
    try {
      const description = withLocalEntries(latest.playlist.description, []);
      if (description !== latest.playlist.description && description.length <= 2_000) {
        latest = { ...latest, playlist: await api.updatePlaylist(playlistId, { description }) };
      }
    } catch { /* Leave the original description unchanged if it cannot fit. */ }
    return latest;
  })();
  localTrackMigrationRequests.set(playlistId, request);
  try { return await request; }
  finally { localTrackMigrationRequests.delete(playlistId); }
}

export function usePlaylistsList() {
  const state = useSyncExternalStore(subscribe, snapshot, () => SERVER_SNAPSHOT);
  const removalRevision = useSyncExternalStore(subscribePlaylistRemovals, playlistRemovalSnapshot, playlistRemovalSnapshot);
  const visibleData = useMemo(() => {
    const playlists = state.data.playlists.filter(playlist => !isPlaylistRemoved(playlist.id));
    return { playlists, total: playlists.length };
  }, [state.data, removalRevision]);
  useEffect(() => {
    void load();
    listConsumers += 1;
    if (listRefreshTimer === null) {
      listRefreshTimer = window.setInterval(() => {
      void load(true);
      }, 60_000);
    }
    return () => {
      listConsumers = Math.max(0, listConsumers - 1);
      if (listConsumers === 0 && listRefreshTimer !== null) {
        window.clearInterval(listRefreshTimer);
        listRefreshTimer = null;
      }
    };
  }, []);
  return { ...state, data: visibleData };
}

function playlistDetailCacheKey(id: string) {
  return `playlist:detail:${id}`;
}

const PLAYLIST_ITEM_REMOVED = "library:playlist-item-removed";

export function applyPlaylistItemRemoval(playlistId: string, itemId: string) {
  const key = playlistDetailCacheKey(playlistId);
  const detail = queryCache.get<LibraryPlaylistDetail>(key);
  if (!detail) return;
  const tracks = detail.tracks.filter((track) => track.playlistItemId !== itemId);
  if (tracks.length === detail.tracks.length) return;
  queryCache.set(key, { ...detail, tracks, trackCount: tracks.length });
  window.dispatchEvent(new CustomEvent(PLAYLIST_ITEM_REMOVED, { detail: playlistId }));
}

export function usePlaylist(id: string | null) {
  const cacheKey = id ? playlistDetailCacheKey(id) : null;
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

    let requestRevision = 0;
    const fetchDetail = async (isBackground = false) => {
      const revision = ++requestRevision;
      if (!isBackground && !queryCache.get(cacheKey)) setIsLoading(true);
      const requestStartedAt = performance.now();
      let apiMs = 0;
      try {
        const apiStartedAt = performance.now();
        let response = await api.getUserPlaylist(id);
        if (!active || revision !== requestRevision || isPlaylistRemoved(id)) return;
        response = await migrateLocalPlaylistEntries(id, response);
        apiMs = Math.round(performance.now() - apiStartedAt);
        if (!active || revision !== requestRevision || isPlaylistRemoved(id)) return;

        const covers = extractCovers(response.items);
        const syncedCover = readCoverMarker(response.playlist.description);
        rememberServerCover(id, syncedCover);
        const playlistCover = getPlaylistCover(id, response.playlist.description);
        if (!playlistCover) void recoverSpotifyPlaylistCover(id);
        const localCover = getCustomPlaylistCover(id) ?? getImportedPlaylistMeta(id)?.coverUrl;
        if (localCover && localCover !== syncedCover) {
          void compactPlaylistCover(localCover)
            .then((cover) => {
              if (cover !== syncedCover && canSyncCoverMarker(response.playlist.description, cover)) {
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

        const remoteTracks = response.items.map(toTrack);
        const itemIds = new Set(response.items.map((item) => item.track.id));
        const localTracks = readLocalEntries(response.playlist.description).filter((entry) => !itemIds.has(entry.id)).map(localEntryToTrack);
        const detail: LibraryPlaylistDetail = {
          id: response.playlist.id,
          title: response.playlist.title,
          description: response.playlist.description,
          isPublic: response.playlist.isPublic,
          trackCount: response.items.length + localTracks.length,
          coverUrl: playlistCover ?? covers[0] ?? "",
          coverUrls: playlistCover ? [playlistCover] : covers,
          revision: response.playlist.revision,
          tracks: [...remoteTracks, ...localTracks],
        };
        queryCache.set(cacheKey, detail);
        setData(detail);
        if (isNativeApp()) diag(`playlist load: tracks=${detail.trackCount} cache=${initial ? 1 : 0} api=${apiMs}ms total=${Math.round(performance.now() - requestStartedAt)}ms`);
      } catch (err) {
        if (isNativeApp()) diag(`playlist load: failed after ${Math.round(performance.now() - requestStartedAt)}ms (${err instanceof Error ? err.message.slice(0, 100) : String(err).slice(0, 100)})`);
        if (active && revision === requestRevision) setError(err);
      } finally {
        if (active && revision === requestRevision) setIsLoading(false);
      }
    };

    void fetchDetail(Boolean(initial));
    const refresh = () => void fetchDetail(true);
    const onItemRemoved = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== id) return;
      const updated = queryCache.get<LibraryPlaylistDetail>(cacheKey);
      if (updated) setData(updated);
      requestRevision++;
    };
    window.addEventListener("library:changed", refresh);
    window.addEventListener(PLAYLIST_ITEM_REMOVED, onItemRemoved);
    return () => {
      active = false;
      window.removeEventListener("library:changed", refresh);
      window.removeEventListener(PLAYLIST_ITEM_REMOVED, onItemRemoved);
    };
  }, [id, cacheKey]);

  return { data, error, isLoading };
}

/** Add local-file metadata as a normal playlist item; the audio stays on this device. */
export async function addLocalTrackToPlaylist(playlistId: string, trackId: string): Promise<void> {
  const entry = await buildLocalPlaylistEntry(trackId);
  if (!entry) throw new ApiError(404, "Local track was not found.");
  let detail = await api.getUserPlaylist(playlistId);
  detail = await migrateLocalPlaylistEntries(playlistId, detail);
  const legacyEntries = readLocalEntries(detail.playlist.description);
  if (detail.items.some((item) => item.track.id === entry.id) || legacyEntries.some((item) => item.id === entry.id)) {
    throw new ApiError(409, "Track is already in the playlist.");
  }
  const result = await api.addPlaylistTrackSnapshots(playlistId, [localEntrySnapshot(entry)]);
  if (!result.items.some((item) => item.track.id === entry.id)) {
    throw new ApiError(400, "The server rejected this local track; existing playlist data was kept.");
  }
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
