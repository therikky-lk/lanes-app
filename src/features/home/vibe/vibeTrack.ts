import type { Track } from "@/shared/types/track";

const MAX_TRACK_MS = 15 * 60_000;
const OFFICIAL_AUDIO = new Set(["MUSIC_VIDEO_TYPE_ATV", "MUSIC_VIDEO_TYPE_OFFICIAL_SOURCE_MUSIC"]);
const COMPILATION_TITLE = /(?:найкращі\s+(?:пісні|хіти)|лучшие\s+(?:песни|хиты)|(?:хіти|хиты)\s+20\d{2}|(?:best\s+(?:songs|hits)|greatest\s+hits)\s+20\d{2}|(?:nonstop|non-stop)\s+mix)/iu;

/** An attractive thumbnail or a similar title is not proof of a catalog song. */
export function isVibeTrack(track: Track): boolean {
  return OFFICIAL_AUDIO.has(track.musicVideoType ?? "")
    && track.durationMs > 0 && track.durationMs <= MAX_TRACK_MS
    && Boolean(track.artists.trim()) && !/^unknown artist$/i.test(track.artists.trim())
    && !COMPILATION_TITLE.test(track.title);
}
