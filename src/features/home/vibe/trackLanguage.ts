// What a track is sung in, for My Vibe's language filter.
//
// The title says little (Toxi$, Big Baby Tape sing in Russian under Latin
// names), so the lyrics decide: LRCLIB is asked for the track, and the script
// of its lyrics (Cyrillic vs Latin) gives the language; LRCLIB's own
// "instrumental" mark means no vocals. Only the verdict is kept (cached per
// track and summed up per artist), never the lyrics. Tracks LRCLIB doesn't know
// fall back to their artist's verdict, then to the title / artist script.
import type { Track } from "@/shared/types/track";
import { normalizeForMatch, primaryArtist, scoreLrclibRecord } from "@/shared/media/lyrics/fallbackLyrics";
import type { VibeLanguage } from "./vibeTaste";

const LRCLIB = "https://lrclib.net/api";
const HEADERS = { "Lrclib-Client": "Lane (https://github.com/therikky-lk)" };
const CACHE_KEY = "lane_track_language_v1";
const MAX_CACHE = 4000;
const CYRILLIC = /[Ѐ-ӿ]/g;
const LATIN = /[A-Za-z]/g;

type Verdict = VibeLanguage | "unknown";

interface Rec {
  trackName: string;
  artistName: string;
  duration?: number;
  instrumental?: boolean;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
}

let cache: Record<string, Verdict> = (() => {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}") as Record<string, Verdict>;
  } catch {
    return {};
  }
})();
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function remember(id: string, verdict: Verdict): void {
  cache[id] = verdict;
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const keys = Object.keys(cache);
    if (keys.length > MAX_CACHE) cache = Object.fromEntries(keys.slice(-MAX_CACHE).map((k) => [k, cache[k]]));
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch {}
  }, 1500);
}

const artistKey = (t: Pick<Track, "artists">) => normalizeForMatch(primaryArtist(t.artists || ""));

/** verdict from the script the lyrics are written in */
export function scriptVerdict(text: string, minLetters = 20): Verdict {
  const cyr = text.match(CYRILLIC)?.length ?? 0;
  const lat = text.match(LATIN)?.length ?? 0;
  if (cyr + lat < minLetters) return "unknown";
  return cyr / (cyr + lat) >= 0.35 ? "russian" : "foreign";
}

async function getJson<T>(url: string, signal: AbortSignal): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: HEADERS, signal });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

async function lookup(track: Track, signal: AbortSignal): Promise<Verdict> {
  const hint = { title: track.title, artist: track.artists, durationMs: track.durationMs };
  const params = new URLSearchParams({ track_name: track.title, artist_name: primaryArtist(track.artists) });
  if (track.durationMs > 0) params.set("duration", String(Math.round(track.durationMs / 1000)));
  let rec = await getJson<Rec>(`${LRCLIB}/get?${params}`, signal);
  if (!rec || scoreLrclibRecord(rec as never, hint) < 0.6) {
    const q = new URLSearchParams({ track_name: track.title, artist_name: primaryArtist(track.artists) });
    const list = (await getJson<Rec[]>(`${LRCLIB}/search?${q}`, signal)) ?? [];
    rec = list
      .map((r) => ({ r, s: scoreLrclibRecord(r as never, hint) }))
      .filter((x) => x.s >= 0.6)
      .sort((a, b) => b.s - a.s)[0]?.r ?? null;
  }
  if (!rec) return "unknown";
  if (rec.instrumental) return "instrumental";
  return scriptVerdict(`${rec.plainLyrics ?? ""}\n${rec.syncedLyrics ?? ""}`.slice(0, 4000));
}

/** artist -> what most of their known tracks are */
function artistVerdicts(tracks: Track[]): Map<string, Verdict> {
  const votes = new Map<string, Record<string, number>>();
  for (const t of tracks) {
    const v = cache[t.id];
    if (!v || v === "unknown") continue;
    const key = artistKey(t);
    const tally = votes.get(key) ?? {};
    tally[v] = (tally[v] ?? 0) + 1;
    votes.set(key, tally);
  }
  const out = new Map<string, Verdict>();
  for (const [key, tally] of votes) {
    const [best] = Object.entries(tally).sort((a, b) => b[1] - a[1]);
    // an artist with mostly instrumentals isn't "instrumental" for every song
    if (best && best[0] !== "instrumental") out.set(key, best[0] as Verdict);
  }
  return out;
}

/**
 * Classify the tracks (those not cached yet are looked up, a few at a time,
 * within `budgetMs`), then return a predicate for the wanted language.
 */
export async function languageFilter(
  tracks: Track[],
  language: VibeLanguage,
  known: Track[] = [],
  budgetMs = 7000,
): Promise<(t: Track) => boolean> {
  const todo = tracks.filter((t) => !(t.id in cache) && !t.id.startsWith("local:"));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), budgetMs);
  let next = 0;
  const worker = async () => {
    while (next < todo.length && !controller.signal.aborted) {
      const t = todo[next++];
      const v = await lookup(t, controller.signal);
      if (!controller.signal.aborted) remember(t.id, v);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  clearTimeout(timer);

  const byArtist = artistVerdicts([...known, ...tracks]);
  return (t: Track) => {
    const own = cache[t.id];
    if (own && own !== "unknown") return own === language;
    if (language === "instrumental") return false; // only tracks marked as such
    const artist = byArtist.get(artistKey(t));
    if (artist) return artist === language;
    // nothing better: the script of the title / artist name
    const v = scriptVerdict(`${t.title} ${t.artists}`, 3);
    return v === "unknown" ? language === "foreign" : v === language;
  };
}
