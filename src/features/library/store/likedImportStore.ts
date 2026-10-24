// State of the Spotify Liked Songs → Lane likes transfer, for the dialog and
// the library card. The work itself is in likedImportRunner.ts; this wires it
// to the network, keeps the app awake while it runs and saves progress.
import { create } from "zustand";
import { api, getAuthSession } from "@/shared/api";
import { findCatalogMatch, isRateLimit } from "@/shared/media/matching";
import { keepAwake } from "@/shared/platform/keepAwake";
import { createTranslatorSync, getStoredLocale } from "@/languages";
import { notifyLibraryChanged } from "../hooks/usePlaylists";
import { fetchSpotifyLikedPage, spotifyAccountId } from "../services/import/sources/spotify/spotifyAccount";
import {
  countItems,
  expandTrack,
  LikedImportRunner,
  newImportState,
  requeue,
  type BatchLog,
  type ImportCounts,
  type LikedImportState,
  type RunnerDeps,
} from "../services/import/likedImport/likedImportRunner";
import { clearImportState, loadImportState, saveImportState } from "../services/import/likedImport/likedImportStorage";

export type LikedImportPhase = "idle" | "collecting" | "importing" | "waiting" | "paused" | "done" | "error";

export interface LikedImportView {
  phase: LikedImportPhase;
  /** a saved import exists for this Lane account */
  job: LikedImportState | null;
  counts: ImportCounts;
  collect: { read: number; total: number };
  current: { n: number; of: number; from: number; to: number; retry: boolean } | null;
  log: BatchLog[];
  waitUntil: number | null;
  waitReason: "rate_limit" | "network" | null;
  error: string | null;
}

interface LikedImportActions {
  /** read a saved import (on opening the dialog) */
  restore: () => Promise<void>;
  /** start a new import, or continue the saved one */
  start: () => Promise<void>;
  pause: () => void;
  retry: (includeNotFound: boolean) => Promise<void>;
  acceptReview: (index: number) => Promise<void>;
  acceptAllReviews: () => Promise<void>;
  dismissReview: (index: number) => Promise<void>;
  /** forget the saved import (start over) */
  discard: () => Promise<void>;
}

const EMPTY_COUNTS: ImportCounts = { total: 0, done: 0, liked: 0, duplicate: 0, notFound: 0, review: 0, failed: 0, skipped: 0 };

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });

async function allLikedIds(signal?: AbortSignal): Promise<Set<string>> {
  const ids = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; page < 500; page++) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const res = await api.listLikedTracks(100, cursor);
    for (const item of res.items ?? []) if (item.track?.id) ids.add(item.track.id);
    cursor = res.nextCursor ?? undefined;
    if (!cursor || !res.items?.length) break;
  }
  return ids;
}

/** notification texts: shown by the system, outside React */
function tx(key: string, fallback: string, vars?: Record<string, unknown>): string {
  const t = createTranslatorSync(getStoredLocale());
  const v = t(`library.spotify_liked.${key}`, vars as never);
  if (v && v !== `library.spotify_liked.${key}`) return v;
  return fallback.replace(/\{(\w+)\}/g, (_, k: string) => String(vars?.[k] ?? ""));
}

function owner(): string {
  return getAuthSession()?.user?.id ?? "";
}

let controller: AbortController | null = null;
let libraryRefresh: ReturnType<typeof setTimeout> | null = null;

function refreshLibrarySoon() {
  if (libraryRefresh) return;
  libraryRefresh = setTimeout(() => {
    libraryRefresh = null;
    notifyLibraryChanged();
  }, 1500);
}

