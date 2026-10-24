// Moves Spotify Liked Songs into the listener's Lane likes, in small batches.
//
// 1. The whole Spotify list is read first (50 per request, fast) and saved.
// 2. Then it goes batch by batch, oldest first (so the newest like ends up on
//    top, like in Spotify): each track is found on YouTube Music and liked in
//    Lane. After every batch the progress is saved, so a closed app, a lost
//    connection or a pause continues where it stopped.
// 3. Protection: a track already liked in Lane (or liked earlier in this
//    import) is not liked twice; a Spotify song listed twice is read once;
//    an unsure match is left for the listener to confirm; not found and
//    failed tracks are kept in lists and can be retried.
// 4. Limits: YouTube / Lane rate limits are waited out (with growing pauses)
//    instead of turning into "not found"; batches are spaced out.
//
// Everything that talks to the network comes in through `deps`, so the logic
// is tested without it.
import type { Track } from "@/shared/contracts";
import type { ClientImportedTrack } from "../importTypes";

export const BATCH_SIZE = 25;
export const SPOTIFY_PAGE = 50;
const MATCH_CONCURRENCY = 3;
const BATCH_GAP_MS = 800;
const MAX_WAIT_MS = 120_000;
const NETWORK_RETRIES = 5;

export type ItemStatus = "liked" | "duplicate" | "not_found" | "review" | "failed" | "skipped";

/** a matched YouTube Music track, kept small for storage */
export interface CompactTrack {
  id: string;
  title: string;
  artists: { id: string; name: string }[];
  durationMs: number;
  album?: { id: string; title: string };
  coverUrl?: string;
}

export interface ImportItem {
  source: ClientImportedTrack;
  status?: ItemStatus;
  /** the Lane track it was liked as (liked / duplicate) */
  laneId?: string;
  /** an unsure match waiting for the listener (review) */
  proposed?: CompactTrack;
  score?: number;
}

export interface BatchLog {
  n: number;
  of: number;
  from: number;
  to: number;
  liked: number;
  duplicate: number;
  notFound: number;
  review: number;
  failed: number;
  /** 1 for the first pass, 2+ for retries of failed / not found tracks */
  pass: number;
  at: number;
}

export interface LikedImportState {
  version: 1;
  owner: string;
  spotifyUser: string;
  createdAt: number;
  updatedAt: number;
  /** the whole Spotify list has been read */
  collected: boolean;
  /** oldest like first */
  items: ImportItem[];
  batches: BatchLog[];
  /** 1 for the first pass, 2+ after "retry" */
  pass: number;
  finished: boolean;
}

export type MatchOutcome =
  | { status: "approved"; track: Track; score: number }
  | { status: "pending"; reason: string; score?: number; proposedTrack?: Track };

export type RunnerEvent =
  | { type: "collecting"; read: number; total: number }
  | { type: "batch_start"; n: number; of: number; from: number; to: number; retry: boolean }
  | { type: "track"; index: number; status: ItemStatus }
  | { type: "batch_done"; log: BatchLog }
  | { type: "waiting"; ms: number; reason: "rate_limit" | "network" }
  | { type: "done" };

export interface RunnerDeps {
  fetchSpotifyPage: (offset: number, limit: number, signal?: AbortSignal) => Promise<{ total: number; count: number; tracks: ClientImportedTrack[] }>;
  match: (track: ClientImportedTrack, signal?: AbortSignal) => Promise<MatchOutcome>;
  /** throws on failure; an error with status 409 means "already liked" */
  like: (track: CompactTrack, signal?: AbortSignal) => Promise<void>;
  /** ids of everything already liked in Lane */
  likedIds: (signal?: AbortSignal) => Promise<Set<string>>;
  save: (state: LikedImportState) => Promise<void>;
  sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
  isRateLimit: (error: unknown) => boolean;
  onEvent?: (event: RunnerEvent, state: LikedImportState) => void;
  now?: () => number;
}

export function newImportState(owner: string, spotifyUser: string, now = Date.now()): LikedImportState {
  return { version: 1, owner, spotifyUser, createdAt: now, updatedAt: now, collected: false, items: [], batches: [], pass: 1, finished: false };
}

export function compactTrack(track: Track): CompactTrack {
  return {
    id: track.id,
    title: track.title,
    artists: track.artists.map((a) => ({ id: a.id, name: a.name })),
    durationMs: track.durationMs ?? 0,
    ...(track.album ? { album: { id: track.album.id, title: track.album.title } } : {}),
    ...(track.cover?.url ? { coverUrl: track.cover.url } : {}),
  };
}

export function expandTrack(track: CompactTrack): Track {
  return {
    id: track.id,
    title: track.title,
    artists: track.artists,
    durationMs: track.durationMs,
    ...(track.album ? { album: track.album } : {}),
    ...(track.coverUrl ? { cover: { url: track.coverUrl, width: 480, height: 480 } } : {}),
  };
}

