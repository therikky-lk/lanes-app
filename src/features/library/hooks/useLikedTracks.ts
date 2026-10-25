import { useEffect, useSyncExternalStore } from "react";
import { api, getAuthSession, toClientTrack } from "@/shared/api";
import type { Track } from "@/shared/types";
import { listLikedLocalTracks, localRecordToTrack, onLocalTracksChange } from "@/shared/media/local/localTracks";
import { loadLocalLikes } from "@/features/local/localLikesSync";
import { localEntryToTrack } from "@/features/local/localPlaylistTracks";

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
    const tracks: Track[] = [];
    let cursor: string | undefined;
    const remoteLocal = loadLocalLikes();
    do {
      const page = await api.listLikedTracks(100, cursor);
      tracks.push(...page.items.map(({ track }) => toClientTrack(track)));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
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
  })()
    .catch(() => {
      if (!loaded) cache = EMPTY;
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

  // likes made on another device: pick them up when the app comes back to the
  // front and every couple of minutes while it's in use
  let lastRefresh = Date.now();
  const refreshIfStale = (minAgeMs: number) => {
    if (!loaded || document.visibilityState !== "visible" || Date.now() - lastRefresh < minAgeMs) return;
    lastRefresh = Date.now();
    void load(true);
  };
  window.addEventListener("library:changed", () => (lastRefresh = Date.now()));
  window.addEventListener("focus", () => refreshIfStale(15_000));
  document.addEventListener("visibilitychange", () => refreshIfStale(15_000));
  setInterval(() => refreshIfStale(45_000), 15_000);
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
