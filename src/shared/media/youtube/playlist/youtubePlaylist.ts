import type { CatalogPlaylistDetails, Track } from "@/shared/contracts";
import { postInnertube, YOUTUBE_WEB_PROFILE, InnertubeError } from "@/shared/media/innertube/innertubeClient";
import { mapInnertubePlaylistDetails } from "@/shared/media/innertube/innertubeCollectionMapper";
import { visitYoutubePlaylistPages } from "./youtubeContinuation";
import { mapYoutubePlaylistTracks } from "./youtubePlaylistTracks";

/** The WEB client exposes the full playlist, including uploads hidden by Music. */
export async function fetchYoutubePlaylist(playlistId: string, signal?: AbortSignal): Promise<CatalogPlaylistDetails> {
  const browseId = playlistId.startsWith("VL") ? playlistId : `VL${playlistId}`;
  signal?.throwIfAborted();
  const firstPage = await postInnertube("browse", { browseId }, { profile: YOUTUBE_WEB_PROFILE, signal });
  const metadata = mapInnertubePlaylistDetails(playlistId, firstPage);
  if (!metadata) throw new InnertubeError("YouTube playlist metadata was not found.", 404);
  const tracks = new Map<string, Track>();
  // Continue using the client that issued the token. A continuation failure
  // must not silently switch to Music and return a filtered partial playlist.
  await visitYoutubePlaylistPages(firstPage, (page) => {
    for (const track of mapYoutubePlaylistTracks(page)) {
      if (!tracks.has(track.id)) tracks.set(track.id, track);
    }
  }, signal, YOUTUBE_WEB_PROFILE);
  return { ...metadata, tracks: [...tracks.values()], trackCount: tracks.size };
}
