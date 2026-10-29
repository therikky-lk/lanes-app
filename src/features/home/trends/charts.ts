// "Trending": what people listen to most right now.
//
// The source is Apple Music's daily "most played songs" chart (a public feed,
// refreshed every day). YouTube Music's own chart for Russia stopped updating
// in 2022, so it can't be used, and VK / Yandex don't open their charts
// without an account. Russia is Apple's Russian chart; "world" is put
// together from the charts of several big countries (a song high in many of
// them ranks high).
//
// Each chart song is then found on YouTube Music to be playable. Matches are
// remembered on the device, so only songs new to the chart are searched, a
// few at a time, while the list is already on screen.
//
// Movement in the ranking: each region's list is kept from one day to the
// next and a song's place is compared with the previous day's.
import { toClientTrack } from "@/shared/api";
import { findCatalogMatch } from "@/shared/media/matching";
import type { Track } from "@/shared/types/track";

export type ChartRegion = "russia" | "world";
export type Movement = "same" | "up" | "down" | "new";

export interface ChartSong {
  /** Apple Music song id */
  id: string;
  title: string;
  artist: string;
  coverUrl: string;
}

export interface ChartEntry {
  rank: number;
  song: ChartSong;
  /** the YouTube Music track to play; missing until it's found */
  track?: Track;
  movement: Movement;
  /** places moved (positive: up) */
  delta: number;
}

const SIZE = 50;
const TTL = 60 * 60 * 1000;
// Apple moved the public RSS host to applemarketingtools.com. Keep the old
// host as a fallback because some regions/cache layers still serve it.
const FEED_HOSTS = ["https://rss.applemarketingtools.com", "https://rss.marketingtools.apple.com"];
const FEED = (host: string, country: string, size: number) =>
  `${host}/api/v2/${country}/music/most-played/${size}/songs.json`;
/** big music markets whose charts make up "world" */
export const WORLD_COUNTRIES = ["us", "gb", "de", "fr", "br", "mx", "jp", "kr", "es", "it"];
const SNAPSHOT_KEY = (region: ChartRegion) => `lane_chart_snapshots_${region}_v2`;
const MATCHES_KEY = "lane_chart_matches_v1";
const MAX_MATCHES = 800;
const RETRY_NOT_FOUND_MS = 24 * 60 * 60 * 1000;

interface Snapshots {
  current?: { day: string; ids: string[] };
  previous?: { day: string; ids: string[] };
}

const today = () => new Date().toLocaleDateString("en-CA");

