// "Trending": the top 50 songs right now, for Russia or the whole world, from
// YouTube Music's weekly chart playlists ("Top 100 Songs Russia / Global").
//
// Movement in the ranking is worked out here: each region's list is kept from
// one day to the next, and a song's place is compared with its place in the
// previous day's list (up, down, same, or new in the chart).
import { api, toClientTrack } from "@/shared/api";
import { isVideoTrack } from "@/shared/media/isVideoTrack";
import type { Track } from "@/shared/types/track";

export type ChartRegion = "russia" | "world";
export type Movement = "same" | "up" | "down" | "new";

export interface ChartEntry {
  rank: number;
  track: Track;
  movement: Movement;
  /** places moved (positive: up) */
  delta: number;
}

const SIZE = 50;
const TTL = 60 * 60 * 1000;
const SNAPSHOT_KEY = (region: ChartRegion) => `lane_chart_snapshots_${region}_v1`;

const QUERIES: Record<ChartRegion, { queries: string[]; match: RegExp }> = {
  russia: { queries: ["Top 100 Songs Russia", "Топ 100 песен Россия"], match: /russia|росси/i },
  world: { queries: ["Top 100 Songs Global"], match: /global|world|мир/i },
};

interface Snapshots {
  /** the latest list, and the one from the day before it */
  current?: { day: string; ids: string[] };
  previous?: { day: string; ids: string[] };
}

const today = () => new Date().toLocaleDateString("en-CA");

function readSnapshots(region: ChartRegion): Snapshots {
  try {
    return JSON.parse(localStorage.getItem(SNAPSHOT_KEY(region)) || "{}") as Snapshots;
  } catch {
    return {};
  }
}

function writeSnapshots(region: ChartRegion, s: Snapshots): void {
  try {
    localStorage.setItem(SNAPSHOT_KEY(region), JSON.stringify(s));
  } catch {}
}

/** compare with the previous day's list; store today's */
export function withMovement(region: ChartRegion, tracks: Track[], day = today()): ChartEntry[] {
  const snaps = readSnapshots(region);
  const ids = tracks.map((t) => t.id);
  if (!snaps.current || snaps.current.day !== day) {
    // a new day: yesterday's list becomes the one to compare with
    if (snaps.current) snaps.previous = snaps.current;
    snaps.current = { day, ids };
  } else {
    snaps.current.ids = ids;
  }
  writeSnapshots(region, snaps);

  const before = snaps.previous ? new Map(snaps.previous.ids.map((id, i) => [id, i + 1])) : null;
  return tracks.map((track, i) => {
    const rank = i + 1;
    const was = before?.get(track.id);
    if (!before) return { rank, track, movement: "same", delta: 0 };
    if (was === undefined) return { rank, track, movement: "new", delta: 0 };
    const delta = was - rank;
    return { rank, track, movement: delta > 0 ? "up" : delta < 0 ? "down" : "same", delta };
  });
}

async function findChartPlaylist(region: ChartRegion): Promise<string | null> {
  const { queries, match } = QUERIES[region];
  let fallback: string | null = null;
  for (const q of queries) {
    const res = await api.search(q, "playlist").catch(() => ({ items: [] }));
    for (const item of res.items) {
      if (item.type !== "playlist") continue;
      if (/top\s*100|топ\s*100/i.test(item.title) && match.test(item.title)) return item.id;
      fallback = fallback ?? item.id;
    }
  }
  return fallback;
}

const cache = new Map<ChartRegion, { at: number; entries: ChartEntry[] }>();
const inflight = new Map<ChartRegion, Promise<ChartEntry[]>>();

export function loadChart(region: ChartRegion): Promise<ChartEntry[]> {
  const hit = cache.get(region);
  if (hit && Date.now() - hit.at < TTL) return Promise.resolve(hit.entries);
  let run = inflight.get(region);
  if (!run) {
    run = (async () => {
      const id = await findChartPlaylist(region);
      if (!id) throw new Error("chart not found");
      const playlist = await api.getPlaylist(id);
      const tracks = playlist.tracks.map((t) => toClientTrack(t)).filter((t) => !isVideoTrack(t)).slice(0, SIZE);
      if (tracks.length === 0) throw new Error("chart is empty");
      const entries = withMovement(region, tracks);
      cache.set(region, { at: Date.now(), entries });
      return entries;
    })().finally(() => inflight.delete(region));
    inflight.set(region, run);
  }
  return run;
}
