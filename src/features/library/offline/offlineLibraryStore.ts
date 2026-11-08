import { create } from "zustand";
import { downloadsDb, type DownloadEntry } from "@/shared/storage/downloadsDb";
import { linerDb } from "@/shared/storage/linerDb";
import { audioCache } from "@/shared/storage/audioCache";
import { isStandaloneAudioFile } from "@/shared/storage/audioFormat";
import { usePlayerStore } from "@/features/player/store/playerStore";
import { isLocalTrackId } from "@/shared/media/local/localTracks";
import { likedTracksSnapshot, subscribeLikedTracks, loadLikedTracks } from "../hooks/useLikedTracks";
import type { Track } from "@/shared/types";

const ENABLED = "lane_download_likes";
const LIMIT = "lane_download_limit";
const VISIBLE = "liner_cached_songs_online";
const GB = 1024 ** 3;
function read(key: string) { try { return localStorage.getItem(key); } catch { return null; } }
function write(key: string, value: string) { try { localStorage.setItem(key, value); } catch {} }
const storedLimit = Number(read(LIMIT));

type Phase = "idle" | "saving" | "offline" | "limit" | "error";
interface OfflineLibraryState {
  downloads: DownloadEntry[];
  cached: Track[];
  cachedTrackIds: Set<string>;
  loaded: boolean;
  enabled: boolean;
  limitBytes: number;
  visibleOnline: boolean;
  phase: Phase;
  pending: number;
  refresh: () => Promise<void>;
  setEnabled: (enabled: boolean) => void;
  setLimitBytes: (bytes: number) => void;
  setVisibleOnline: (visible: boolean) => void;
  removeDownloads: () => Promise<void>;
}
let refreshRequest: Promise<void> | undefined;
let refreshAgain = false;
let controller: AbortController | undefined;
const downloadFailures = new Map<string, { attempts: number; retryAt: number }>();
let running = false;
let rerun = false;
let retryTimer: ReturnType<typeof setTimeout> | undefined;

export const useOfflineLibraryStore = create<OfflineLibraryState>((set, get) => ({
  downloads: [], cached: [], cachedTrackIds: new Set(), loaded: false,
  enabled: read(ENABLED) === "1",
  limitBytes: read(LIMIT) !== null && Number.isFinite(storedLimit) && storedLimit >= 0 ? storedLimit : 5 * GB,
  visibleOnline: read(VISIBLE) !== "0",
  phase: "idle", pending: 0,
  refresh: () => {
    if (refreshRequest) { refreshAgain = true; return refreshRequest; }
    refreshRequest = (async () => {
      do {
        refreshAgain = false;
        const [downloads, entries] = await Promise.all([downloadsDb.list(), linerDb.listAudioEntries()]);
        const audioEntries = entries.filter(entry => entry.byteSize > 0);
        const records = await linerDb.getTracks(audioEntries.map(entry => entry.trackId));
        const cached = records.map(record => ({ ...record, coverUrl: record.coverUrl ?? "", playCount: 0,
          album: record.albumTitle ? { id: record.albumId ?? "", title: record.albumTitle } : undefined } as Track));
        const cachedTrackIds = new Set([...downloads.filter(entry => entry.byteSize > 0).map(entry => entry.track.id), ...entries.filter(entry => entry.byteSize > 0).map(entry => entry.trackId)]);
        set({ downloads, cached, cachedTrackIds, loaded: true });
      } while (refreshAgain);
    })().finally(() => { refreshRequest = undefined; });
    return refreshRequest;
  },
  setEnabled: enabled => {
    write(ENABLED, enabled ? "1" : "0"); set({ enabled, phase: "idle" });
    if (!enabled) controller?.abort();
    else { void navigator.storage?.persist?.().catch(() => {}); scheduleDownloads(); }
  },
  setLimitBytes: bytes => {
    if (!Number.isFinite(bytes) || bytes < 0) return;
    write(LIMIT, String(bytes)); set({ limitBytes: bytes }); scheduleDownloads();
  },
  setVisibleOnline: visibleOnline => { write(VISIBLE, visibleOnline ? "1" : "0"); set({ visibleOnline }); },
  removeDownloads: async () => {
    get().setEnabled(false);
    // Let an in-flight write finish before clearing the database.
    await activeSync;
    await refreshRequest;
    await downloadsDb.clear();
    audioCache.invalidate();
    set({ downloads: [], cachedTrackIds: new Set(get().cached.map(track => track.id)), pending: 0, phase: "idle" });
    window.dispatchEvent(new Event("lane:storage-changed"));
    window.dispatchEvent(new Event("lane:audio-cache-changed"));
  },
}));

