import type { Track } from "@/shared/contracts";
import { asArray, asRecord, findFirst, stringValue, trimmedString, walkRecords } from "@/shared/utils/json";
import { getRuns, getText, runsToArtists } from "@/shared/media/innertube/innertubeJson";
import { mapInnertubeTrack, parseDurationMs, hasExplicitBadge } from "@/shared/media/innertube/innertubeTrackMapper";
import { coverFromThumbnail, videoThumbnailCover } from "@/shared/media/innertube/innertubeThumbnail";
import { parseTvTiles, lineText, lineBrowseId } from "../account/tvTiles";

function modelText(value: unknown): string | undefined {
  return trimmedString(value) ?? getText(value) ?? trimmedString(asRecord(value)?.content);
}

function mapLockup(raw: unknown): Track | null {
  const row = asRecord(raw);
  if (!row || !["LOCKUP_CONTENT_TYPE_VIDEO", "LOCKUP_CONTENT_TYPE_MOVIE", "LOCKUP_CONTENT_TYPE_SHORT", "LOCKUP_CONTENT_TYPE_STATION"].includes(String(row.contentType))) return null;
  const id = stringValue(row.contentId);
  const metadata = findFirst(row.metadata, "lockupMetadataViewModel");
  const title = modelText(metadata?.title);
  if (!id || !title) return null;
  const parts = asArray(findFirst(metadata, "contentMetadataViewModel")?.metadataRows)
    .flatMap((line) => asArray(asRecord(line)?.metadataParts)).map(asRecord).filter(Boolean);
  const byline = parts.find((part) => findFirst(part?.text, "browseEndpoint")) ?? parts[0];
  const artistId = stringValue(findFirst(byline?.text, "browseEndpoint")?.browseId) ?? "unknown";
  const artistName = modelText(byline?.text) ?? "Unknown Artist";
  const image = findFirst(row.contentImage, "thumbnailViewModel");
  let durationMs = 0;
  walkRecords(row.contentImage, (record) => {
    const text = modelText(record.text) ?? modelText(record.badgeText);
    const duration = text ? parseDurationMs(text) : undefined;
    if (duration) durationMs = duration;
    return false;
  });
  return {
    id, title, artists: [{ id: artistId, name: artistName.replace(/ - Topic$/, "") }], durationMs,
    cover: coverFromThumbnail(image?.image) ?? videoThumbnailCover(id),
  };
}

function mapTile(raw: unknown): Track | null {
  const tile = parseTvTiles({ tileRenderer: raw }, "video")[0];
  if (!tile) return null;
  return {
    id: tile.id, title: tile.title,
    artists: [{ id: lineBrowseId(tile, 0) ?? "unknown", name: (lineText(tile, 0) ?? "Unknown Artist").replace(/ - Topic$/, "") }],
    durationMs: parseDurationMs(tile.overlayText ?? "") ?? 0,
    cover: tile.cover ?? videoThumbnailCover(tile.id),
  };
}

function mapVideo(raw: unknown): Track | null {
  const row = asRecord(raw);
  if (!row || row.isPlayable === false || row.style === "PLAYLIST_VIDEO_RENDERER_STYLE_RECOMMENDED_VIDEO") return null;
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
    const video = record.playlistVideoRenderer ?? record.playlistPanelVideoRenderer ?? record.videoRenderer;
    const music = record.musicResponsiveListItemRenderer;
    const lockup = record.lockupViewModel;
    const tile = record.tileRenderer;
    if (!video && !music && !lockup && !tile) return false;
    const track = video ? mapVideo(video) : lockup ? mapLockup(lockup) : tile ? mapTile(tile) : mapInnertubeTrack(record);
    if (track && !tracks.has(track.id)) tracks.set(track.id, track);
    return true;
  });
  return [...tracks.values()];
}
