import { postInnertube, YOUTUBE_WEB_PROFILE, WEB_REMIX_PROFILE } from "@/shared/media/innertube/innertubeClient";
import { visitYoutubePlaylistPages } from "@/shared/media/youtube/playlist/youtubeContinuation";
import type { ClientImportedPlaylist, ClientImportedTrack } from "../../importTypes";
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

  let lastError: unknown;
  // YouTube's regular web client exposes public playlists reliably, while
  // Music remains a useful fallback for older playlist response formats.
  for (const profile of [YOUTUBE_WEB_PROFILE, WEB_REMIX_PROFILE]) {
    signal?.throwIfAborted();
    try {
      const browseId = playlistId.startsWith("VL") ? playlistId : `VL${playlistId}`;
      const body = await postInnertube("browse", { browseId }, { signal, profile });
      const header = parseYoutubePlaylistHeader(body);
      const tracks: ClientImportedTrack[] = [];
      const seenIds = new Set<string>();
      await visitYoutubePlaylistPages(body, (page) => parseInnertubeTracks(page, seenIds, tracks), signal, profile);
      if (tracks.length) {
        return {
          source: "youtube",
          sourceUrl: rawUrl,
          ...header,
          tracks,
          canonicalTrackIds: tracks.map((track) => track.sourceId),
        };
      }
    } catch (error) {
      if (signal?.aborted) throw error;
      lastError = error;
    }
  }
  if (lastError) throw lastError;
  throw new Error("No tracks could be extracted from this YouTube playlist. Check if the playlist is public.");
}
