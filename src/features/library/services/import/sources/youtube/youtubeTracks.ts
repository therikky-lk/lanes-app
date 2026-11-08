import { mapYoutubePlaylistTracks } from "@/shared/media/youtube/playlist/youtubePlaylistTracks";
import type { ClientImportedTrack } from "../../importTypes";

export function parseInnertubeTracks(body: unknown, seenIds: Set<string>, tracks: ClientImportedTrack[]): void {
  // Playlist import must accept the same renderers as playlist browsing:
  // YouTube now returns lockupViewModel cards, while older responses use
  // playlistVideoRenderer or musicResponsiveListItemRenderer.
  for (const mapped of mapYoutubePlaylistTracks(body)) {
    if (seenIds.has(mapped.id)) continue;
    seenIds.add(mapped.id);
    tracks.push({
      sourceId: mapped.id,
      title: mapped.title,
      artists: mapped.artists.map((artist) => artist.name),
      artistIds: mapped.artists.map((artist) => artist.id !== "unknown" ? artist.id : undefined),
      durationMs: mapped.durationMs,
      coverUrl: mapped.cover?.url ?? "",
    });
  }
}