let activeSync: Promise<void> | undefined;
export function scheduleDownloads() {
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = undefined; }
  if (running) { rerun = true; return; }
  running = true;
  activeSync = syncDownloads().catch(() => {
    useOfflineLibraryStore.setState({ phase: "error" });
  }).finally(() => {
    running = false;
    controller = undefined;
    if (rerun) { rerun = false; scheduleDownloads(); }
  });
}
async function syncDownloads() {
  const store = useOfflineLibraryStore;
  if (!store.getState().enabled) return;
  if (!navigator.onLine) { store.setState({ phase: "offline" }); return; }
  await store.getState().refresh();
  const saved = new Set(store.getState().downloads.map(entry => entry.track.id));
  // Pin only audio already cached by playback; never download unheard likes.
  const cachedIds = new Set(store.getState().cached.map(track => track.id));
  const tracks = likedTracksSnapshot().filter(track => cachedIds.has(track.id) && !isLocalTrackId(track.id) && !saved.has(track.id));
  let usage = store.getState().downloads.reduce((sum, entry) => sum + entry.byteSize, 0);
  let failed = 0;
  let attempted = 0;
  store.setState({ pending: tracks.length });
  for (let i = 0; i < tracks.length; i++) {
    if (!store.getState().enabled) return;
    if ((downloadFailures.get(tracks[i].id)?.retryAt ?? 0) > Date.now()) { failed += 1; continue; }
    // Yield between small batches instead of resolving an entire library at once.
    if (attempted >= 3) { retryLater(15_000); return; }
    attempted += 1;
    if (!navigator.onLine) { store.setState({ phase: "offline" }); return; }
    const limit = store.getState().limitBytes;
    if (limit > 0 && usage >= limit) { store.setState({ phase: "limit" }); return; }
    // Playback has priority over background downloads.
    if (usePlayerStore.getState().status === "loading") { retryLater(); return; }
    controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(120_000)]);
    store.setState({ phase: "saving", pending: tracks.length - i });
    try {
      const track = tracks[i];
      const cached = await linerDb.getAudio(track.id);
      const blob = cached?.blob;
      if (!blob) continue;
      if (signal.aborted || !store.getState().enabled) return;
      if (!isStandaloneAudioFile(new Uint8Array(await blob.slice(0, 16).arrayBuffer()))) throw new Error("Invalid audio file");
      const currentLimit = store.getState().limitBytes;
      if (currentLimit > 0 && usage + blob.size > currentLimit) { store.setState({ phase: "limit" }); return; }
      await downloadsDb.put(track, blob);
      downloadFailures.delete(track.id);
      usage += blob.size;
      await audioCache.deleteAudio(track.id);
      await store.getState().refresh();
      window.dispatchEvent(new Event("lane:storage-changed"));
    } catch (error) {
      if (!store.getState().enabled) return;
      if (error instanceof DOMException && error.name === "QuotaExceededError") { store.setState({ phase: "error" }); return; }
      const id = tracks[i].id;
      const attempts = (downloadFailures.get(id)?.attempts ?? 0) + 1;
      downloadFailures.set(id, { attempts, retryAt: Date.now() + Math.min(30 * 60_000, 60_000 * 2 ** Math.min(attempts, 5)) });
      failed += 1;
    }
  }
  store.setState({ phase: failed ? "error" : "idle", pending: failed });
  if (failed) retryLater();
}
function retryLater(delayMs = 60_000) {
  retryTimer = setTimeout(() => { retryTimer = undefined; scheduleDownloads(); }, delayMs);
}
let started = false;
export function initOfflineLibrary() {
  if (started) return;
  started = true;
  void useOfflineLibraryStore.getState().refresh().catch(() => {});
  subscribeLikedTracks(scheduleDownloads);
  void loadLikedTracks().then(scheduleDownloads);
  window.addEventListener("online", scheduleDownloads);
  window.addEventListener("offline", () => {
    controller?.abort();
    if (useOfflineLibraryStore.getState().enabled) useOfflineLibraryStore.setState({ phase: "offline" });
  });
  window.addEventListener("lane:audio-cache-changed", () => {
    void useOfflineLibraryStore.getState().refresh().then(scheduleDownloads).catch(() => {});
  });
}
