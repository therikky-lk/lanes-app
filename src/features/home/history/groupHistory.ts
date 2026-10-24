// History grouped the way people remember it: by day, and within a day by
// where the music came from. Plays in a row from the same playlist / album /
// radio become one entry ("5 songs played · Playlist"); a lone track is its
// own entry.
import type { Track } from "@/shared/types/track";

export type HistorySource = "playlist" | "album" | "liked" | "mix" | "vibe" | "radio" | "track";

export interface HistoryPlay {
  track: Track;
  listenedAt: string;
  context?: { type: string; id?: string };
  /** how long it actually played */
  playedMs?: number;
}

export interface HistoryGroup {
  key: string;
  source: HistorySource;
  /** playlist / album id (or the seed track for a radio) */
  id?: string;
  tracks: Track[];
  /** newest play in the group */
  at: number;
  /** oldest play in the group */
  from: number;
}

export interface HistoryDay {
  key: string;
  date: Date;
  groups: HistoryGroup[];
  /** plays this day (repeats count) and how long they played */
  plays: number;
  playedMs: number;
}

/** a lone track between two parts of one session is part of that session */
const SESSION_GAP_MS = 30 * 60 * 1000;

export function sourceOf(context: HistoryPlay["context"]): { source: HistorySource; id?: string } {
  const type = context?.type ?? "";
  const id = context?.id;
  if (type === "playlist" && id) {
    if (id === "likes" || id === "liked") return { source: "liked" };
    if (id.startsWith("lane-mix-") || id.startsWith("daily-mix") || id.startsWith("mix-")) return { source: "mix", id };
    return { source: "playlist", id };
  }
  if (type === "album" && id) return { source: "album", id };
  if (type === "radio") return id?.startsWith("vibe") ? { source: "vibe" } : { source: "radio", id };
  return { source: "track" };
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function sameSource(a: HistoryGroup, b: HistoryGroup): boolean {
  return a.source !== "track" && a.source === b.source && a.id === b.id;
}

function absorb(into: HistoryGroup, other: HistoryGroup): void {
  for (const t of other.tracks) if (!into.tracks.some((x) => x.id === t.id)) into.tracks.push(t);
  into.at = Math.max(into.at, other.at);
  into.from = Math.min(into.from, other.from);
}

/**
 * Plays from a playlist or My Vibe often come back from the server with a few
 * lone tracks in between (a play reported without its context, a track picked
 * by hand in the middle): "Playlist · Song · Playlist · Song …". A lone track
 * sitting between two parts of the same source, close in time, belongs to it.
 */
export function mergeSessions(groups: HistoryGroup[]): HistoryGroup[] {
  const out = [...groups];
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < out.length - 1; i++) {
      const a = out[i];
      if (a.source === "track") continue;
      // newer part, lone tracks…, older part of the same source
      let j = i + 1;
      while (j < out.length && out[j].source === "track") j++;
      if (j >= out.length) continue;
      const b = out[j];
      if (!sameSource(a, b)) continue;
      // the whole stretch must be one listening session
      let close = true;
      for (let k = i; k < j; k++) if (out[k].from - out[k + 1].at > SESSION_GAP_MS) close = false;
      if (!close) continue;
      for (let k = i + 1; k <= j; k++) absorb(a, out[k]);
      out.splice(i + 1, j - i);
      changed = true;
      break;
    }
  }
  return out;
}

export function groupHistory(plays: HistoryPlay[]): HistoryDay[] {
  const days: HistoryDay[] = [];
  for (const play of plays) {
    if (!play.track?.id) continue;
    const at = new Date(play.listenedAt);
    if (Number.isNaN(at.getTime())) continue;
    const key = dayKey(at);
    let day = days[days.length - 1];
    if (!day || day.key !== key) {
      day = { key, date: new Date(at.getFullYear(), at.getMonth(), at.getDate()), groups: [], plays: 0, playedMs: 0 };
      days.push(day);
    }
    day.plays += 1;
    day.playedMs += Math.max(0, play.playedMs ?? 0);
    const { source, id } = sourceOf(play.context);
    const last = day.groups[day.groups.length - 1];
    const time = at.getTime();
    // consecutive plays from the same place merge; single tracks never do
    if (last && source !== "track" && last.source === source && last.id === id) {
      if (!last.tracks.some((t) => t.id === play.track.id)) last.tracks.push(play.track);
      last.from = Math.min(last.from, time);
      continue;
    }
    day.groups.push({ key: `${key}-${day.groups.length}`, source, id, tracks: [play.track], at: time, from: time });
  }
  for (const day of days) day.groups = mergeSessions(day.groups);
  return days;
}
