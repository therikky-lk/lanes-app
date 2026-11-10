import { useEffect, useSyncExternalStore } from "react";
import { api, getAuthSession, toClientTrack } from "@/shared/api";
import type { Track } from "@/shared/types";
import { listLikedLocalTracks, localRecordToTrack, onLocalTracksChange } from "@/shared/media/local/localTracks";
import { loadLocalLikes } from "@/features/local/localLikesSync";
import { localEntryToTrack } from "@/features/local/localPlaylistTracks";
import { isNativeApp } from "@/shared/platform/native";
import { diag } from "@/shared/platform/diag";

type LikedData = { tracks: Track[]; total: number };
const EMPTY: LikedData = { tracks: [], total: 0 };
let cache: LikedData = EMPTY;
let loaded = false;
let request: Promise<void> | null = null;
let activeOwner = "";
let loadGeneration = 0;
const listeners = new Set<() => void>();
let view = { data: cache, isLoading: true };
const progressListeners = new Set<() => void>();
let progressCache = cache;
let progressView = { data: cache, isLoading: true };

const optimisticOverrides = new Map<string, boolean>();
/** what a just-liked track looks like, so it shows in the list right away */
const optimisticTracks = new Map<string, Track>();
/** when each override was set: a reload that started earlier can't know about it */
const overrideAt = new Map<string, number>();
let reloadQueued = false;
// A like click is optimistic and updates the UI immediately. Background
// refreshes should not be frequent enough to replace that state with a
// temporarily stale server snapshot while the request is settling.
const LIKE_SYNC_MIN_AGE_MS = 5 * 60_000;
const LIKE_SYNC_POLL_MS = 60_000;
let lastRefresh = 0;

// liked uploads live on this device and are shown first
let localLiked: Track[] = [];
// liked uploads of the user's other devices (greyed out here)
let remoteLocalLiked: Track[] = [];

function uniqueTracks(tracks: Track[]): Track[] {
  const seen = new Set<string>();
  return tracks.filter((track) => {
    if (seen.has(track.id)) return false;
    seen.add(track.id);
    return true;
  });
}

