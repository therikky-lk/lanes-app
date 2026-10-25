import { playerEngine, setRadioRefillProvider } from "@/features/player/engine/playerEngine";
import { usePlayerStore } from "@/features/player/store/playerStore";
import { api, toClientTrack } from "@/shared/api";
import { loadListeningSignals } from "../hooks/listeningSignals";
import type { Track } from "@/shared/types/track";
import { languageFilter } from "./trackLanguage";
import {
  affinity,
  buildTaste,
  NO_VIBE_SETTINGS,
  pickWeighted,
  selectFresh,
  VIBE_CHARACTERS,
  VIBE_LANGUAGES,
  VIBE_MOODS,
  type TasteProfile,
  type VibeLanguage,
  type VibeMood,
  type VibeSettings,
} from "./vibeTaste";

// "My Vibe": an endless personal stream. Every batch is grown with the radio
// engine from a few seeds drawn from what the listener likes and plays (and
// likes / skips during the vibe), then filtered to music they haven't heard.
// With a mood picked, seeds and picks lean on tracks from mood playlists by
// artists the listener likes, and radio from those keeps the mood.

export type { VibeMood, VibeCharacter, VibeLanguage, VibeSettings } from "./vibeTaste";

const VIBE_CONTEXT_KEY = "lane_vibe_context";
const RECENT_SEEDS_KEY = "lane_vibe_recent_seeds";
const SETTINGS_KEY = "lane_vibe_settings";
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

function pick<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

function cleanSettings(raw: Partial<Record<keyof VibeSettings, unknown>> | null | undefined): VibeSettings {
  return {
    character: pick(raw?.character, VIBE_CHARACTERS),
    mood: pick(raw?.mood, VIBE_MOODS),
    language: pick(raw?.language, VIBE_LANGUAGES),
  };
}

export function storedSettings(): VibeSettings {
  try {
    return cleanSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null"));
  } catch {
    return NO_VIBE_SETTINGS;
  }
}

export function storeSettings(settings: VibeSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {}
}

export function sameSettings(a: VibeSettings, b: VibeSettings): boolean {
  return a.character === b.character && a.mood === b.mood && a.language === b.language;
}

export function isVibeContext(playbackContext: string | null | undefined): boolean {
  return !!vibeContext && playbackContext === vibeContext;
}

/** the settings a vibe context was started with: radio:vibe:<character>:<mood>:<language>:<id> */
export function vibeSettingsOf(playbackContext: string | null | undefined): VibeSettings | null {
  if (!isVibeContext(playbackContext)) return null;
  const [, , character, mood, language] = playbackContext!.split(":");
  return cleanSettings({ character, mood, language });
}

// ---- signals ----------------------------------------------------------------

type ApiTrackInput = Parameters<typeof toClientTrack>[0];

