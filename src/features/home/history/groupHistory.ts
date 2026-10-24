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
}

export interface HistoryGroup {
  key: string;
  source: HistorySource;
  /** playlist / album id (or the seed track for a radio) */
  id?: string;
  tracks: Track[];
  /** newest play in the group */
  at: number;
}

export interface HistoryDay {
  key: string;
  date: Date;
  groups: HistoryGroup[];
}

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

export function groupHistory(plays: HistoryPlay[]): HistoryDay[] {
  const days: HistoryDay[] = [];
  for (const play of plays) {
    if (!play.track?.id) continue;
    const at = new Date(play.listenedAt);
    if (Number.isNaN(at.getTime())) continue;
    const key = dayKey(at);
    let day = days[days.length - 1];
    if (!day || day.key !== key) {
      day = { key, date: new Date(at.getFullYear(), at.getMonth(), at.getDate()), groups: [] };
      days.push(day);
    }
    const { source, id } = sourceOf(play.context);
    const last = day.groups[day.groups.length - 1];
    // consecutive plays from the same place merge; single tracks never do
    if (last && source !== "track" && last.source === source && last.id === id) {
      if (!last.tracks.some((t) => t.id === play.track.id)) last.tracks.push(play.track);
      continue;
    }
    day.groups.push({ key: `${key}-${day.groups.length}`, source, id, tracks: [play.track], at: at.getTime() });
  }
  return days;
}