function buildView(isLoading: boolean, base = cache): { data: LikedData; isLoading: boolean } {
  if (optimisticOverrides.size === 0 && localLiked.length === 0 && remoteLocalLiked.length === 0) {
    return { data: base, isLoading };
  }

  const here = new Set(localLiked.map((t) => t.id));
  const elsewhere = remoteLocalLiked.filter((t) => !here.has(t.id));
  let tracks = uniqueTracks([...localLiked, ...elsewhere, ...base.tracks]).filter(
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
            likedAt: overrideAt.get(id) ?? Date.now(),
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
  progressView = buildView(isLoading, progressCache);
  progressListeners.forEach((l) => l());
}

function emitProgress(isLoading: boolean, base = progressCache) {
  progressCache = base;
  progressView = buildView(isLoading, base);
  progressListeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshot() {
  return view;
}

function subscribeProgress(listener: () => void) {
  progressListeners.add(listener);
  return () => progressListeners.delete(listener);
}

function progressSnapshot() {
  return progressView;
}

const SERVER_SNAPSHOT = { data: EMPTY, isLoading: true };

function ownerKey(): string {
  const session = getAuthSession();
  return session?.user?.id ? `${session.authBackend ?? "legacy"}:${session.user.id}` : "guest";
}

function resetForOwner(nextOwner: string): void {
  if (activeOwner === nextOwner) return;
  activeOwner = nextOwner;
  loadGeneration++;
  request = null;
  reloadQueued = false;
  cache = EMPTY;
  progressCache = EMPTY;
  loaded = false;
  optimisticOverrides.clear();
  optimisticTracks.clear();
  overrideAt.clear();
  remoteLocalLiked = [];
  emit(true);
}

function load(force = false): Promise<void> {
  resetForOwner(ownerKey());
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
  lastRefresh = startedAt;
  const diagnosticStartedAt = performance.now();
  const generation = loadGeneration;
  const showPagesAsTheyArrive = !loaded;
  request = (async () => {
    // Keep the loading skeleton visible until the server's complete, current
    // list is ready; otherwise stale cache rows and counts flash on entry.
    const tracks: Track[] = [];
    let cursor: string | undefined;
    let pages = 0;
    let lastHomeBatch = 0;
    const remoteLocal = loadLocalLikes();
    do {
      const pageStartedAt = performance.now();
      const page = await api.listLikedTracks(100, cursor);
      if (generation !== loadGeneration) return;
      pages++;
      tracks.push(
        ...page.items.map(({ track, likedAt }) => ({
          ...toClientTrack(track),
          likedAt,
        })),
      );
      cursor = page.nextCursor ?? undefined;
      if (isNativeApp()) diag(`favorites page ${pages}: received=${page.items.length} elapsed=${Math.round(performance.now() - pageStartedAt)}ms`);
      if (showPagesAsTheyArrive) {
        const partial = uniqueTracks(tracks);
        emitProgress(false, { tracks: partial, total: partial.length });
        // Home only needs occasional snapshots. Publishing every 100-track
        // page made its large sections recalculate repeatedly during loading.
        if (partial.length - lastHomeBatch >= 300) {
          lastHomeBatch = partial.length;
          view = { data: buildView(true, { tracks: partial, total: partial.length }).data, isLoading: true };
          listeners.forEach((listener) => listener());
        }
      }
    } while (cursor);
    // Keep the API artwork; bulk cover searches made opening a large library
    // issue thousands of unrelated requests.
    if (generation !== loadGeneration) return;
    const currentTracks = uniqueTracks(tracks);
    cache = { tracks: currentTracks, total: currentTracks.length };
    remoteLocalLiked = (await remoteLocal).map(localEntryToTrack);
    if (generation !== loadGeneration) return;
    loaded = true;
    progressCache = cache;
    lastRefresh = Date.now();
    if (isNativeApp()) diag(`favorites load: pages=${pages} tracks=${currentTracks.length} elapsed=${Math.round(performance.now() - diagnosticStartedAt)}ms`);
    // keep the optimistic state the server doesn't show yet: overrides made
    // after this reload started, or that it doesn't agree with yet
    const serverIds = new Set(currentTracks.map((t) => t.id));
    for (const [id, liked] of [...optimisticOverrides]) {
      const at = overrideAt.get(id) ?? 0;
      const agrees = serverIds.has(id) === liked;
      if (agrees || (at < startedAt && Date.now() - at > 30_000)) {
        optimisticOverrides.delete(id);
        overrideAt.delete(id);
      }
    }
    emit(false);
  })()
    .catch((error) => {
      if (isNativeApp()) diag(`favorites load: failed after ${Math.round(performance.now() - diagnosticStartedAt)}ms (${error instanceof Error ? error.message.slice(0, 100) : String(error).slice(0, 100)})`);
      if (generation === loadGeneration && !loaded) loaded = true;
    })
    .finally(() => {
      if (generation !== loadGeneration) return;
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
  if (track?.title) optimisticTracks.set(trackId, { ...track, id: trackId, likedAt: track.likedAt ?? Date.now() });
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
    const nextOwner = ownerKey();
    const ownerChanged = activeOwner !== nextOwner;
    resetForOwner(nextOwner);
    const session = getAuthSession();
    if (!session?.accessToken) {
      cache = EMPTY;
      progressCache = EMPTY;
      loaded = false;
      optimisticOverrides.clear();
      overrideAt.clear();
      emit(false);
    } else if (ownerChanged || Date.now() - lastRefresh >= LIKE_SYNC_MIN_AGE_MS) {
      // library:changed also fires for playlist edits, covers and imports.
      // Those changes used to restart every page of a 1k+ likes response.
      lastRefresh = Date.now();
      void load(true);
    }
  };
  window.addEventListener("library:changed", handleRefresh);
  window.addEventListener("auth:changed", handleRefresh);

  // Likes made on another device: refresh when this app returns to the
  // foreground if the snapshot is stale, then poll while it remains visible.
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

export function useLikedTracks() {
  const state = useSyncExternalStore(subscribe, snapshot, () => SERVER_SNAPSHOT);
  useEffect(() => {
    void load();
  }, []);
  return state;
}

/** Used only by the likes page so its rows can appear per API page without
 * forcing unrelated screens such as Home to rerender on each response. */
export function useLikedTracksProgressively() {
  const state = useSyncExternalStore(subscribeProgress, progressSnapshot, () => SERVER_SNAPSHOT);
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
        localLiked = records.map((record) => ({
          ...localRecordToTrack(record),
          likedAt: record.likedAt,
        }));
        emit(view.isLoading);
      })
      .catch(() => undefined);
  void refreshLocal();
  onLocalTracksChange(() => void refreshLocal());
}

// Shared with the background download worker; views and downloads use the same likes snapshot.
export const likedTracksSnapshot = () => view.data.tracks;
export const subscribeLikedTracks = subscribe;
export const loadLikedTracks = load;
