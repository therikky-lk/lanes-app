import type { ClientImportedPlaylist, ClientImportedTrack } from "../../importTypes";
import { fetchYoutubePlaylist } from "@/shared/media/youtube/playlist/youtubePlaylist";
import { importYoutubeSingleVideo } from "./youtubeSingleVideo";
import { playlistIdFromYoutube, videoIdFromYoutube } from "./youtubeUrl";

export async function importYoutube(rawUrl: string, signal?: AbortSignal): Promise<ClientImportedPlaylist> {
  const playlistId = playlistIdFromYoutube(rawUrl);
  if (!playlistId) {
    const videoId = videoIdFromYoutube(rawUrl);
    if (videoId) return importYoutubeSingleVideo(videoId, rawUrl, signal);
    throw new Error("YouTube URL must contain a valid playlist or video identifier.");
  }

  const playlist = await fetchYoutubePlaylist(playlistId, signal);
  const tracks: ClientImportedTrack[] = playlist.tracks.map((track) => ({
    sourceId: track.id,
    title: track.title,
    artists: track.artists.map((artist) => artist.name),
    artistIds: track.artists.map((artist) => artist.id !== "unknown" ? artist.id : undefined),
    album: track.album?.title,
    albumId: track.album?.id,
    durationMs: track.durationMs,
    coverUrl: track.cover?.url ?? "",
  }));

  if (tracks.length === 0) {
    throw new Error("No tracks could be extracted from this YouTube playlist. Check if the playlist is public.");
  }

  return {
    source: "youtube",
    sourceUrl: rawUrl,
    title: playlist.title,
    ...(playlist.description ? { description: playlist.description } : {}),
    tracks,
    canonicalTrackIds: tracks.map((track) => track.sourceId),
  };
}
