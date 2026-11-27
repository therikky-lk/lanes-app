// Client-side lyrics sources used when the Liner server finds nothing (or is unreachable).
// 1. LRCLIB  - free, large crowd-sourced base of line-synced LRC (and plain) lyrics
// 2. YouTube Music - plain lyrics shown on the "Lyrics" tab of a track
import type { LyricsCandidate, LyricsStreamEvent } from "@/shared/contracts/lyrics";
import { postInnertube } from "@/shared/media/innertube/innertubeClient";
import { isBrowserRuntime } from "@/shared/platform/browser";
import { cleanTrackTitle } from "@/shared/utils/trackTitle";
import { hasSuspiciousLrcTiming } from "./lrcTiming";

export interface FallbackLyricsHint {
  title: string;
  artist: string;
  durationMs?: number;
}

export interface LrclibRecord {
  id: number;
  trackName: string;
  artistName: string;
  albumName?: string;
  duration?: number;
  instrumental?: boolean;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
}

export const LRCLIB_BASE = "https://lrclib.net/api";
const LRCLIB_HEADERS = { "Lrclib-Client": "Lane (https://github.com/therikky-lk)" };
let lrclibRetryAt = 0;
const lyricResponses = new Map<string, { data: unknown; expiresAt: number }>();

export function normalizeLyricsHint(hint: FallbackLyricsHint): FallbackLyricsHint {
  const artist = hint.artist.replace(/\s*-\s*Topic$/i, "").trim();
  const title = cleanTrackTitle(hint.title.trim(), artist)
    .replace(/\s*[([]\s*(?:feat|ft|prod)\.?\s+[^)\]]+[)\]]\s*$/i, "")
    .trim();
  return { ...hint, title, artist };
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
  const artistScore = scoreArtist(rec, hint);
  let durationScore = 0.5;
  if (hint.durationMs && rec.duration) {
    const diff = Math.abs(rec.duration - hint.durationMs / 1000);
    durationScore = diff <= 2 ? 1 : diff <= 5 ? 0.8 : diff <= 10 ? 0.4 : 0;
  }
  return titleScore * 0.5 + artistScore * 0.3 + durationScore * 0.2;
}

function scoreArtist(rec: LrclibRecord, hint: FallbackLyricsHint): number {
  return Math.max(
    tokenOverlap(rec.artistName, hint.artist),
    tokenOverlap(primaryArtist(rec.artistName), primaryArtist(hint.artist)),
  );
}

function hasUsableSync(rec: LrclibRecord, hint: FallbackLyricsHint): boolean {
  if (!rec.syncedLyrics?.trim()) return false;
  return !hint.durationMs || !rec.duration || Math.abs(rec.duration - hint.durationMs / 1000) <= 8;
}

