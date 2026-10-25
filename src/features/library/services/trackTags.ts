// Tags for liked songs: genre (rap, pop, soul…) and pace (fast / slow), so the
// list can be narrowed down with one tap. YouTube doesn't say what genre a
// song is, Deezer does (per album) and also knows the tempo (BPM). Only the
// tags are kept on the device, looked up once per track, a few at a time.
import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { Track } from "@/shared/types";

export const TRACK_TAGS = ["fast", "slow", "rap", "pop", "rnb", "rock", "electronic", "jazz", "classical"] as const;
export type TrackTag = (typeof TRACK_TAGS)[number];

const DEEZER = "https://api.deezer.com";
const TAGS_KEY = "lane_track_tags_v1";
const GENRES_KEY = "lane_album_genres_v1";
const FAST_BPM = 122;
const SLOW_BPM = 92;

type Stored = Record<string, TrackTag[]>;

function read<T>(key: string, fallback: T): T {
  try {
    return (JSON.parse(localStorage.getItem(key) || "null") as T) ?? fallback;
  } catch {
    return fallback;
  }
}

let tags: Stored = read<Stored>(TAGS_KEY, {});
let albumGenres: Record<string, string[]> = read<Record<string, string[]>>(GENRES_KEY, {});
let version = 0;
const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;

let emitTimer: ReturnType<typeof setTimeout> | null = null;

function changed(): void {
  // a big list is tagged a track at a time: redraw at most about once a second
  if (!emitTimer) {
    emitTimer = setTimeout(() => {
      emitTimer = null;
      version += 1;
      listeners.forEach((l) => l());
    }, 900);
  }
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      localStorage.setItem(TAGS_KEY, JSON.stringify(tags));
      localStorage.setItem(GENRES_KEY, JSON.stringify(albumGenres));
    } catch {}
  }, 2000);
}

export function genreTags(genres: string[]): TrackTag[] {
  const out = new Set<TrackTag>();
  for (const raw of genres) {
    const g = raw.toLowerCase();
    if (/rap|hip.?hop|рэп|хип/.test(g)) out.add("rap");
    if (/r&b|rnb|soul|funk/.test(g)) out.add("rnb");
    if (/rock|metal|punk|alternative|indie|рок/.test(g)) out.add("rock");
    if (/electro|dance|house|techno|edm|trance|drum|dubstep|club/.test(g)) out.add("electronic");
    if (/jazz|blues/.test(g)) out.add("jazz");
    if (/classical|классик|opera|film|score/.test(g)) out.add("classical");
    if (/pop|поп|эстрад/.test(g)) out.add("pop");
  }
  return [...out];
}

export function paceTag(bpm: number | undefined): TrackTag | undefined {
  if (!bpm || bpm <= 0) return undefined;
  if (bpm >= FAST_BPM) return "fast";
  if (bpm <= SLOW_BPM) return "slow";
  return undefined;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function deezer<T>(path: string, signal: AbortSignal): Promise<T | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${DEEZER}${path}`, { signal });
      if (!res.ok) return null;
      const body = (await res.json()) as T & { error?: { code?: number } };
      // 4: too many requests, wait and try again
      if (body?.error?.code === 4) {
        await sleep(5000);
        continue;
      }
      return body?.error ? null : body;
    } catch {
      if (signal.aborted) return null;
      await sleep(800);
    }
  }
  return null;
}

const clean = (s: string) =>
  s
    .toLowerCase()
    .replace(/[([][^)\]]*[)\]]/g, " ")
    .replace(/\s+-\s+.*$/, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

interface DzTrack {
  id: number;
  title: string;
  bpm?: number;
  artist?: { name?: string };
  album?: { id?: number; genres?: { data?: { name: string }[] } };
}

async function classify(track: Track, signal: AbortSignal): Promise<TrackTag[] | null> {
  const artist = track.artistList?.[0]?.name || track.artists.split(",")[0] || "";
  const title = clean(track.title);
  if (!title) return [];
  const q = encodeURIComponent(`artist:"${artist}" track:"${title}"`);
  let found = await deezer<{ data?: DzTrack[] }>(`/search?q=${q}&limit=5`, signal);
  if (!found?.data?.length) found = await deezer<{ data?: DzTrack[] }>(`/search?q=${encodeURIComponent(`${artist} ${title}`)}&limit=5`, signal);
  if (signal.aborted) return null;
  const list = found?.data ?? [];
  const best =
    list.find((d) => clean(d.title) === title) ??
    list.find((d) => clean(d.title).includes(title) || title.includes(clean(d.title)));
  if (!best) return [];
  const full = await deezer<DzTrack>(`/track/${best.id}`, signal);
  if (signal.aborted) return null;
  const albumId = String(full?.album?.id ?? best.album?.id ?? "");
  let genres = albumId ? albumGenres[albumId] : undefined;
  if (!genres && albumId) {
    const album = await deezer<{ genres?: { data?: { name: string }[] } }>(`/album/${albumId}`, signal);
    if (signal.aborted) return null;
    genres = (album?.genres?.data ?? []).map((g) => g.name);
    albumGenres[albumId] = genres;
  }
  const out = genreTags(genres ?? []);
  const pace = paceTag(full?.bpm);
  if (pace) out.unshift(pace);
  return out;
}

let running: AbortController | null = null;

/** look up the tracks that have no tags yet, in the background */
function classifyAll(tracks: Track[]): () => void {
  running?.abort();
  const controller = new AbortController();
  running = controller;
  const todo = tracks.filter((t) => t.id && !t.id.startsWith("local:") && !(t.id in tags) && t.title);
  let next = 0;
  const worker = async () => {
    while (next < todo.length && !controller.signal.aborted) {
      const track = todo[next++];
      const result = await classify(track, controller.signal);
      if (controller.signal.aborted || result === null) return;
      tags[track.id] = result;
      changed();
      // Deezer allows ~50 requests per 5 s; 4 workers with a short pause stay under it
      await sleep(120);
    }
  };
  void Promise.all([worker(), worker(), worker(), worker()]).finally(() => {
    if (running === controller) running = null;
  });
  return () => controller.abort();
}

let warmed = "";
/**
 * Start tagging the liked songs right after launch, so the tags are ready by
 * the time the list is opened (not only while it's open).
 */
export function warmTrackTags(tracks: Track[]): void {
  const todo = tracks.filter((t) => t.id && !t.id.startsWith("local:") && !(t.id in tags));
  const key = `${tracks.length}:${todo.length}`;
  if (todo.length === 0 || warmed === key || running) return;
  warmed = key;
  classifyAll(tracks);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** tags of each track, filled in as they're looked up */
export function useTrackTags(tracks: Track[], enabled: boolean): { tagsOf: (id: string) => TrackTag[]; available: TrackTag[]; counts: Map<TrackTag, number> } {
  const v = useSyncExternalStore(subscribe, () => version, () => 0);
  useEffect(() => {
    if (!enabled || tracks.length === 0) return;
    // keeps going after the page is left: the tags are kept for next time
    classifyAll(tracks);
  }, [enabled, tracks]);
  return useMemo(() => {
    const counts = new Map<TrackTag, number>();
    for (const t of tracks) for (const tag of tags[t.id] ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    // a tag shows up once it covers a few songs
    const available = TRACK_TAGS.filter((tag) => (counts.get(tag) ?? 0) >= 3);
    return { tagsOf: (id: string) => tags[id] ?? [], available, counts };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks, v]);
}
