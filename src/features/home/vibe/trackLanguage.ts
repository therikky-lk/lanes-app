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
// v2: Cyrillic that isn't Russian (Ukrainian, Belarusian, Kazakh…) has its own verdict
// v3: Ukrainian and English have verdicts of their own
const CACHE_KEY = "lane_track_language_v3";
const MAX_CACHE = 4000;
const CYRILLIC = /[Ѐ-ӿ]/g;
const LATIN = /[A-Za-z]/g;
// letters Russian doesn't have: Ukrainian і ї є ґ, Belarusian ў, Kazakh/Tatar
// ә ғ қ ң ө ұ ү һ, Serbian/Macedonian ђ ј љ њ ћ џ ѓ ќ ѕ
const NOT_RUSSIAN = /[іїєґўәғқңөұүһђјљњћџѓќѕІЇЄҐЎӘҒҚҢӨҰҮҺЂЈЉЊЋЏЃЌЅ]/g;
// letters that are Ukrainian's own (ї є ґ aren't in any other of these)
const UKRAINIAN_OWN = /[їєґЇЄҐ]/g;
// common English words: a Latin-script song made of them is sung in English
const ENGLISH_WORDS = new Set(
  "the you i me my and to a it in is that on your we be for all love it's i'm don't can know just like no but what so up oh baby yeah with this get go got never one when out time now make way say feel want gonna let down night see need back away been over".split(" "),
);
// letters only Russian (of these) has
const RUSSIAN_ONLY = /[ыэъёЫЭЪЁ]/g;

/** "other": sung in a language none of the filters stands for (Kazakh, Spanish…) */
type Verdict = VibeLanguage | "unknown" | "other";

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
  if (cyr / (cyr + lat) < 0.35) {
    const words = text.toLowerCase().match(/[a-z']+/g) ?? [];
    if (words.length < 6) return "unknown";
    const english = words.filter((w) => ENGLISH_WORDS.has(w)).length;
    return english / words.length >= 0.12 ? "english" : "other";
  }
  const notRussian = text.match(NOT_RUSSIAN)?.length ?? 0;
  const russianOnly = text.match(RUSSIAN_ONLY)?.length ?? 0;
  // a few stray letters (a name, a quote) don't make a Ukrainian song
  if (notRussian >= Math.max(2, Math.ceil(cyr * 0.01)) && notRussian > russianOnly * 0.5) {
    const own = text.match(UKRAINIAN_OWN)?.length ?? 0;
    const i = (text.match(/[іІ]/g)?.length ?? 0);
    // Ukrainian: і plus its own ї є ґ, and none of the Kazakh / Serbian letters
    const others = notRussian - own - i;
    return own > 0 && others <= notRussian * 0.1 ? "ukrainian" : "other";
  }
  return "russian";
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
): Promise<((t: Track, strict?: boolean) => boolean) & { known: (t: Track) => boolean }> {
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
  // strict (the default): only tracks whose language is actually known, from
  // their lyrics or their artist's other songs. Loose: when that leaves too
  // little, the script of the title / artist name decides the rest.
  // the "english" (US flag) filter means anything but Russian and Ukrainian:
  // English, Spanish, Kazakh… all count
  const fits = (v: Verdict) => v === language || (language === "english" && v === "other");
  const isKnown = (t: Track) => {
    const own = cache[t.id];
    return (!!own && own !== "unknown") || byArtist.has(artistKey(t));
  };
  const predicate = (t: Track, strict = true) => {
    const own = cache[t.id];
    if (own && own !== "unknown") return fits(own);
    if (language === "instrumental") return false; // only tracks marked as such
    const artist = byArtist.get(artistKey(t));
    if (artist) return fits(artist);
    if (strict) return false;
    // the name alone: Cyrillic says Russian / Ukrainian, Latin is taken as English
    const name = `${t.title} ${t.artists}`;
    const cyr = name.match(CYRILLIC)?.length ?? 0;
    if (cyr === 0) return language === "english";
    if (/[іїєґІЇЄҐ]/.test(name)) return language === "ukrainian";
    if (/[ўәғқңөұүһђјљњћџ]/i.test(name)) return language === "english";
    return language === "russian";
  };
  return Object.assign(predicate, { known: isKnown });
}
