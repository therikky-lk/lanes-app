import type { Track } from "@/shared/contracts";
import { asRecord, stringValue, walkRecords } from "@/shared/utils/json";
import { getRuns, getText, runsToArtists } from "@/shared/media/innertube/innertubeJson";
import { mapInnertubeTrack, parseDurationMs, hasExplicitBadge } from "@/shared/media/innertube/innertubeTrackMapper";
import { coverFromThumbnail, videoThumbnailCover } from "@/shared/media/innertube/innertubeThumbnail";

function mapVideo(raw: unknown): Track | null {
  const row = asRecord(raw);
  if (!row || row.isPlayable === false) return null;
  const id = stringValue(row.videoId);
  const title = getText(row.title) ?? stringValue(row.title);
  if (!id || !title) return null;
  const byline = row.shortBylineText ?? row.longBylineText ?? row.ownerText;
  const linked = runsToArtists(getRuns(byline), () => true);
  const artists = linked.length ? linked : [{ id: "unknown", name: getText(byline) ?? "Unknown Artist" }];
  const seconds = Number(row.lengthSeconds);
  return {
    id,
    title,
    artists: artists.map((artist) => ({ ...artist, name: artist.name.replace(/ - Topic$/, "") })),
    durationMs: Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : parseDurationMs(getText(row.lengthText) ?? "") ?? 0,
    cover: coverFromThumbnail(row.thumbnail) ?? videoThumbnailCover(id),
    explicit: hasExplicitBadge(row),
  };
}

/** Explicit playlists retain uploads and videos, unlike the music-only catalog. */
export function mapYoutubePlaylistTracks(body: unknown): Track[] {
  const tracks = new Map<string, Track>();
  walkRecords(body, (record) => {
    const video = record.playlistVideoRenderer ?? record.playlistPanelVideoRenderer;
    const music = record.musicResponsiveListItemRenderer;
    if (!video && !music) return false;
    const track = video ? mapVideo(video) : mapInnertubeTrack(record);
    if (track && !tracks.has(track.id)) tracks.set(track.id, track);
    return true;
  });
  return [...tracks.values()];
}
