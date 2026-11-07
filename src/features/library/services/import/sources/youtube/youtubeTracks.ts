import { mapInnertubeTrack } from "@/shared/media/innertube/innertubeTrackMapper";
import type { ClientImportedTrack } from "../../importTypes";
import { collectByKey } from "@/shared/utils/json";

function mapRendererTrack(rawRenderer: unknown, seenIds: Set<string>): ClientImportedTrack | undefined {
  // An explicitly imported playlist can contain user uploads and music videos.
  // Keep those entries instead of applying the music catalog's audio-only filter.
  const mapped = mapInnertubeTrack({ musicResponsiveListItemRenderer: rawRenderer });
  if (!mapped || seenIds.has(mapped.id)) return undefined;
  seenIds.add(mapped.id);
  return {
    sourceId: mapped.id,
    title: mapped.title,
    artists: mapped.artists.map((artist) => artist.name),
    artistIds: mapped.artists.map((artist) => (artist.id !== "unknown" ? artist.id : undefined)),
    album: mapped.album?.title,
    albumId: mapped.album?.id,
    durationMs: mapped.durationMs,
    coverUrl: mapped.cover?.url ?? "",
  };
}

export function parseInnertubeTracks(body: unknown, seenIds: Set<string>, tracks: ClientImportedTrack[]): void {
  for (const rawRenderer of collectByKey(body, "musicResponsiveListItemRenderer")) {
    const track = mapRendererTrack(rawRenderer, seenIds);
    if (track) tracks.push(track);
  }
}
