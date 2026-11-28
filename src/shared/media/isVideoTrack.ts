// A YouTube music video / clip / upload rather than the song itself. Songs
// carry album artwork (googleusercontent); videos only have a frame from the
// clip (i.ytimg.com/vi/...), which is how they're told apart once mapped.
const VIDEO_THUMB = /(^|\/\/)i\d?\.ytimg\.com\/vi(_webp)?\//;

export function isVideoTrack(
  track: { musicVideoType?: string; coverUrl?: string | null; cover?: { url?: string | null } } | null | undefined,
): boolean {
  const type = track?.musicVideoType;
  if (type === "MUSIC_VIDEO_TYPE_OMV" || type === "MUSIC_VIDEO_TYPE_UGC") return true;
  if (type === "MUSIC_VIDEO_TYPE_ATV" || type === "MUSIC_VIDEO_TYPE_OFFICIAL_SOURCE_MUSIC") return false;
  const coverUrl = track?.coverUrl ?? track?.cover?.url;
  return !!coverUrl && VIDEO_THUMB.test(coverUrl);
}
