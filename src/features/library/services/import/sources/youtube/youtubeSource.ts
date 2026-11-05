import { postInnertube } from "@/shared/media/innertube/innertubeClient";
import type { ClientImportedPlaylist, ClientImportedTrack } from "../../importTypes";
import { visitYoutubePlaylistPages } from "@/shared/media/youtube/playlist/youtubeContinuation";
import { parseYoutubePlaylistHeader } from "./youtubeHeader";
import { importYoutubeSingleVideo } from "./youtubeSingleVideo";
import { parseInnertubeTracks } from "./youtubeTracks";
import { playlistIdFromYoutube, videoIdFromYoutube } from "./youtubeUrl";

export async function importYoutube(rawUrl: string, signal?: AbortSignal): Promise<ClientImportedPlaylist> {
  const playlistId = playlistIdFromYoutube(rawUrl);
  if (!playlistId) {
    const videoId = videoIdFromYoutube(rawUrl);
    if (videoId) return importYoutubeSingleVideo(videoId, rawUrl, signal);
    throw new Error("YouTube URL must contain a valid playlist or video identifier.");
  }

  const body = await postInnertube("browse", { browseId: playlistId }, { signal });
  const header = parseYoutubePlaylistHeader(body);
  const tracks: ClientImportedTrack[] = [];
  const seenIds = new Set<string>();
  await visitYoutubePlaylistPages(body, (page) => parseInnertubeTracks(page, seenIds, tracks), signal);

  if (tracks.length === 0) {
    throw new Error("No tracks could be extracted from this YouTube playlist. Check if the playlist is public.");
  }

  return {
    source: "youtube",
    sourceUrl: rawUrl,
    ...header,
    tracks,
    canonicalTrackIds: tracks.map((track) => track.sourceId),
  };
}