function loadSignals(): Promise<{ liked: Track[]; history: Track[] }> {
  return loadListeningSignals(300, 200);
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

type PoolKey = VibeMood | "instrumental" | "popular";

// with a language picked the mood is looked for in that language, so
// "energetic + Russian" starts from Russian energetic playlists
const MOOD_QUERIES_RU: Record<PoolKey, string[]> = {
  energetic: ["энергичная русская музыка", "русский рэп качает", "русские треки для тренировки"],
  happy: ["весёлые русские песни", "русские хиты для настроения", "позитивные русские треки"],
  instrumental: ["музыка без слов", "instrumental music", "lofi beats"],
  popular: ["русские хиты", "топ русских песен", "популярные русские треки"],
  calm: ["спокойная русская музыка", "русский чилл", "русские песни для души"],
  sad: ["грустные русские песни", "русский грустный рэп", "печальные русские треки"],
};
const MOOD_QUERIES_EN: Record<PoolKey, string[]> = {
  energetic: ["workout hits", "upbeat songs", "high energy rap"],
  happy: ["feel good hits", "happy songs", "good vibes playlist"],
  instrumental: ["instrumental music", "lofi beats", "piano instrumental"],
  popular: ["top hits", "trending songs", "global top 50"],
  calm: ["chill vibes", "relaxing songs", "acoustic chill"],
  sad: ["sad songs", "melancholic", "sad rap"],
};
const MOOD_QUERIES: Record<PoolKey, string[]> = {
  energetic: ["энергичная музыка", "workout hits", "upbeat songs"],
  happy: ["весёлые песни", "feel good hits", "happy songs"],
  instrumental: ["музыка без слов", "instrumental music", "lofi beats"],
  popular: ["хиты", "top hits", "trending songs"],
  calm: ["спокойная музыка", "chill vibes", "relaxing songs"],
  sad: ["грустные песни", "sad songs", "melancholic"],
};
const moodPools = new Map<string, Promise<Track[]>>();

function moodPool(mood: PoolKey, language: VibeLanguage | null = null): Promise<Track[]> {
  const key = `${mood}:${language ?? "-"}`;
  const queries = language === "russian" ? MOOD_QUERIES_RU : language === "foreign" ? MOOD_QUERIES_EN : MOOD_QUERIES;
  let pool = moodPools.get(key);
  if (!pool) {
    pool = (async () => {
      const playlists = (
        await Promise.all(
          queries[mood].map((q) =>
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
      // songs only: music videos come with frame thumbnails from i.ytimg.com
      return lists.flat().filter((t) => !/ytimg\.com/.test(t.coverUrl || ""));
    })();
    pool.then((tracks) => tracks.length === 0 && moodPools.delete(key)).catch(() => moodPools.delete(key));
    moodPools.set(key, pool);
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

async function nextBatch(settings: VibeSettings, exclude: Set<string>, fallback?: Fallback): Promise<Track[]> {
  const { mood, character, language } = settings;
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

  // pools of tracks that carry the mood / "no words" / popularity
  const [moodTracks, instrumentalTracks, popularTracks] = await Promise.all([
    mood ? moodPool(mood, language) : Promise.resolve([] as Track[]),
    language === "instrumental" ? moodPool("instrumental") : Promise.resolve([] as Track[]),
    character === "popular" ? moodPool("popular", language) : Promise.resolve([] as Track[]),
  ]);
  const fits = (t: Track) => !session.skipped.has(t.id);

  // the pool that defines the stream, if any: mood first, then the others
  // (for "no vocals" the instrumental search only seeds the radio: every pick
  // still has to be marked instrumental, see the language filter below)
  const pool = (mood ? moodTracks : language === "instrumental" ? instrumentalTracks : character === "popular" ? popularTracks : []).filter(fits);
  const poolIds = pool.length ? new Set(pool.map((t) => t.id)) : undefined;

  let seeds: Track[];
  let extra: Track[] = [];
  const tasteSeeds = taste.seeds.filter((s) => fits(s.track));
  if (pool.length) {
    // pool tracks by artists the listener likes make the best seeds
    const ranked = pool.map((track) => ({ track, weight: 0.25 + Math.max(0, affinity(taste, track)) * 4 }));
    seeds = pickWeighted(ranked, 3, avoid);
    const likedInPool = tasteSeeds.filter((s) => poolIds!.has(s.track.id)).map((s) => s.track);
    seeds.push(...pickWeighted(likedInPool.map((track) => ({ track, weight: 1 })), 1, avoid));
    extra = character === "unfamiliar" ? pool.filter((t) => affinity(taste, t) <= 0) : pool.filter((t) => affinity(taste, t) > 0);
    if (character === "popular") extra.push(...popularTracks.filter(fits).slice(0, 30));
    if (seeds.length === 0) seeds = pickWeighted(tasteSeeds.length ? tasteSeeds : taste.seeds, 3, avoid);
  } else {
    seeds = pickWeighted((tasteSeeds.length ? tasteSeeds : taste.seeds).slice(0, 250), 4, avoid);
  }
  if (seeds.length === 0) return [];
  // a language filter drops many candidates: start from more seeds
  if (language && seeds.length < 6) {
    seeds.push(...pickWeighted((pool.length ? pool : taste.seeds.map((s) => s.track)).map((track) => ({ track, weight: 1 })), 6 - seeds.length, new Set([...avoid, ...seeds.map((s) => s.id)])));
  }
  rememberSeeds(seeds.map((s) => s.id));

  let candidates = [...(await Promise.all(seeds.map((s) => radioFor(s)))).flat(), ...extra];
  // "favorite": the listener's own liked songs make up a good part of it
  if (character === "favorite") candidates.push(...liked.filter(fits).sort(() => Math.random() - 0.5).slice(0, 30));
  // "unfamiliar": artists the listener already knows are left out
  if (character === "unfamiliar") candidates = candidates.filter((t) => affinity(taste, t) <= 0);
  let filtered = candidates.filter(fits);
  if (language) {
    // the language is decided by the lyrics (LRCLIB), not by the name
    const speaks = await languageFilter(filtered, language, liked);
    let inLanguage = filtered.filter((t) => speaks(t));
    const taken = new Set([...exclude, ...session.played.keys()]);
    const fresh = () => inLanguage.filter((t) => !taken.has(t.id)).length;
    if (fresh() < 12) {
      // the mood's radio mostly went elsewhere: grow more from songs that are
      // known to be in this language (the listener's own first, then the pool)
      const sample = [...liked, ...pool].sort(() => Math.random() - 0.5).slice(0, 160);
      const sampleSpeaks = await languageFilter(sample, language, liked, 4000);
      const langSeeds = pickWeighted(
        sample.filter((t) => sampleSpeaks(t)).map((track) => ({ track, weight: poolIds?.has(track.id) ? 2 : 1 })),
        4,
        new Set([...avoid, ...seeds.map((s) => s.id)]),
      );
      if (langSeeds.length) {
        const more = (await Promise.all(langSeeds.map((s) => radioFor(s)))).flat().filter(fits);
        const moreSpeaks = await languageFilter(more, language, liked, 5000);
        const seen = new Set(inLanguage.map((t) => t.id));
        for (const t of [...langSeeds, ...more]) {
          if (!seen.has(t.id) && moreSpeaks(t)) {
            seen.add(t.id);
            inLanguage.push(t);
          }
        }
      }
    }
    if (fresh() < 8) {
      // still too little: let the title / artist name decide the unknown ones
      const seen = new Set(inLanguage.map((t) => t.id));
      inLanguage = [...inLanguage, ...filtered.filter((t) => !seen.has(t.id) && speaks(t, false))];
    }
    return selectFresh(inLanguage, taste, {
      count: BATCH,
      exclude: taken,
      moodIds: poolIds,
      familiarShare: character === "favorite" ? 0.6 : 0.2,
    });
  }
  return selectFresh(filtered.length >= 8 ? filtered : candidates, taste, {
    count: BATCH,
    exclude: new Set([...exclude, ...session.played.keys()]),
    moodIds: poolIds,
    familiarShare: character === "favorite" ? 0.6 : character === "unfamiliar" ? 0 : mood ? 0.1 : 0.15,
  });
}

setRadioRefillProvider((context, queue) => {
  if (!isVibeContext(context)) return null;
  return nextBatch(vibeSettingsOf(context) ?? NO_VIBE_SETTINGS, new Set(queue.map((t) => t.id)));
});

/** start (or restart) the vibe with the given settings */
export async function startVibe(settings: VibeSettings, fallback?: Fallback): Promise<boolean> {
  session.played.clear();
  session.skipped.clear();
  const batch = await nextBatch(settings, new Set(), fallback);
  if (batch.length === 0) return false;
  const { character, mood, language } = settings;
  vibeContext = `radio:vibe:${character ?? "-"}:${mood ?? "-"}:${language ?? "-"}:${Date.now().toString(36)}`;
  try {
    sessionStorage.setItem(VIBE_CONTEXT_KEY, vibeContext);
  } catch {}
  await playerEngine.playTrack(batch[0], batch, vibeContext, batch[0].coverUrl ?? null, 0);
  return true;
}
