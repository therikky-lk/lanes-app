import youtubeLikedCover from "@/assets/youtube-liked.svg";

export function isYoutubeLikedPlaylist(id: string): boolean {
  return id.replace(/^VL/, "") === "LM";
}

/** Apply built-in artwork at display time, including to older cached data. */
export function youtubePlaylistArtwork(id: string, fallback = ""): string {
  return isYoutubeLikedPlaylist(id) ? youtubeLikedCover : fallback;
}
