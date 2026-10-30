import { useEffect, useSyncExternalStore } from "react";
import { api, getAuthSession, toClientTrack } from "@/shared/api";
import type { Track } from "@/shared/types";
import { listLikedLocalTracks, localRecordToTrack, onLocalTracksChange } from "@/shared/media/local/localTracks";
import { loadLocalLikes } from "@/features/local/localLikesSync";
import { localEntryToTrack } from "@/features/local/localPlaylistTracks";
import { linerDb, type CachedTrackRecord } from "@/shared/storage/linerDb";
import { replaceTrackCoversWithYandex } from "@/shared/media/yandexCover";

type LikedData = { tracks: Track[]; total: number };
const EMPTY: LikedData = { tracks: [], total: 0 };
let cache: LikedData = EMPTY;
let loaded = false;
let request: Promise<void> | null = null;
const listeners = new Set<() => void>();
let view = { data: cache, isLoading: true };

const optimisticOverrides = new Map<string, boolean>();
/** what a just-liked track looks like, so it shows in the list right away */
const optimisticTracks = new Map<string, Track>();
/** when each override was set: a reload that started earlier can't know about it */
const overrideAt = new Map<string, number>();
let reloadQueued = false;
// A like click is optimistic and updates the UI immediately. Background
// refreshes should not be frequent enough to replace that state with a
// temporarily stale server snapshot while the request is settling.
const LIKE_SYNC_MIN_AGE_MS = 45_000;
const LIKE_SYNC_POLL_MS = 15_000;

// liked uploads live on this device and are shown first
let localLiked: Track[] = [];
// liked uploads of the user's other devices (greyed out here)
let remoteLocalLiked: Track[] = [];

function buildView(isLoading: boolean): { data: LikedData; isLoading: boolean } {
  if (optimisticOverrides.size === 0 && localLiked.length === 0 && remoteLocalLiked.length === 0) {
    return { data: cache, isLoading };
  }

  const here = new Set(localLiked.map((t) => t.id));
  const elsewhere = remoteLocalLiked.filter((t) => !here.has(t.id));
  let tracks = [...localLiked, ...elsewhere, ...cache.tracks].filter(
    (t) => optimisticOverrides.get(t.id) !== false
  );
  for (const [id, liked] of optimisticOverrides) {
    if (liked && !tracks.some((t) => t.id === id)) {
      tracks = [
        optimisticTracks.get(id) ??
          ({
            id,
            title: "",
            artists: "",
            artistId: undefined,
            coverUrl: "",
            durationMs: 0,
            playCount: 0,
          } as Track),
        ...tracks,
      ];
    }
  }
  return { data: { tracks, total: tracks.length }, isLoading };
}

