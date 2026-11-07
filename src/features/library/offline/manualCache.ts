import { create } from "zustand";
import type { Track } from "@/shared/types";
import { audioCache } from "@/shared/storage/audioCache";
import { linerDb } from "@/shared/storage/linerDb";
import { isLocalTrackId } from "@/shared/media/local/localTracks";
import { resolvePlaybackStream } from "@/features/player/engine/streamResolver";
import { downloadPlaybackAudio } from "@/features/player/engine/downloadPlaybackAudio";
import { usePlayerStore } from "@/features/player/store/playerStore";
import { useOfflineLibraryStore } from "./offlineLibraryStore";

export const useManualCacheStore = create<{ pending: Set<string>; playlists: Set<string> }>(() => ({
  pending: new Set(), playlists: new Set(),
}));
const jobs = new Map<string, Promise<void>>();
const batches = new Map<string, Promise<{ saved: number; total: number }>>();
const controllers = new Set<AbortController>();
let tail: Promise<void> = Promise.resolve();
const cancelled = () => new DOMException("Cache cleared", "AbortError");
export const canCacheTrack = (track: Track) => !isLocalTrackId(track.id) && !track.onlyOnDevice;

window.addEventListener("lane:audio-cache-clearing", () => {
  controllers.forEach(controller => controller.abort());
});

/** One network download at a time, independent of playback and the current page. */
export function saveTrackToCache(track: Track): Promise<void> {
  const existing = jobs.get(track.id);
  if (existing) return existing;
  if (!canCacheTrack(track)) return Promise.reject(new Error("Unavailable track"));
  const generation = audioCache.currentGeneration();
  const controller = new AbortController();
  controllers.add(controller);
  useManualCacheStore.setState(state => ({ pending: new Set([...state.pending, track.id]) }));
  const job = tail.then(async () => {
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(120_000)]);
    const check = () => {
      if (generation !== audioCache.currentGeneration()) throw cancelled();
      if (signal.aborted) throw signal.reason ?? cancelled();
    };
    check();
    if (await audioCache.hasAudio(track.id)) return;
    check();
    const stream = await resolvePlaybackStream(track, signal, usePlayerStore.getState().audioQuality);
    check();
    const blob = await downloadPlaybackAudio(stream, signal);
    check();
    if (!blob?.size) throw new Error("No cacheable audio");
    const limit = audioCache.getLimitBytes();
    if (limit > 0 && blob.size > limit) throw new Error("Cache limit exceeded");
    await linerDb.putTrack(track);
    check();
    if (!await audioCache.saveAudioBlob(track.id, blob, blob.type, generation)) {
      check();
      throw new Error("Audio was not retained");
    }
    check();
  }).then(async () => {
    await useOfflineLibraryStore.getState().refresh();
    if (generation !== audioCache.currentGeneration()) throw cancelled();
    if (!useOfflineLibraryStore.getState().cachedTrackIds.has(track.id)) throw new Error("Audio was not retained");
  }).finally(() => {
    controllers.delete(controller);
    jobs.delete(track.id);
    useManualCacheStore.setState(state => {
      const pending = new Set(state.pending); pending.delete(track.id); return { pending };
    });
  });
  jobs.set(track.id, job);
  tail = job.catch(() => {});
  return job;
}

export function savePlaylistToCache(id: string, loadTracks: () => Promise<Track[]>): Promise<{ saved: number; total: number }> {
  const existing = batches.get(id);
  if (existing) return existing;
  const generation = audioCache.currentGeneration();
  useManualCacheStore.setState(state => ({ playlists: new Set([...state.playlists, id]) }));
  const job = (async () => {
    const tracks = [...new Map((await loadTracks()).filter(canCacheTrack).map(track => [track.id, track])).values()];
    if (!tracks.length) throw new Error("Empty playlist");
    for (const track of tracks) {
      if (generation !== audioCache.currentGeneration()) throw cancelled();
      try { await saveTrackToCache(track); }
      catch { if (generation !== audioCache.currentGeneration()) throw cancelled(); }
    }
    await useOfflineLibraryStore.getState().refresh();
    if (generation !== audioCache.currentGeneration()) throw cancelled();
    const ids = useOfflineLibraryStore.getState().cachedTrackIds;
    return { saved: tracks.filter(track => ids.has(track.id)).length, total: tracks.length };
  })().finally(() => {
    batches.delete(id);
    useManualCacheStore.setState(state => {
      const playlists = new Set(state.playlists); playlists.delete(id); return { playlists };
    });
  });
  batches.set(id, job);
  return job;
}