export interface ImportCounts {
  total: number;
  done: number;
  liked: number;
  duplicate: number;
  notFound: number;
  review: number;
  failed: number;
  skipped: number;
}

export function countItems(state: LikedImportState): ImportCounts {
  const c: ImportCounts = { total: state.items.length, done: 0, liked: 0, duplicate: 0, notFound: 0, review: 0, failed: 0, skipped: 0 };
  for (const item of state.items) {
    if (!item.status) continue;
    c.done += 1;
    if (item.status === "liked") c.liked += 1;
    else if (item.status === "duplicate") c.duplicate += 1;
    else if (item.status === "not_found") c.notFound += 1;
    else if (item.status === "review") c.review += 1;
    else if (item.status === "failed") c.failed += 1;
    else c.skipped += 1;
  }
  return c;
}

function trackKey(t: ClientImportedTrack): string {
  return t.sourceId || `${t.title}|${t.artists.join(",")}`.toLowerCase();
}

function statusOf(error: unknown): number | undefined {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" ? status : undefined;
}

function isAbort(error: unknown, signal?: AbortSignal): boolean {
  return Boolean(signal?.aborted) || (error as { name?: string } | null)?.name === "AbortError";
}

export class LikedImportRunner {
  private readonly now: () => number;

  constructor(private readonly deps: RunnerDeps) {
    this.now = deps.now ?? Date.now;
  }

  private emit(event: RunnerEvent, state: LikedImportState) {
    this.deps.onEvent?.(event, state);
  }

  private async persist(state: LikedImportState) {
    state.updatedAt = this.now();
    await this.deps.save(state);
  }

  /** a call that may be rate-limited: wait with growing pauses until it goes through */
  private async patiently<T>(run: () => Promise<T>, state: LikedImportState, signal?: AbortSignal): Promise<T> {
    let wait = 5_000;
    for (;;) {
      try {
        return await run();
      } catch (error) {
        if (isAbort(error, signal) || !this.deps.isRateLimit(error)) throw error;
        // the service said how long to wait (Spotify can ask for many minutes):
        // wait exactly that, asking earlier only extends the block
        const told = (error as { retryAfterMs?: unknown } | null)?.retryAfterMs;
        const ms = typeof told === "number" && told > 0 ? told + 1_000 : wait;
        this.emit({ type: "waiting", ms, reason: "rate_limit" }, state);
        await this.deps.sleep(ms, signal);
        wait = Math.min(wait * 2, MAX_WAIT_MS);
      }
    }
  }

  /** step 1: the whole Spotify list, newest first there, stored oldest first */
  async collect(state: LikedImportState, signal?: AbortSignal): Promise<void> {
    if (state.collected) return;
    const seen = new Set<string>();
    const newestFirst: ClientImportedTrack[] = [];
    let offset = 0;
    let total = 0;
    for (;;) {
      const page = await this.patiently(() => this.deps.fetchSpotifyPage(offset, SPOTIFY_PAGE, signal), state, signal);
      total = page.total;
      for (const t of page.tracks) {
        const key = trackKey(t);
        if (seen.has(key)) continue;
        seen.add(key);
        newestFirst.push(t);
      }
      offset += page.count;
      this.emit({ type: "collecting", read: Math.min(offset, total), total }, state);
      if (page.count === 0 || offset >= total) break;
      await this.deps.sleep(300, signal);
    }
    state.items = newestFirst.reverse().map((source) => ({ source }));
    state.collected = true;
    await this.persist(state);
  }

  /** step 2: everything without a status yet, batch by batch */
  async run(state: LikedImportState, signal?: AbortSignal): Promise<void> {
    await this.collect(state, signal);

    const liked = await this.deps.likedIds(signal);
    for (const item of state.items) {
      if ((item.status === "liked" || item.status === "duplicate") && item.laneId) liked.add(item.laneId);
    }

    const pending = () => state.items.map((item, i) => (item.status ? -1 : i)).filter((i) => i >= 0);
    const pass = state.pass || 1;
    const retry = pass > 1;
    let queue = pending();

    while (queue.length) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const indexes = queue.slice(0, BATCH_SIZE);
      // first pass: batches follow the list (batch 3 = tracks 51–75), so a
      // resumed import keeps its numbers; a retry pass counts its own batches
      const doneInPass = state.batches.filter((b) => b.pass === pass).length;
      const n = retry ? doneInPass + 1 : Math.floor(indexes[0] / BATCH_SIZE) + 1;
      const of = retry ? doneInPass + Math.ceil(queue.length / BATCH_SIZE) : Math.ceil(state.items.length / BATCH_SIZE);
      const from = indexes[0] + 1;
      const to = indexes[indexes.length - 1] + 1;
      this.emit({ type: "batch_start", n, of, from, to, retry }, state);

      await this.processBatch(state, indexes, liked, signal);

      const log: BatchLog = {
        n,
        of,
        from,
        to,
        liked: 0,
        duplicate: 0,
        notFound: 0,
        review: 0,
        failed: 0,
        pass,
        at: this.now(),
      };
      for (const i of indexes) {
        const s = state.items[i].status;
        if (s === "liked") log.liked += 1;
        else if (s === "duplicate") log.duplicate += 1;
        else if (s === "not_found") log.notFound += 1;
        else if (s === "review") log.review += 1;
        else if (s === "failed") log.failed += 1;
      }
      state.batches.push(log);
      state.batches = state.batches.slice(-200);
      await this.persist(state);
      this.emit({ type: "batch_done", log }, state);

      queue = pending();
      if (queue.length) await this.deps.sleep(BATCH_GAP_MS, signal);
    }