function emit(isLoading = false) {
  view = buildView(isLoading);
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshot() {
  return view;
}

const SERVER_SNAPSHOT = { data: EMPTY, isLoading: true };

function cachedTrackToClient(record: CachedTrackRecord): Track {
  return {
    id: record.id,
    title: record.title,
    artists: record.artists,
    coverUrl: record.coverUrl ?? "",
    durationMs: record.durationMs,
    playCount: 0,
    ...(record.albumTitle
      ? { album: { id: record.albumId ?? `cached_${record.id}`, title: record.albumTitle } }
      : {}),
  };
}

async function restoreCachedLibrary(): Promise<boolean> {
  const records = await linerDb.listTracks().catch(() => []);
  if (records.length === 0) return false;
  cache = { tracks: records.map(cachedTrackToClient), total: records.length };
  loaded = true;
  emit(false);
  return true;
}

function load(force = false): Promise<void> {
  if (request) {
    // a reload asked for while one is running (a like / unlike just went
    // through): the running one may predate it, so run once more afterwards
    if (force) reloadQueued = true;
    return request;
  }
  const session = getAuthSession();
  if (!session?.accessToken) {
    cache = EMPTY;
    loaded = false;
    emit(false);
    return Promise.resolve();
  }
  if (loaded && !force) return Promise.resolve();

  if (!loaded) emit(true);

  const startedAt = Date.now();
  request = (async () => {
    // Render the last known library immediately. The network refresh below is
    // best-effort, so a temporary outage never turns the library into an empty
    // screen.
    if (!loaded) await restoreCachedLibrary();
    const tracks: Track[] = [];
    let cursor: string | undefined;
    const remoteLocal = loadLocalLikes();
    do {
      const page = await api.listLikedTracks(100, cursor);
      tracks.push(...page.items.map(({ track }) => toClientTrack(track)));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    // The library must become usable as soon as the API responds. Cover
    // replacement is optional enrichment and must never block likes or the
    // home page on a slow Yandex connection.
    cache = { tracks, total: tracks.length };
    remoteLocalLiked = (await remoteLocal).map(localEntryToTrack);
    loaded = true;
    // keep the optimistic state the server doesn't show yet: overrides made
    // after this reload started, or that it doesn't agree with yet
    const serverIds = new Set(tracks.map((t) => t.id));
    for (const [id, liked] of [...optimisticOverrides]) {
      const at = overrideAt.get(id) ?? 0;
      const agrees = serverIds.has(id) === liked;
      if (agrees || (at < startedAt && Date.now() - at > 30_000)) {
        optimisticOverrides.delete(id);
        overrideAt.delete(id);
      }
    }
    emit(false);
    void replaceTrackCoversWithYandex(tracks).then(async (enrichedTracks) => {
      if (enrichedTracks.every((track, index) => track === tracks[index])) return;
      cache = { tracks: enrichedTracks, total: enrichedTracks.length };
      await Promise.all(enrichedTracks.map((track) => linerDb.putTrack(track).catch(() => undefined)));
      emit(false);
    });
  })()
    .catch(() => {
      if (!loaded) void restoreCachedLibrary();
      loaded = true;
    })
    .finally(() => {
      request = null;
      emit(false);
      if (reloadQueued) {
        reloadQueued = false;
        void load(true);
      }
    });
  return request;
}

export function applyOptimisticLike(trackId: string, track?: Track): () => void {
  if (track?.title) optimisticTracks.set(trackId, { ...track, id: trackId });
  const prev = optimisticOverrides.get(trackId);
  optimisticOverrides.set(trackId, true);
  overrideAt.set(trackId, Date.now());
  emit(false);
  return () => {
    if (prev === undefined) optimisticOverrides.delete(trackId);
    else optimisticOverrides.set(trackId, prev);
    emit(false);
  };
}

export function applyOptimisticUnlike(trackId: string): () => void {
  const prev = optimisticOverrides.get(trackId);
  optimisticOverrides.set(trackId, false);
  overrideAt.set(trackId, Date.now());
  emit(false);
  return () => {
    if (prev === undefined) optimisticOverrides.delete(trackId);
    else optimisticOverrides.set(trackId, prev);
    emit(false);
  };
}

if (typeof window !== "undefined") {
  const handleRefresh = () => {
    const session = getAuthSession();
    if (!session?.accessToken) {
      cache = EMPTY;
      loaded = false;
      optimisticOverrides.clear();
      overrideAt.clear();
      emit(false);
    } else {
      void load(true);
    }
  };
  window.addEventListener("library:changed", handleRefresh);
  window.addEventListener("auth:changed", handleRefresh);

  // Likes made on another device: refresh when this app returns to the
  // foreground if the snapshot is stale, then poll while it remains visible.
  let lastRefresh = Date.now();
  const refreshIfStale = (minAgeMs: number) => {
    if (!loaded || document.visibilityState !== "visible" || Date.now() - lastRefresh < minAgeMs) return;
    lastRefresh = Date.now();
    void load(true);
  };
  window.addEventListener("library:changed", () => (lastRefresh = Date.now()));
  const refreshOnReturn = () => refreshIfStale(LIKE_SYNC_MIN_AGE_MS);
  window.addEventListener("focus", refreshOnReturn);
  document.addEventListener("visibilitychange", refreshOnReturn);
  setInterval(() => refreshIfStale(LIKE_SYNC_MIN_AGE_MS), LIKE_SYNC_POLL_MS);
}

export function useLikedTracks(_params?: { limit?: number; offset?: number }) {
  const state = useSyncExternalStore(subscribe, snapshot, () => SERVER_SNAPSHOT);
  useEffect(() => {
    void load();
  }, []);
  return state;
}

export function useLikedTrackCount() {
  const { data, isLoading } = useLikedTracks();
  return { data: data.total, isLoading };
}

if (typeof window !== "undefined" && typeof indexedDB !== "undefined") {
  const refreshLocal = () =>
    listLikedLocalTracks()
      .then((records) => {
        localLiked = records.map(localRecordToTrack);
        emit(view.isLoading);
      })
      .catch(() => undefined);
  void refreshLocal();
  onLocalTracksChange(() => void refreshLocal());
}
