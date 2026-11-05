import type { CatalogPlaylistDetails, Track } from "@/shared/contracts";
import { postInnertube, YOUTUBE_WEB_PROFILE, WEB_REMIX_PROFILE, InnertubeError } from "@/shared/media/innertube/innertubeClient";
import { TV_ACCOUNT_PROFILE } from "@/shared/media/innertube/playbackProfiles";
import { mapInnertubePlaylistDetails } from "@/shared/media/innertube/innertubeCollectionMapper";
import { visitYoutubePlaylistPages } from "./youtubeContinuation";
import { mapYoutubePlaylistTracks } from "./youtubePlaylistTracks";
import { diagThrottled } from "@/shared/platform/diag";
import { isAbortError } from "@/shared/utils/abort";
import { walkRecords } from "@/shared/utils/json";

function formats(body: unknown): string {
  const counts = new Map<string, number>();
  walkRecords(body, (record) => {
    for (const key of Object.keys(record)) {
      if (/^(?:playlistVideo|playlistPanelVideo|lockupView|tile|musicResponsiveListItem|continuationItemView)/.test(key)) {
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    return false;
  });
  return [...counts].map(([key, count]) => `${key}=${count}`).join(", ").slice(0, 200) || "no recognized list renderers";
}

/** The WEB client exposes the full playlist, including uploads hidden by Music. */
export async function fetchYoutubePlaylist(playlistId: string, signal?: AbortSignal): Promise<CatalogPlaylistDetails> {
  const browseId = playlistId.startsWith("VL") ? playlistId : `VL${playlistId}`;
  let failure: unknown;
  // Metadata alone is not a successful response. Try another supported client
  // before giving up; Music also preserves the legacy import transport.
  for (const profile of [YOUTUBE_WEB_PROFILE, TV_ACCOUNT_PROFILE, WEB_REMIX_PROFILE]) {
    signal?.throwIfAborted();
    try {
      const firstPage = await postInnertube("browse", { browseId }, { profile, signal });
      const metadata = mapInnertubePlaylistDetails(playlistId, firstPage);
      if (!metadata) throw new InnertubeError("YouTube playlist metadata was not found.", 404);
      const tracks = new Map<string, Track>();
      await visitYoutubePlaylistPages(firstPage, (page) => {
        for (const track of mapYoutubePlaylistTracks(page)) {
          if (!tracks.has(track.id)) tracks.set(track.id, track);
        }
      }, signal, profile);
      const summary = `${profile.clientName}: ${tracks.size} tracks (${formats(firstPage)})`;
      diagThrottled(`playlist:${playlistId}:${profile.clientName}`, `playlist ${playlistId}: ${summary}`);
      if (!tracks.size) throw new InnertubeError("YouTube returned no readable playlist tracks.", 502);
      return { ...metadata, tracks: [...tracks.values()], trackCount: tracks.size };
    } catch (error) {
      if (isAbortError(error, signal)) throw error;
      failure ??= error;
      diagThrottled(`playlist-failed:${playlistId}:${profile.clientName}`, `playlist ${playlistId}: ${profile.clientName} failed (${String(error).slice(0, 120)})`);
    }
  }
  throw failure ?? new InnertubeError("YouTube playlist tracks could not be loaded. Please try again.", 502);
}
