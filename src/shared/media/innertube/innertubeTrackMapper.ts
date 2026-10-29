import type { Track, TrackArtist } from "@/shared/contracts";
import { asArray, asRecord, type JsonRecord } from "@/shared/utils/json";
import { getRuns, getText, runsToAlbum, runsToArtists } from "./innertubeJson";
import { coverFromThumbnail } from "./innertubeThumbnail";

export function hasExplicitBadge(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasExplicitBadge);
  const record = asRecord(value);
  if (!record) return false;
  if (asRecord(asRecord(record.musicInlineBadgeRenderer)?.icon)?.iconType === "MUSIC_EXPLICIT_BADGE") {
    return true;
  }
  return Object.values(record).some(hasExplicitBadge);
}

export function parseDurationMs(value: string): number | undefined {
  const parts = value.trim().split(":");
  if (parts.length < 2 || parts.length > 3 || parts.some((part) => !/^\d{1,3}$/.test(part))) {
    return undefined;
  }
  const numbers = parts.map(Number);
  const seconds = numbers[numbers.length - 1];
  const minutes = numbers[numbers.length - 2];
  const hours = parts.length === 3 ? numbers[0] : 0;
  if (seconds > 59 || (parts.length === 3 && minutes > 59)) return undefined;
  const total = hours * 3600 + minutes * 60 + seconds;
  return total > 0 ? total * 1000 : undefined;
}

export function durationFromRuns(runs: JsonRecord[]): number {
  return (
    runs
      .map((run) => (typeof run.text === "string" ? parseDurationMs(run.text) : undefined))
      .find((duration): duration is number => duration !== undefined) ?? 0
  );
}

function columnText(renderer: JsonRecord, key: string, rendererKey: string, index: number): JsonRecord | undefined {
  const column = asRecord(asArray(renderer[key])[index]);
  return asRecord(asRecord(column?.[rendererKey])?.text);
}

function flexRuns(renderer: JsonRecord): JsonRecord[] {
  return asArray(renderer.flexColumns).flatMap((_, index) =>
    getRuns(columnText(renderer, "flexColumns", "musicResponsiveListItemFlexColumnRenderer", index)),
  );
}

function fixedRuns(renderer: JsonRecord): JsonRecord[] {
  return asArray(renderer.fixedColumns).flatMap((_, index) =>
    getRuns(columnText(renderer, "fixedColumns", "musicResponsiveListItemFixedColumnRenderer", index)),
  );
}

function watchVideoId(value: unknown): string | undefined {
  const videoId = asRecord(asRecord(value)?.watchEndpoint)?.videoId;
  return typeof videoId === "string" ? videoId : undefined;
}

function resolveVideoId(renderer: JsonRecord, titleRun: JsonRecord | undefined): string | undefined {
  const playlistVideoId = asRecord(renderer.playlistItemData)?.videoId;
  if (typeof playlistVideoId === "string") return playlistVideoId;
  const overlay = asRecord(asRecord(asRecord(renderer.overlay)?.musicItemThumbnailOverlayRenderer)?.content);
  const playButton = asRecord(overlay?.musicPlayButtonRenderer);
  return (
    watchVideoId(titleRun?.navigationEndpoint) ??
    watchVideoId(playButton?.playNavigationEndpoint) ??
    watchVideoId(renderer.onTap) ??
    watchVideoId(renderer.navigationEndpoint)
  );
}

function fallbackArtistFromColumn(renderer: JsonRecord): TrackArtist {
  const runs = getRuns(columnText(renderer, "flexColumns", "musicResponsiveListItemFlexColumnRenderer", 1));
  const first = runs.find((run) => typeof run.text === "string" && run.text.trim() && run.text.trim() !== "•");
  const name = typeof first?.text === "string" ? first.text.trim() : "Unknown Artist";
  return { id: "unknown", name };
}

const JOINER = /^\s*(?:,|&|×|x|feat\.?|ft\.?)\s*$/i;

/**
 * "Koss & ПЛУТТО" where only Koss has a channel: YouTube gives the second name
 * as plain text after a joiner. Those names are artists too.
 */
function withUnlinkedArtists(runs: JsonRecord[], linked: TrackArtist[]): TrackArtist[] {
  if (linked.length === 0) return linked;
  const out = [...linked];
  const names = new Set(linked.map((a) => a.name.toLowerCase()));
  const linkedNames = new Set(names);
  for (let i = 1; i + 1 < runs.length; i++) {
    const prev = typeof runs[i - 1].text === "string" ? (runs[i - 1].text as string).trim() : "";
    const joiner = typeof runs[i].text === "string" ? (runs[i].text as string) : "";
    const next = runs[i + 1];
    const name = typeof next.text === "string" ? next.text.trim() : "";
    if (!JOINER.test(joiner) || !name || name === "•" || next.navigationEndpoint) continue;
    // only right after an artist (or a name already taken in as one)
    if (!linkedNames.has(prev.toLowerCase()) && !names.has(prev.toLowerCase())) continue;
    if (/^\d+:\d{2}/.test(name) || names.has(name.toLowerCase())) continue;
    names.add(name.toLowerCase());
    out.push({ id: "", name });
  }
  return out;
}

export function mapInnertubeTrack(raw: unknown, fallbackArtists: TrackArtist[] = []): Track | null {
  const item = asRecord(raw);
  const renderer = asRecord(item?.musicResponsiveListItemRenderer) ?? item;
  if (!renderer) return null;

  const titleColumn = columnText(renderer, "flexColumns", "musicResponsiveListItemFlexColumnRenderer", 0);
  const title = getText(titleColumn) ?? getText(renderer.title);
  const id = resolveVideoId(renderer, getRuns(titleColumn)[0]);
  if (!id || !title) return null;

  const metadataRuns = flexRuns(renderer);
  const rowArtists = withUnlinkedArtists(metadataRuns, runsToArtists(metadataRuns));
  const artists =
    rowArtists.length > 0
      ? rowArtists
      : fallbackArtists.length > 0
        ? fallbackArtists
        : [fallbackArtistFromColumn(renderer)];

  return {
    id,
    title,
    artists,
    album: runsToAlbum(metadataRuns),
    durationMs: durationFromRuns([...metadataRuns, ...fixedRuns(renderer)]),
    cover: coverFromThumbnail(renderer.thumbnail),
    explicit: hasExplicitBadge(renderer),
  };
}

// YouTube Music marks every playable item: ATV and OFFICIAL_SOURCE_MUSIC are
// audio tracks. OMV is an official music video and UGC is a user upload; both
// have video frames for covers and often represent a different cut.
const VIDEO_TYPES = new Set(["MUSIC_VIDEO_TYPE_OMV", "MUSIC_VIDEO_TYPE_UGC"]);

/** the musicVideoType of a raw item, looked up a few levels deep */
export function musicVideoType(raw: unknown): string | undefined {
  const stack: { node: unknown; depth: number }[] = [{ node: raw, depth: 0 }];
  while (stack.length) {
    const { node, depth } = stack.pop()!;
    if (!node || typeof node !== "object" || depth > 12) continue;
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === "musicVideoType" && typeof value === "string") return value;
      if (value && typeof value === "object") stack.push({ node: value, depth: depth + 1 });
    }
  }
  return undefined;
}

/** a music video or user upload rather than the song itself */
export function isMusicVideo(raw: unknown): boolean {
  const type = musicVideoType(raw);
  return !!type && VIDEO_TYPES.has(type);
}
