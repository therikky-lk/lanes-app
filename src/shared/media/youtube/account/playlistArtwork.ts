import youtubeLikedCover from "@/assets/youtube-liked.svg";

/** Apply built-in artwork at display time, including to older cached data. */
export function youtubePlaylistArtwork(id: string, fallback = ""): string {
  return id.replace(/^VL/, "") === "LM" ? youtubeLikedCover : fallback;
}
