import { playerEngine, setRadioRefillProvider } from "@/features/player/engine/playerEngine";
import { usePlayerStore } from "@/features/player/store/playerStore";
import { api, toClientTrack } from "@/shared/api";
import type { Track } from "@/shared/types/track";
import { buildTaste, pickWeighted, selectFresh, affinity, type TasteProfile, type VibeMood } from "./vibeTaste";

// "My Vibe": an endless personal stream. Every batch is grown with the radio
// engine from a few seeds drawn from what the listener likes and plays (and
// likes / skips during the vibe), then filtered to music they haven't heard.
// With a mood picked, seeds and picks lean on tracks from mood playlists by
// artists the listener likes, and radio from those keeps the mood.

export type { VibeMood } from "./vibeTaste";

const VIBE_CONTEXT_KEY = "lane_vibe_context";
const RECENT_SEEDS_KEY = "lane_vibe_recent_seeds";
const MOOD_KEY = "lane_vibe_mood";
const BATCH = 20;

let vibeContext: string | null = (() => {
  try {
    return sessionStorage.getItem(VIBE_CONTEXT_KEY);
  } catch {
    return null;
  }
})();

function recentSeeds(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_SEEDS_KEY) || "[]") as string[];
  } catch {
    return [];
  }
}

function rememberSeeds(ids: string[]): void {
  try {
    const next = [...ids, ...recentSeeds().filter((x) => !ids.includes(x))].slice(0, 30);
    localStorage.setItem(RECENT_SEEDS_KEY, JSON.stringify(next));
  } catch {}
}

export function storedMood(): VibeMood | null {
  try {
    const v = localStorage.getItem(MOOD_KEY);
    return v === "happy" || v === "calm" || v === "sad" ? v : null;
  } catch {
    return null;
  }
}

export function storeMood(mood: VibeMood | null): void {
  try {
    if (mood) localStorage.setItem(MOOD_KEY, mood);
    else localStorage.removeItem(MOOD_KEY);
  } catch {}
}

export function isVibeContext(playbackContext: string | null | undefined): boolean {
  return !!vibeContext && playbackContext === vibeContext;
}

export function vibeMoodOf(playbackContext: string | null | undefined): VibeMood | null {
  if (!isVibeContext(playbackContext)) return null;
  const mood = playbackContext!.split(":")[2];
  return mood === "happy" || mood === "calm" || mood === "sad" ? mood : null;
}

// ---- signals ----------------------------------------------------------------

type ApiTrackInput = Parameters<typeof toClientTrack>[0];

async function loadSignals(): Promise<{ liked: Track[]; history: Track[] }> {
  const [liked, history] = await Promise.all([
    api.listLikedTracks(200).catch(() => ({ items: [] as { track?: unknown }[] })),
    api.getHistory(undefined, 200).catch(() => ({ items: [] as { track?: unknown }[] })),
  ]);
  const tracks = (items: { track?: unknown }[] | undefined) =>
    (items ?? []).flatMap((entry) => (entry.track ? [toClientTrack(entry.track as ApiTrackInput)] : []));
  return { liked: tracks(liked.items), history: tracks(history.items) };
}

/** what happened during the current vibe: plays that were skipped early */
const session = { played: new Map<string, Track>(), skipped: new Map<string, Track>() };
let lastTrack: { track: Track; context: string | null } | null = null;

usePlayerStore.subscribe((state, prev) => {
  if (state.currentTrack?.id === prev.currentTrack?.id) return;
  const before = lastTrack;
  lastTrack = state.currentTrack ? { track: state.currentTrack, context: state.playbackContext } : null;
  if (!before || !isVibeContext(before.context)) return;
  session.played.set(before.track.id, before.track);
  // left within 25 s (and not near the end): counts as "not for me"
  const duration = prev.durationMs || before.track.durationMs || 0;
  if (prev.positionMs < 25_000 && (duration === 0 || prev.positionMs < duration - 5000)) {
    session.skipped.set(before.track.id, before.track);
  }
});

// ---- mood pools ---------------------------------------------------------------

const MOOD_QUERIES: Record<VibeMood, string[]> = {
  happy: ["весёлые песни", "feel good hits", "happy songs"],
  calm: ["спокойная музыка", "chill vibes", "relaxing songs"],
  sad: ["грустные песни", "sad songs", "melancholic"],
};
const moodPools = new Map<VibeMood, Promise<Track[]>>();