export async function fetchLrclibJson<T>(url: string, signal?: AbortSignal): Promise<T | null> {
  signal?.throwIfAborted();
  const cached = lyricResponses.get(url);
  if (cached && cached.expiresAt > Date.now()) return cached.data as T | null;
  if (Date.now() < lrclibRetryAt) return null;
  try {
    const timeout = AbortSignal.timeout(8_000);
    const res = await fetch(url, { headers: LRCLIB_HEADERS, signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
    if (res.status === 429 || res.status >= 500) {
      const now = Date.now();
      const header = res.headers.get("Retry-After");
      const retryAt = header === null ? NaN : /^\d+$/.test(header)
        ? now + Number(header) * 1000
        : Date.parse(header);
      lrclibRetryAt = Math.max(lrclibRetryAt, now + 60_000, Number.isFinite(retryAt) ? retryAt : 0);
      return null;
    }
    if (!res.ok && res.status !== 404) return null;
    const data = res.status === 404 ? null : await res.json();
    if (lyricResponses.size >= 200) lyricResponses.clear();
    lyricResponses.set(url, { data, expiresAt: Date.now() + 5 * 60_000 });
    return data as T | null;
  } catch (err) {
    if (signal?.aborted) throw err;
    lrclibRetryAt = Math.max(lrclibRetryAt, Date.now() + 60_000);
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

  const matches = (r: LrclibRecord | null): r is LrclibRecord =>
    !!r && typeof r.trackName === "string" && typeof r.artistName === "string" &&
    !r.instrumental && !!(hasUsableSync(r, hint) || r.plainLyrics?.trim()) &&
    tokenOverlap(r.trackName, title) >= (artist ? 0.66 : 1) &&
    (artist ? scoreArtist(r, hint) >= 0.5 : Boolean(hint.durationMs && r.duration &&
      Math.abs(r.duration - hint.durationMs / 1000) <= 2));

  type Match = { rec: LrclibRecord; score: number; plausibleSync: boolean };
  let best: Match | null = null;
  function consider(rec: LrclibRecord, previous: Match | null): Match {
    const synced = hasUsableSync(rec, hint);
    const plausibleSync = synced && !hasSuspiciousLrcTiming(rec.syncedLyrics!, hint.durationMs ?? (rec.duration ?? 0) * 1_000);
    const score = scoreLrclibRecord(rec, hint) + (synced ? 0.15 : 0) + (plausibleSync ? 0.1 : 0);
    return !previous || score > previous.score ? { rec, score, plausibleSync } : previous;
  }

  // exact lookup first (fast, uses duration to pick the right version)
  if (artist) {
    const params = new URLSearchParams({ track_name: title, artist_name: primaryArtist(artist) });
    if (hint.durationMs && hint.durationMs > 0) params.set("duration", String(Math.round(hint.durationMs / 1000)));
    const exact = await fetchLrclibJson<LrclibRecord>(`${LRCLIB_BASE}/get?${params}`, signal);
    if (matches(exact)) {
      best = consider(exact, best);
      if (best.plausibleSync) return exact;
    }
  }

  // fuzzy search, then pick the best scoring hit
  const queries = [
    new URLSearchParams({ track_name: title, ...(artist ? { artist_name: primaryArtist(artist) } : {}) }),
    new URLSearchParams({ q: `${primaryArtist(artist)} ${title}`.trim() }),
  ];
  for (const q of queries) {
    const list = await fetchLrclibJson<LrclibRecord[]>(`${LRCLIB_BASE}/search?${q}`, signal);
    for (const rec of Array.isArray(list) ? list : []) {
      if (!matches(rec)) continue;
      best = consider(rec, best);
    }
    if (best?.plausibleSync && best.score >= 0.9) break;
  }
  return best?.rec ?? null;
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
    const timeout = AbortSignal.timeout(8_000);
    const options = { signal: signal ? AbortSignal.any([signal, timeout]) : timeout };
    const next = await postInnertube("next", { videoId, isAudioOnly: true }, options);
    const browseId = findFirst(
      next,
      (k, v) => k === "browseId" && typeof v === "string" && v.startsWith("MPLY"),
    ) as string | undefined;
    if (!browseId) return null;
    const page = await postInnertube("browse", { browseId }, options);
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
  const wordSynced = synced && /<\d+:\d{2}(?:[.:]\d+)?>[^\S\r\n]*[^<\s]/.test(content);
  const total = Math.round((wordSynced ? 70 : synced ? 60 : 35) + score * 20);
  return {
    provider,
    lyrics: { format, content },
    matchedTrack: matched,
    syncHint: wordSynced ? "word_synced" : synced ? "line_synced" : "plain",
    contentKind: wordSynced ? "word_synced" : synced ? "line_synced" : "plain",
    syncLevel: wordSynced ? "word_level" : synced ? "line_level" : "plain",
    quality: {
      total,
      match: Math.round(score * 100),
      content: 100,
      sync: wordSynced ? 90 : synced ? 60 : 0,
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
    let rec = await findLrclibLyrics(hint, signal);
    // Only reinterpret "artist - title" after trying the supplied metadata:
    // a dash can also be part of the real song title.
    if (!rec) {
      const upload = /^(.+?)\s+[–—-]\s+(.+)$/.exec(hint.title);
      if (upload) {
        hint = { ...hint, title: upload[2], artist: upload[1] };
        rec = await findLrclibLyrics(hint, signal);
      }
    }
    if (rec) {
      const score = scoreLrclibRecord(rec, hint);
      const matched = {
        title: rec.trackName,
        artists: [rec.artistName],
        durationMs: rec.duration ? Math.round(rec.duration * 1000) : undefined,
      };
      const synced = hasUsableSync(rec, hint);
      const content = synced ? rec.syncedLyrics : rec.plainLyrics;
      if (content?.trim()) {
        const c = makeCandidate("LRCLIB", synced ? "lrc" : "plain", content, score, matched);
        found = c;
        yield { type: "provider", provider: c.provider, status: "found", syncLevel: c.syncLevel, candidate: c };
      }
    }
  }

  {
    const videoId = trackId.replace(/^yt:/, "");
    if (/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
      const text = await findYoutubeMusicLyrics(videoId, signal);
      if (text) {
        const c = makeCandidate("YouTube Music", "plain", text, 0.9);
        if (!found || c.quality.total > found.quality.total) found = c;
        yield { type: "provider", provider: c.provider, status: "found", syncLevel: c.syncLevel, candidate: c };
      }
    }
  }

  yield found
    ? { type: "done", cached: false, best: { provider: found.provider, quality: found.quality.total, syncLevel: found.syncLevel } }
    : { type: "done", cached: false, status: "not_found" };
}
