import { mapYoutubePlaylistTracks } from "@/shared/media/youtube/playlist/youtubePlaylistTracks";
import type { ClientImportedTrack } from "../../importTypes";

export function parseInnertubeTracks(body: unknown, seenIds: Set<string>, tracks: ClientImportedTrack[]): void {
  for (const track of mapYoutubePlaylistTracks(body)) {
    if (seenIds.has(track.id)) continue;
    seenIds.add(track.id);
    tracks.push({
      sourceId: track.id, title: track.title, artists: track.artists.map((artist) => artist.name),
      artistIds: track.artists.map((artist) => artist.id !== "unknown" ? artist.id : undefined),
      album: track.album?.title, albumId: track.album?.id, durationMs: track.durationMs, coverUrl: track.cover?.url ?? "",
    });
  }
}