function moodPool(mood: VibeMood): Promise<Track[]> {
  let pool = moodPools.get(mood);
  if (!pool) {
    pool = (async () => {
      const playlists = (
        await Promise.all(
          MOOD_QUERIES[mood].map((q) =>
            api
              .search(q, "playlist")
              .then((r) => r.items.filter((i) => i.type === "playlist").slice(0, 2))
              .catch(() => []),
          ),
        )
      ).flat();
      const lists = await Promise.all(
        playlists.slice(0, 6).map((p) =>
          api
            .getPlaylist(p.id)
            .then((d) => d.tracks.map((t) => toClientTrack(t)))
            .catch(() => [] as Track[]),
        ),
      );
      return lists.flat();
    })();
    pool.then((tracks) => tracks.length === 0 && moodPools.delete(mood)).catch(() => moodPools.delete(mood));
    moodPools.set(mood, pool);
  }
  return pool;
}

// ---- batches ------------------------------------------------------------------

interface Fallback {
  liked?: Track[];
  recent?: Track[];
  trending?: Track[];
}

async function radioFor(seed: Track, k = 25): Promise<Track[]> {
  return api
    .getRadio(seed.id, { k })
    .then((r) => (r.items || []).map((item) => toClientTrack(item)))
    .catch(() => []);
}

async function nextBatch(mood: VibeMood | null, exclude: Set<string>, fallback?: Fallback): Promise<Track[]> {
  const loaded = await loadSignals();
  const liked = loaded.liked.length ? loaded.liked : fallback?.liked ?? [];
  const history = loaded.history.length ? loaded.history : [...(fallback?.recent ?? [])];
  const likedIds = new Set(liked.map((t) => t.id));
  const taste: TasteProfile = buildTaste({
    liked,
    history,
    sessionLiked: [...session.played.values()].filter((t) => likedIds.has(t.id)),
    sessionSkipped: [...session.skipped.values()].filter((t) => !likedIds.has(t.id)),
  });
  // a listener with no history yet still gets a stream
  if (taste.seeds.length === 0) {
    for (const t of fallback?.trending ?? []) taste.seeds.push({ track: t, weight: 1 });
  }
  const avoid = new Set(recentSeeds());

  let seeds: Track[];
  let moodIds: Set<string> | undefined;
  let extra: Track[] = [];
  if (mood) {
    const pool = (await moodPool(mood)).filter((t) => !session.skipped.has(t.id));
    moodIds = new Set(pool.map((t) => t.id));
    // mood tracks by artists the listener likes make the best seeds
    const ranked = pool.map((track) => ({ track, weight: 0.25 + Math.max(0, affinity(taste, track)) * 4 }));
    seeds = pickWeighted(ranked, 3, avoid);
    // liked songs that are themselves in the mood keep it personal
    const likedInMood = taste.seeds.filter((s) => moodIds!.has(s.track.id)).map((s) => s.track);
    seeds.push(...pickWeighted(likedInMood.map((track) => ({ track, weight: 1 })), 1, avoid));
    extra = pool.filter((t) => affinity(taste, t) > 0);
    if (seeds.length === 0) seeds = pickWeighted(taste.seeds, 3, avoid);
  } else {
    seeds = pickWeighted(taste.seeds.slice(0, 250), 4, avoid);
  }
  if (seeds.length === 0) return [];
  rememberSeeds(seeds.map((s) => s.id));

  const candidates = [...(await Promise.all(seeds.map((s) => radioFor(s)))).flat(), ...extra];
  return selectFresh(candidates, taste, {
    count: BATCH,
    exclude: new Set([...exclude, ...session.played.keys()]),
    moodIds,
    familiarShare: mood ? 0.1 : 0.15,
  });
}

setRadioRefillProvider((context, queue) => {
  if (!isVibeContext(context)) return null;
  return nextBatch(vibeMoodOf(context), new Set(queue.map((t) => t.id)));
});

/** start (or restart) the vibe, optionally tuned to a mood */
export async function startVibe(mood: VibeMood | null, fallback?: Fallback): Promise<boolean> {
  session.played.clear();
  session.skipped.clear();
  const batch = await nextBatch(mood, new Set(), fallback);
  if (batch.length === 0) return false;
  vibeContext = `radio:vibe:${mood ?? "all"}:${Date.now().toString(36)}`;
  try {
    sessionStorage.setItem(VIBE_CONTEXT_KEY, vibeContext);
  } catch {}
  await playerEngine.playTrack(batch[0], batch, vibeContext, batch[0].coverUrl ?? null, 0);
  return true;
}