    state.finished = true;
    await this.persist(state);
    this.emit({ type: "done" }, state);
  }

  private async processBatch(state: LikedImportState, indexes: number[], liked: Set<string>, signal?: AbortSignal) {
    // find every track of the batch on YouTube Music (a few at a time)
    let outcomes: MatchOutcome[] = [];
    for (let attempt = 0; ; attempt++) {
      outcomes = await this.matchAll(state, indexes, signal);
      const lookupFailed = outcomes.filter((o) => o.status === "pending" && o.reason === "catalog_lookup_failed").length;
      // the whole batch failed to search: the connection is down, not the tracks
      if (lookupFailed < indexes.length || attempt >= NETWORK_RETRIES) break;
      const wait = Math.min(10_000 * 2 ** attempt, MAX_WAIT_MS);
      this.emit({ type: "waiting", ms: wait, reason: "network" }, state);
      await this.deps.sleep(wait, signal);
    }
    if (outcomes.every((o) => o.status === "pending" && o.reason === "catalog_lookup_failed")) {
      throw new Error("YouTube Music is unreachable. The import is paused and can be continued later.");
    }

    // then like them in order, so Lane keeps the Spotify order
    for (const [k, index] of indexes.entries()) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const item = state.items[index];
      const outcome = outcomes[k];
      if (outcome.status === "approved") {
        const track = compactTrack(outcome.track);
        item.score = outcome.score;
        if (liked.has(track.id)) {
          item.status = "duplicate";
          item.laneId = track.id;
        } else {
          item.status = await this.likeOne(track, state, signal);
          if (item.status === "liked" || item.status === "duplicate") {
            item.laneId = track.id;
            liked.add(track.id);
          }
        }
      } else if (outcome.proposedTrack) {
        item.status = liked.has(outcome.proposedTrack.id) ? "duplicate" : "review";
        if (item.status === "duplicate") item.laneId = outcome.proposedTrack.id;
        else item.proposed = compactTrack(outcome.proposedTrack);
        if (outcome.score !== undefined) item.score = outcome.score;
      } else {
        item.status = outcome.reason === "catalog_lookup_failed" ? "failed" : "not_found";
      }
      this.emit({ type: "track", index, status: item.status }, state);
    }
  }

  private async matchAll(state: LikedImportState, indexes: number[], signal?: AbortSignal): Promise<MatchOutcome[]> {
    const results: MatchOutcome[] = new Array(indexes.length);
    let cursor = 0;
    const worker = async () => {
      while (cursor < indexes.length) {
        const k = cursor++;
        const source = state.items[indexes[k]].source;
        results[k] = await this.patiently(() => this.deps.match(source, signal), state, signal).catch((error: unknown) => {
          if (isAbort(error, signal)) throw error;
          return { status: "pending" as const, reason: "catalog_lookup_failed" };
        });
      }
    };
    await Promise.all(Array.from({ length: Math.min(MATCH_CONCURRENCY, indexes.length) }, worker));
    return results;
  }

  /** like one track in Lane; rate limits and server hiccups are retried */
  async likeOne(track: CompactTrack, state: LikedImportState, signal?: AbortSignal): Promise<ItemStatus> {
    for (let attempt = 0; ; attempt++) {
      try {
        await this.patiently(() => this.deps.like(track, signal), state, signal);
        return "liked";
      } catch (error) {
        if (isAbort(error, signal)) throw error;
        const status = statusOf(error);
        if (status === 409) return "duplicate";
        const retryable = status === undefined || status === 0 || status === 408 || status >= 500;
        if (!retryable || attempt >= 3) return "failed";
        await this.deps.sleep(2_000 * 2 ** attempt, signal);
      }
    }
  }
}

/** put failed (and, if asked, not found) tracks back in line for another pass */
export function requeue(state: LikedImportState, includeNotFound: boolean): number {
  let n = 0;
  for (const item of state.items) {
    if (item.status === "failed" || (includeNotFound && item.status === "not_found")) {
      delete item.status;
      n += 1;
    }
  }
  if (n) {
    state.finished = false;
    state.pass = (state.pass || 1) + 1;
  }
  return n;
}
