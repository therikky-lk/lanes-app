// Client-side lyrics sources used when the Liner server finds nothing (or is unreachable).
// 1. LRCLIB  - free, large crowd-sourced base of line-synced LRC (and plain) lyrics
// 2. YouTube Music - plain lyrics shown on the "Lyrics" tab of a track
import type { LyricsCandidate, LyricsStreamEvent } from "@/shared/contracts/lyrics";
import { postInnertube } from "@/shared/media/innertube/innertubeClient";
import { isBrowserRuntime } from "@/shared/platform/browser";

export interface FallbackLyricsHint {
  title: string;
  artist: string;
  durationMs?: number;
}

interface LrclibRecord {
  id: number;
  trackName: string;
  artistName: string;
  albumName?: string;
  duration?: number;
  instrumental?: boolean;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
}

const LRCLIB_BASE = "https://lrclib.net/api";
const LRCLIB_HEADERS = { "Lrclib-Client": "Lane (https://github.com/therikky-lk)" };
let lrclibRetryAt = 0;
const lyricResponses = new Map<string, { data: unknown; expiresAt: number }>();

export function normalizeLyricsHint(hint: FallbackLyricsHint): FallbackLyricsHint {
  const artist = hint.artist.replace(/\s*-\s*Topic$/i, "").trim();
  // Upload titles often carry the real artist while the author is an uploader.
  const parts = hint.title.split(/\s+[–—-]\s+/);
  return parts.length === 2 && parts.every((part) => part.trim())
    ? { ...hint, title: parts[1].trim(), artist: parts[0].trim() }
    : { ...hint, title: hint.title.trim(), artist };
}

