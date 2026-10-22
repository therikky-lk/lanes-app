import {
  asArray,
  asRecord,
  findFirst,
  type JsonRecord,
  numberValue,
  parseJsonSafe,
  recordAt,
  trimmedString,
} from "@/shared/utils/json";
import type { ClientImportedTrack } from "../../importTypes";
import { tryFetchText } from "@/shared/api/tryFetch";
import type { SpotifyEntityType } from "./spotifyUrl";

export interface SpotifyEmbedData {
  title?: string;
  description?: string;
  coverUrl?: string;
  tracks: ClientImportedTrack[];
}

/** largest image of the entity's cover art (playlist / album artwork) */
export function pickSpotifyCover(entity: JsonRecord): string | undefined {
  const candidates = [
    ...asArray(asRecord(entity.coverArt)?.sources),
    ...asArray(asRecord(entity.visualIdentity)?.image),
    ...asArray(entity.images),
  ];
  let best: { url: string; size: number } | undefined;
  for (const raw of candidates) {
    const img = asRecord(raw);
    const url = trimmedString(img?.url);
    if (!url || !/^https:\/\//.test(url)) continue;
    const size = numberValue(img?.width) ?? numberValue(img?.maxWidth) ?? 0;
    if (!best || size > best.size) best = { url, size };
  }
  return best?.url;
}

function splitArtists(subtitle: unknown): string[] {
  const raw = typeof subtitle === "string" ? subtitle : "";
  return raw
    .split(/,[\s\u00A0]+/)
    .map((artist) => artist.trim())
    .filter(Boolean);
}

function embedJson(html: string): unknown {
  const nextData = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  const parsed = nextData?.[1] ? parseJsonSafe(nextData[1]) : undefined;
  if (parsed !== undefined && parsed !== null) return parsed;
  const initialState = html.match(/<script id="(?:initial-state|session)"[^>]*>([\s\S]*?)<\/script>/);
  return initialState?.[1] ? parseJsonSafe(initialState[1]) : undefined;
}

function findEntity(data: unknown): JsonRecord | undefined {
  const pageProps = recordAt(data, "props", "pageProps");
  return pageProps?.state ? recordAt(pageProps, "state", "data", "entity") : findFirst(data, "entity");
}

function mapTrackListItem(
  rawItem: unknown,
  entityType: SpotifyEntityType,
  title: string,
): ClientImportedTrack | undefined {
  const item = asRecord(rawItem);
  const trackTitle = trimmedString(item?.title);
  if (!item || !trackTitle) return undefined;
  const artists = splitArtists(item.subtitle);
  const uri = typeof item.uri === "string" ? item.uri : "";
  return {
    sourceId: uri.split(":").pop() || String(item.uid ?? ""),
    title: trackTitle,
    artists: artists.length > 0 ? artists : ["Spotify Artist"],
    ...(entityType === "album" && title ? { album: title } : {}),
    durationMs: numberValue(item.duration),
  };
}

export function parseSpotifyEmbedHtml(
  html: string,
  entityType: SpotifyEntityType,
  entityId: string,
  fallbackTitle: string,
): SpotifyEmbedData {
  const entity = findEntity(embedJson(html));
  if (!entity) return { tracks: [] };
  const title = trimmedString(entity.title) || trimmedString(entity.name);
  const description = trimmedString(entity.subtitle);
  const tracks = asArray(entity.trackList)
    .map((item) => mapTrackListItem(item, entityType, title ?? fallbackTitle))
    .filter((track): track is ClientImportedTrack => Boolean(track));

  if (tracks.length === 0 && entityType === "track" && title) {
    const artists = splitArtists(entity.subtitle);
    tracks.push({
      sourceId: entityId,
      title,
      artists: artists.length > 0 ? artists : ["Spotify Artist"],
      durationMs: numberValue(entity.duration),
    });
  }
  const ogImage = /<meta[^>]+property=["']og:image["'][^>]+content=["'](https:[^"']+)["']/i.exec(html)?.[1];
  const coverUrl = pickSpotifyCover(entity) ?? ogImage;
  return { title, description, ...(coverUrl ? { coverUrl } : {}), tracks };
}

export async function fetchSpotifyEmbed(
  entityType: SpotifyEntityType,
  entityId: string,
  fallbackTitle: string,
  signal?: AbortSignal,
): Promise<SpotifyEmbedData> {
  const url = `https://open.spotify.com/embed/${entityType}/${encodeURIComponent(entityId)}`;
  const html = await tryFetchText(url, { signal });
  return html ? parseSpotifyEmbedHtml(html, entityType, entityId, fallbackTitle) : { tracks: [] };
}
