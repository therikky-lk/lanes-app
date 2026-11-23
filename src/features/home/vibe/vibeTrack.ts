import { isVideoTrack } from "@/shared/media/isVideoTrack";
import type { Track } from "@/shared/types/track";

const MAX_TRACK_MS = 15 * 60_000;

/** My Vibe recommends individual songs, not video uploads or long mixes. */
export function isVibeTrack(track: Track): boolean {
  // Some uploads have album-style artwork, so the thumbnail is not enough.
  return !isVideoTrack(track) && track.durationMs <= MAX_TRACK_MS;
}