export function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ё/g, "е")
    // drop "(feat. x)", "[Official Video]", "- Remastered 2011" style noise
    .replace(/[([][^)\]]*(feat|ft\.|prod|official|video|audio|lyric|remaster|version|edit|mix)[^)\]]*[)\]]/gi, " ")
    .replace(/\s-\s.*(remaster|version|edit|mix).*$/i, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** primary artist only: "A, B & C feat. D" -> "A" */
export function primaryArtist(artist: string): string {
  return artist.split(/\s*(?:,|&|\bfeat\.?|\bft\.?|\bx\b|;| и )\s*/i)[0]?.trim() || artist.trim();
}

function tokenOverlap(a: string, b: string): number {
  const ta = new Set(normalizeForMatch(a).split(" ").filter(Boolean));
  const tb = new Set(normalizeForMatch(b).split(" ").filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let common = 0;
  for (const t of ta) if (tb.has(t)) common++;
  return common / Math.max(ta.size, tb.size);
}

/** 0..1 score of how well a LRCLIB record matches the track we play */
export function scoreLrclibRecord(rec: LrclibRecord, hint: FallbackLyricsHint): number {
  const titleScore = tokenOverlap(rec.trackName, hint.title);
  const artistScore = Math.max(
    tokenOverlap(rec.artistName, hint.artist),
    tokenOverlap(rec.artistName, primaryArtist(hint.artist)),
    normalizeForMatch(hint.artist).includes(normalizeForMatch(primaryArtist(rec.artistName))) ? 1 : 0,
  );
  let durationScore = 0.5;
  if (hint.durationMs && rec.duration) {
    const diff = Math.abs(rec.duration - hint.durationMs / 1000);
    durationScore = diff <= 2 ? 1 : diff <= 5 ? 0.8 : diff <= 10 ? 0.4 : 0;
  }
  const syncBonus = rec.syncedLyrics ? 0.05 : 0;
  return titleScore * 0.5 + artistScore * 0.3 + durationScore * 0.2 + syncBonus;
}

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T | null> {
  signal?.throwIfAborted();
  const cached = lyricResponses.get(url);
  if (cached && cached.expiresAt > Date.now()) return cached.data as T | null;
  if (Date.now() < lrclibRetryAt) return null;
  try {
    const timeout = AbortSignal.timeout(8_000);
    const res = await fetch(url, { headers: LRCLIB_HEADERS, signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
    if (res.status === 429 || res.status >= 500) {
      lrclibRetryAt = Date.now() + 60_000;
      return null;
    }
    if (!res.ok && res.status !== 404) return null;
    const data = res.status === 404 ? null : await res.json();
    if (lyricResponses.size >= 200) lyricResponses.clear();
    lyricResponses.set(url, { data, expiresAt: Date.now() + 5 * 60_000 });
    return data as T | null;
  } catch (err) {
    if (signal?.aborted) throw err;
    lrclibRetryAt = Date.now() + 60_000;
    return null;
  }
}

export async function findLrclibLyrics(
  hint: FallbackLyricsHint,
  signal?: AbortSignal,
): Promise<LrclibRecord | null> {
  const title = hint.title.trim();
  const artist = hint.artist.trim();
  if (!title) return null;

  const usable = (r: LrclibRecord | null | undefined): r is LrclibRecord =>
    !!r && !r.instrumental && !!(r.syncedLyrics?.trim() || r.plainLyrics?.trim());

  // exact lookup first (fast, uses duration to pick the right version)
  if (artist) {
    const params = new URLSearchParams({ track_name: title, artist_name: primaryArtist(artist) });
    if (hint.durationMs && hint.durationMs > 0) params.set("duration", String(Math.round(hint.durationMs / 1000)));
    const exact = await fetchJson<LrclibRecord>(`${LRCLIB_BASE}/get?${params}`, signal);
    if (usable(exact) && scoreLrclibRecord(exact, hint) >= 0.6) return exact;
  }

  // fuzzy search, then pick the best scoring hit
  const queries = [
    new URLSearchParams({ track_name: title, ...(artist ? { artist_name: primaryArtist(artist) } : {}) }),
    new URLSearchParams({ q: `${primaryArtist(artist)} ${normalizeForMatch(title)}`.trim() }),
  ];
  let best: { rec: LrclibRecord; score: number } | null = null;
  for (const q of queries) {
    const list = await fetchJson<LrclibRecord[]>(`${LRCLIB_BASE}/search?${q}`, signal);
    for (const rec of Array.isArray(list) ? list : []) {
      if (!usable(rec)) continue;
      const score = scoreLrclibRecord(rec, hint);
      if (!best || score > best.score) best = { rec, score };
    }
    if (best && best.score >= 0.75 && best.rec.syncedLyrics) break;
  }
  return best && best.score >= 0.6 ? best.rec : null;
}

// --- YouTube Music lyrics tab -------------------------------------------------

function findFirst(node: unknown, predicate: (key: string, value: any) => boolean): any {
  const stack: unknown[] = [node];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object") continue;
    for (const [k, v] of Object.entries(cur as Record<string, unknown>)) {
      if (predicate(k, v)) return v;
      if (v && typeof v === "object") stack.push(v);
    }
  }
  return undefined;
}

export async function findYoutubeMusicLyrics(videoId: string, signal?: AbortSignal): Promise<string | null> {
  // Anonymous web playback has no YouTube Music session for the lyrics tab.
  if (isBrowserRuntime()) return null;
  try {
    const next = await postInnertube("next", { videoId, isAudioOnly: true }, { signal });
    const browseId = findFirst(
      next,
      (k, v) => k === "browseId" && typeof v === "string" && v.startsWith("MPLY"),
    ) as string | undefined;
    if (!browseId) return null;
    const page = await postInnertube("browse", { browseId }, { signal });
    const shelf = findFirst(page, (k) => k === "musicDescriptionShelfRenderer");
    const runs = shelf?.description?.runs as Array<{ text: string }> | undefined;
    const text = runs?.map((r) => r.text).join("").trim();
    return text || null;
  } catch (err) {
    if (signal?.aborted) throw err;
    return null;
  }
}

// --- candidates ---------------------------------------------------------------

function makeCandidate(
  provider: string,
  format: "lrc" | "plain",
  content: string,
  score: number,
  matched?: { title?: string; artists?: string[]; durationMs?: number },
): LyricsCandidate {
  const synced = format === "lrc";
  const total = Math.round((synced ? 60 : 35) + score * 20);
  return {
    provider,
    lyrics: { format, content },
    matchedTrack: matched,
    syncHint: synced ? "line_synced" : "plain",
    contentKind: synced ? "line_synced" : "plain",
    syncLevel: synced ? "line_level" : "plain",
    quality: {
      total,
      match: Math.round(score * 100),
      content: 100,
      sync: synced ? 60 : 0,
      source: 50,
      reasons: [`client fallback: ${provider}`],
    },
  };
}

/**
 * Yields provider events in the same shape the server stream uses, so the
 * player handles fallback lyrics exactly like server ones.
 */
export async function* streamFallbackLyrics(
  trackId: string,
  hint: FallbackLyricsHint | undefined,
  signal?: AbortSignal,
): AsyncGenerator<LyricsStreamEvent> {
  let found: LyricsCandidate | null = null;

  if (hint?.title?.trim()) {
    hint = normalizeLyricsHint(hint);
    const rec = await findLrclibLyrics(hint, signal);
    if (rec) {
      const score = scoreLrclibRecord(rec, hint);
      const matched = {
        title: rec.trackName,
        artists: [rec.artistName],
        durationMs: rec.duration ? Math.round(rec.duration * 1000) : undefined,
      };
      if (rec.syncedLyrics?.trim()) {
        const c = makeCandidate("LRCLIB", "lrc", rec.syncedLyrics, score, matched);
        found = c;
        yield { type: "provider", provider: c.provider, status: "found", syncLevel: c.syncLevel, candidate: c };
      }
      if (rec.plainLyrics?.trim() && !rec.syncedLyrics?.trim()) {
        const c = makeCandidate("LRCLIB", "plain", rec.plainLyrics, score, matched);
        found = c;
        yield { type: "provider", provider: c.provider, status: "found", syncLevel: c.syncLevel, candidate: c };
      }
    }
  }

  if (!found) {
    const videoId = trackId.replace(/^yt:/, "");
    if (/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
      const text = await findYoutubeMusicLyrics(videoId, signal);
      if (text) {
        const c = makeCandidate("YouTube Music", "plain", text, 0.9);
        found = c;
        yield { type: "provider", provider: c.provider, status: "found", syncLevel: c.syncLevel, candidate: c };
      }
    }
  }

  yield found
    ? { type: "done", cached: false, best: { provider: found.provider, quality: found.quality.total, syncLevel: found.syncLevel } }
    : { type: "done", cached: false, status: "not_found" };
}