function readJson<T>(key: string, fallback: T): T {
  try {
    return (JSON.parse(localStorage.getItem(key) || "null") as T) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

/** compare with the previous day's list; store today's */
export function withMovement(region: ChartRegion, songs: ChartSong[], day = today()): ChartEntry[] {
  const snaps = readJson<Snapshots>(SNAPSHOT_KEY(region), {});
  const ids = songs.map((s) => s.id);
  if (!snaps.current || snaps.current.day !== day) {
    // a new day: yesterday's list becomes the one to compare with
    if (snaps.current) snaps.previous = snaps.current;
    snaps.current = { day, ids };
  } else {
    snaps.current.ids = ids;
  }
  writeJson(SNAPSHOT_KEY(region), snaps);

  const before = snaps.previous ? new Map(snaps.previous.ids.map((id, i) => [id, i + 1])) : null;
  return songs.map((song, i) => {
    const rank = i + 1;
    const was = before?.get(song.id);
    if (!before) return { rank, song, movement: "same", delta: 0 };
    if (was === undefined) return { rank, song, movement: "new", delta: 0 };
    const delta = was - rank;
    return { rank, song, movement: delta > 0 ? "up" : delta < 0 ? "down" : "same", delta };
  });
}

interface FeedResult {
  id?: string;
  name?: string;
  artistName?: string;
  artworkUrl100?: string;
}

function songOf(r: FeedResult): ChartSong | null {
  if (!r.id || !r.name) return null;
  return {
    id: r.id,
    title: r.name,
    artist: r.artistName ?? "",
    // the feed gives 100×100 artwork; the same URL serves bigger sizes
    coverUrl: (r.artworkUrl100 ?? "").replace(/\/\d+x\d+bb\.(jpg|png|webp)$/, "/300x300bb.$1"),
  };
}

export async function fetchFeed(country: string, size: number, signal?: AbortSignal): Promise<ChartSong[]> {
  let lastError: unknown = new Error(`chart feed ${country} failed`);
  for (const host of FEED_HOSTS) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const res = await fetch(FEED(host, country, size), { signal, headers: { accept: "application/json" }, cache: "no-store" });
        if (!res.ok) throw new Error(`chart feed ${country} failed (${res.status})`);
        const data = (await res.json()) as { feed?: { results?: FeedResult[] } };
        const songs = (data.feed?.results ?? []).flatMap((r) => {
          const s = songOf(r);
          return s ? [s] : [];
        });
        if (songs.length > 0) return songs;
        throw new Error(`chart feed ${country} returned no songs`);
      } catch (error) {
        lastError = error;
        if (signal?.aborted) throw error;
        if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

const songKey = (s: ChartSong) => `${s.artist}|${s.title}`.toLowerCase().replace(/\s+/g, " ").trim();

/** several countries' charts → one: each place is worth points, summed up */
export function mergeCharts(charts: ChartSong[][], size = SIZE): ChartSong[] {
  const scores = new Map<string, { song: ChartSong; score: number; best: number }>();
  for (const chart of charts) {
    const n = chart.length;
    chart.forEach((song, i) => {
      const key = songKey(song);
      const entry = scores.get(key) ?? { song, score: 0, best: Infinity };
      entry.score += n - i;
      entry.best = Math.min(entry.best, i);
      scores.set(key, entry);
    });
  }
  return [...scores.values()]
    .sort((a, b) => b.score - a.score || a.best - b.best)
    .slice(0, size)
    .map((e) => e.song);
}

async function loadSongs(region: ChartRegion): Promise<ChartSong[]> {
  if (region === "russia") return (await fetchFeed("ru", SIZE)).slice(0, SIZE);
  const charts = await Promise.all(WORLD_COUNTRIES.map((c) => fetchFeed(c, 100).catch(() => [] as ChartSong[])));
  const merged = mergeCharts(charts.filter((c) => c.length > 0));
  if (merged.length === 0) throw new Error("no chart feeds");
  return merged;
}

// ---- finding chart songs on YouTube Music -------------------------------------

type StoredMatch = { track: Track | null; at: number };

let matches: Record<string, StoredMatch> | null = null;
function matchStore(): Record<string, StoredMatch> {
  if (!matches) matches = readJson<Record<string, StoredMatch>>(MATCHES_KEY, {});
  return matches;
}

function saveMatches(): void {
  const all = matchStore();
  const keys = Object.keys(all);
  if (keys.length > MAX_MATCHES) {
    keys.sort((a, b) => all[a].at - all[b].at).slice(0, keys.length - MAX_MATCHES).forEach((k) => delete all[k]);
  }
  writeJson(MATCHES_KEY, all);
}

/** a remembered match, if any (null: searched recently and not found) */
export function knownMatch(song: ChartSong): Track | null | undefined {
  const hit = matchStore()[song.id];
  if (!hit) return undefined;
  if (!hit.track && Date.now() - hit.at > RETRY_NOT_FOUND_MS) return undefined;
  return hit.track;
}

const resolving = new Map<string, Promise<Track | null>>();

/** find a chart song on YouTube Music (remembered afterwards) */
export function resolveSong(song: ChartSong, signal?: AbortSignal): Promise<Track | null> {
  const known = knownMatch(song);
  if (known !== undefined) return Promise.resolve(known);
  let run = resolving.get(song.id);
  if (!run) {
    run = (async () => {
      const outcome = await findCatalogMatch({ sourceId: song.id, title: song.title, artists: [song.artist] }, signal);
      // chart songs are the well-known versions: an unsure match is almost always right
      const found = outcome.status === "approved" ? outcome.track : outcome.proposedTrack;
      const track = found ? toClientTrack(found) : null;
      if (track && !track.coverUrl) track.coverUrl = song.coverUrl;
      matchStore()[song.id] = { track, at: Date.now() };
      saveMatches();
      return track;
    })().finally(() => resolving.delete(song.id));
    resolving.set(song.id, run);
  }
  return run;
}

// ---- loading ------------------------------------------------------------------

const cache = new Map<ChartRegion, { at: number; entries: ChartEntry[] }>();
const inflight = new Map<ChartRegion, Promise<ChartEntry[]>>();

/** the chart, with the YouTube tracks already known (the rest: resolveSong) */
export function loadChart(region: ChartRegion): Promise<ChartEntry[]> {
  const hit = cache.get(region);
  if (hit && Date.now() - hit.at < TTL) {
    return Promise.resolve(hit.entries.map((e) => ({ ...e, track: e.track ?? knownMatch(e.song) ?? undefined })));
  }
  let run = inflight.get(region);
  if (!run) {
    run = (async () => {
      let lastError: unknown = new Error("chart is empty");
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const songs = await loadSongs(region);
          if (songs.length === 0) throw new Error("chart is empty");
          const entries = withMovement(region, songs).map((e) => ({ ...e, track: knownMatch(e.song) ?? undefined }));
          cache.set(region, { at: Date.now(), entries });
          return entries;
        } catch (error) {
          lastError = error;
          if (attempt === 1) break;
          await new Promise((resolve) => window.setTimeout(resolve, 400));
        }
      }
      throw lastError;
    })().finally(() => inflight.delete(region));
    inflight.set(region, run);
  }
  return run;
}
