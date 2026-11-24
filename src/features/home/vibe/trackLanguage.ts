// What a track is sung in, for My Vibe's language filter.
//
// The title says little (Toxi$, Big Baby Tape sing in Russian under Latin
// names), so the lyrics decide: LRCLIB is asked for the track, and the script
// and word patterns in its lyrics give the language; LRCLIB's own
// "instrumental" mark means no vocals. Only the verdict is kept (cached per
// track and summed up per artist), never the lyrics. Tracks LRCLIB doesn't know
// fall back to their artist's verdict, then to the title / artist script.
import type { Track } from "@/shared/types/track";
import { franc } from "franc";
import { fetchLrclibJson, LRCLIB_BASE, normalizeForMatch, primaryArtist, scoreLrclibRecord, type LrclibRecord } from "@/shared/media/lyrics/fallbackLyrics";
import type { VibeLanguage } from "./vibeTaste";
import { OTHER_VIBE_LANGUAGE_KEYS, OTHER_VIBE_LANGUAGES, VIBE_REGIONS, VIBE_REGION_LANGUAGES } from "./vibeLanguages";

const CACHE_KEY = "lane_track_language_v5";
const MAX_CACHE = 4000;
const CYRILLIC = /[Ѐ-ӿ]/g;
const ESTONIAN_WORDS = new Set("mina sina mulle sulle minu sinu olen oled ainult palju alati jälle ikka meie teie nende pole täna õhtu õhtul laulan laulud laulame laulu tuleb läheb sind mind juures tahan valgus tagasi kõrval kuid olla mõtlen öö".split(" "));

/** "other": sung in a language none of the filters stands for (Kazakh, Spanish…) */
type Verdict = VibeLanguage | "unknown" | "other";
const languageByModel = new Map<string, VibeLanguage>([["rus", "russian"], ["eng", "english"]]);
for (const key of OTHER_VIBE_LANGUAGE_KEYS) languageByModel.set(OTHER_VIBE_LANGUAGES[key][2], key);
for (const region of VIBE_REGIONS) {
  for (const [model] of Object.values(VIBE_REGION_LANGUAGES[region])) languageByModel.set(model, region);
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

/** Classify the lyrics rather than treating every Latin script as English. */
export function scriptVerdict(text: string, minLetters = 20): Verdict {
  const lyrics = text.replace(/\[[^\]\n]*\]/g, " ").trim().normalize("NFC");
  const letters = lyrics.match(/\p{L}/gu)?.length ?? 0;
  if (letters < minLetters) return "unknown";
  if ((lyrics.match(CYRILLIC)?.length ?? 0) >= letters * 0.6) {
    // Distinctive letters help disambiguate short, closely related lyrics.
    if ((lyrics.match(/[әғқңөұүһ]/gi)?.length ?? 0) >= 2) return "kk";
    if ((lyrics.match(/ў/gi)?.length ?? 0) >= 2) return "be";
    if (/[їєґ]/i.test(lyrics) && (lyrics.match(/[іїєґ]/gi)?.length ?? 0) >= 2) return "ukrainian";
  }
  // Franc lacks an Estonian model; require multiple distinct lexical clues.
  const words = new Set(lyrics.toLowerCase().match(/\p{L}+/gu) ?? []);
  const estonianHits = [...words].filter(word => ESTONIAN_WORDS.has(word)).length;
  if (estonianHits >= 4 || (estonianHits >= 2 && /õ/i.test(lyrics))) return "et";
  const model = franc(lyrics);
  return model === "und" ? "unknown" : languageByModel.get(model) ?? "other";
}

async function lookup(track: Track, signal: AbortSignal): Promise<Verdict> {
  const hint = { title: track.title, artist: track.artists, durationMs: track.durationMs };
  const params = new URLSearchParams({ track_name: track.title, artist_name: primaryArtist(track.artists) });
  if (track.durationMs > 0) params.set("duration", String(Math.round(track.durationMs / 1000)));
  let rec = await fetchLrclibJson<LrclibRecord>(`${LRCLIB_BASE}/get?${params}`, signal);
  if (!rec || scoreLrclibRecord(rec, hint) < 0.6) {
    const q = new URLSearchParams(params);
    q.delete("duration");
    const list = await fetchLrclibJson<LrclibRecord[]>(`${LRCLIB_BASE}/search?${q}`, signal);
    rec = (Array.isArray(list) ? list : [])
      .map((r) => ({ r, s: scoreLrclibRecord(r, hint) }))
      .filter((x) => x.s >= 0.6)
      .sort((a, b) => b.s - a.s)[0]?.r ?? null;
  }
  if (!rec) return "unknown";
  if (rec.instrumental) return "instrumental";
  return scriptVerdict((rec.plainLyrics?.trim() || rec.syncedLyrics || "").slice(0, 4000));
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
  const todo = [...new Map(tracks.filter(t => (!cache[t.id] || cache[t.id] === "unknown") && !t.id.startsWith("local:")).map(t => [t.id, t])).values()];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), budgetMs);
  let next = 0;
  const worker = async () => {
    while (next < todo.length && !controller.signal.aborted) {
      const t = todo[next++];
      const v = await lookup(t, controller.signal).catch(() => "unknown" as const);
      // A temporary rate limit or timeout must not become a permanent verdict.
      if (!controller.signal.aborted && v !== "unknown") remember(t.id, v);
    }
  };
  // Native HTTP implementations may ignore AbortSignal. Release the caller
  // at the shared deadline even if an individual lyrics request never settles.
  await Promise.race([
    Promise.all(Array.from({ length: budgetMs > 0 ? 2 : 0 }, worker)),
    new Promise<void>(resolve => controller.signal.addEventListener("abort", () => resolve(), { once: true })),
  ]);
  controller.abort();
  clearTimeout(timer);

  const byArtist = artistVerdicts([...known, ...tracks]);
  // strict (the default): only tracks whose language is actually known, from
  // their lyrics or their artist's other songs. Loose: when that leaves too
  // little, the script of the title / artist name decides the rest.
  const fits = (v: Verdict) => v === language;
  const isKnown = (t: Track) => {
    const own = cache[t.id];
    return (!!own && own !== "unknown") || byArtist.has(artistKey(t));
  };
  const predicate = (t: Track, strict = true) => {
    const own = cache[t.id];
    if (own && own !== "unknown") return fits(own);
    if (language === "instrumental") {
      // Unknown lyrics needn't block a recording explicitly labelled as an
      // instrumental. Never override a known vocal recording or trust an
      // entire "instrumental" search result indiscriminately.
      return !strict && /\binstrumental\b|инструментал|без (?:слов|вокала)/i.test(t.title);
    }
    const artist = byArtist.get(artistKey(t));
    if (artist) return fits(artist);
    if (strict) return false;
    // A longer name can carry a language signal. For short names don't assume
    // Latin means English, or non-Russian Cyrillic means Russian.
    const name = `${t.title} ${t.artists}`;
    const fromName = scriptVerdict(name, 35);
    if (fromName !== "unknown") return fits(fromName);
    if (/[іїєґ]/i.test(name)) return language === "ukrainian";
    if (/[ўәғқңөұүһђјљњћџѓќѕ]/i.test(name)) return false;
    return language === "russian" && !!name.match(CYRILLIC)?.length;
  };
  return Object.assign(predicate, { known: isKnown });
}
