// A YouTube music video / clip / upload rather than the song itself. Songs
// carry album artwork (googleusercontent); videos only have a frame from the
// clip (i.ytimg.com/vi/...), which is how they're told apart once mapped.
const VIDEO_THUMB = /(^|\/\/)i\d?\.ytimg\.com\/vi(_webp)?\//;

export function isVideoTrack(track: { coverUrl?: string | null } | null | undefined): boolean {
  return !!track?.coverUrl && VIDEO_THUMB.test(track.coverUrl);
}