export const useLikedImportStore = create<LikedImportView & LikedImportActions>((set, get) => {
  const view = (job: LikedImportState | null): Partial<LikedImportView> => ({
    job,
    counts: job ? countItems(job) : EMPTY_COUNTS,
    log: job ? job.batches.slice(-50) : [],
  });

  const persistQuietly = async (job: LikedImportState) => {
    job.updatedAt = Date.now();
    await saveImportState(job);
    set(view({ ...job }));
  };

  const deps = (onUpdate: (state: LikedImportState) => void, holder: { update: (p: { text?: string; progress?: number; max?: number }) => void }): RunnerDeps => ({
    fetchSpotifyPage: fetchSpotifyLikedPage,
    match: findCatalogMatch,
    like: (track) => api.likeTrackSnapshot(track.id, expandTrack(track)),
    likedIds: allLikedIds,
    save: saveImportState,
    sleep,
    isRateLimit,
    onEvent: (event, state) => {
      switch (event.type) {
        case "collecting":
          set({ phase: "collecting", collect: { read: event.read, total: event.total }, waitUntil: null, waitReason: null });
          holder.update({ text: tx("collecting", "Reading Spotify likes: {read} of {total}", { read: event.read, total: event.total }), progress: event.read, max: event.total });
          break;
        case "batch_start":
          set({ phase: "importing", current: { n: event.n, of: event.of, from: event.from, to: event.to, retry: event.retry }, waitUntil: null, waitReason: null });
          holder.update({ text: tx("batch", "Batch {n} of {of} · tracks {from}–{to}", { ...event }) });
          break;
        case "track":
          onUpdate(state);
          if (state.items[event.index]?.status === "liked") refreshLibrarySoon();
          break;
        case "batch_done": {
          onUpdate(state);
          const c = countItems(state);
          holder.update({ text: tx("notif_progress", "Added {liked} · {done} of {total} processed", { ...c }), progress: c.done, max: c.total });
          break;
        }
        case "waiting":
          set({ phase: "waiting", waitUntil: Date.now() + event.ms, waitReason: event.reason });
          holder.update({ text: event.reason === "rate_limit" ? tx("notif_wait_rate", "Waiting out a rate limit…") : tx("notif_wait_network", "No connection, waiting…") });
          break;
        case "done":
          onUpdate(state);
          break;
      }
    },
  });

  const runWith = async (prepare: (job: LikedImportState | null) => Promise<LikedImportState>) => {
    if (controller) return;
    const ctrl = new AbortController();
    controller = ctrl;
    set({ phase: "collecting", error: null, waitUntil: null, waitReason: null });
    const holder = await keepAwake({ title: tx("notif_title", "Transferring likes from Spotify"), text: tx("notif_preparing", "Getting ready…") });
    let throttle = 0;
    const onUpdate = (state: LikedImportState) => {
      const now = Date.now();
      if (now - throttle < 150) return;
      throttle = now;
      set(view({ ...state, items: state.items }));
    };
    try {
      const job = await prepare(get().job);
      set(view(job));
      const runner = new LikedImportRunner(deps(onUpdate, holder));
      await runner.run(job, ctrl.signal);
      set({ ...view({ ...job }), phase: "done", current: null, waitUntil: null, waitReason: null });
      notifyLibraryChanged();
    } catch (error) {
      const job = get().job;
      if (ctrl.signal.aborted) {
        set({ phase: "paused", waitUntil: null, waitReason: null });
      } else {
        set({ phase: "error", error: error instanceof Error ? error.message : String(error), waitUntil: null, waitReason: null });
      }
      if (job) set(view({ ...job }));
      notifyLibraryChanged();
    } finally {
      holder.release();
      if (controller === ctrl) controller = null;
    }
  };

  return {
    phase: "idle",
    job: null,
    counts: EMPTY_COUNTS,
    collect: { read: 0, total: 0 },
    current: null,
    log: [],
    waitUntil: null,
    waitReason: null,
    error: null,

    restore: async () => {
      if (controller) return;
      const saved = await loadImportState();
      const mine = saved && saved.owner === owner() ? saved : null;
      set({ ...view(mine), phase: mine ? (mine.finished ? "done" : "paused") : "idle" });
    },

    start: () =>
      runWith(async (current) => {
        const me = owner();
        const account = await spotifyAccountId().catch(() => "");
        // the saved import belongs to this Lane account and this Spotify account: go on
        if (current && current.owner === me && (!account || !current.spotifyUser || current.spotifyUser === account)) {
          if (current.finished) {
            // finished earlier: read Spotify again and pick up only new likes
            const fresh = newImportState(me, account || current.spotifyUser);
            const runner = new LikedImportRunner({ ...deps(() => {}, { update: () => {} }), save: async () => {} });
            await runner.collect(fresh);
            const known = new Set(current.items.map((i) => i.source.sourceId));
            const added = fresh.items.filter((i) => !known.has(i.source.sourceId));
            current.items.push(...added);
            current.finished = added.length === 0;
            await saveImportState(current);
          }
          return current;
        }
        const job = newImportState(me, account);
        await saveImportState(job);
        return job;
      }),

    pause: () => {
      controller?.abort();
    },

    retry: async (includeNotFound) => {
      const job = get().job;
      if (!job || controller) return;
      if (requeue(job, includeNotFound) === 0) return;
      await saveImportState(job);
      await runWith(async () => job);
    },

    acceptReview: async (index) => {
      const job = get().job;
      const item = job?.items[index];
      if (!job || !item?.proposed) return;
      const runner = new LikedImportRunner(deps(() => {}, { update: () => {} }));
      item.status = await runner.likeOne(item.proposed, job);
      if (item.status === "liked" || item.status === "duplicate") item.laneId = item.proposed.id;
      await persistQuietly(job);
      notifyLibraryChanged();
    },

    acceptAllReviews: async () => {
      const job = get().job;
      if (!job) return;
      const runner = new LikedImportRunner(deps(() => {}, { update: () => {} }));
      for (const item of job.items) {
        if (item.status !== "review" || !item.proposed) continue;
        item.status = await runner.likeOne(item.proposed, job);
        if (item.status === "liked" || item.status === "duplicate") item.laneId = item.proposed.id;
        set(view({ ...job }));
      }
      await persistQuietly(job);
      notifyLibraryChanged();
    },

    dismissReview: async (index) => {
      const job = get().job;
      const item = job?.items[index];
      if (!job || !item) return;
      item.status = "skipped";
      await persistQuietly(job);
    },

    discard: async () => {
      controller?.abort();
      await clearImportState();
      set({ ...view(null), phase: "idle", current: null, error: null, collect: { read: 0, total: 0 } });
    },
  };
});
