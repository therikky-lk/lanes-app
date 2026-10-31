import type { SearchResult, SearchType, Track } from "@/shared/contracts";
import { postInnertube, YOUTUBE_WEB_PROFILE } from "./innertubeClient";
import { mapOfficialVideoSearchResponse, mapSearchResponse } from "./innertubeSearchMapper";
import { isJunkVideo, matchesQueryWell } from "./innertubeSearchRanking";
import { isVideoTrack } from "@/shared/media/isVideoTrack";
import { asArray, asRecord } from "@/shared/utils/json";
import { parseDurationMs } from "./innertubeTrackMapper";

export type InnertubeSearchFilter = SearchType | "video";

type TrackResult = Extract<SearchResult, { type: "track" }>;

const SEARCH_PARAMS: Partial<Record<InnertubeSearchFilter, string>> = {
  track: "EgWKAQIIAWoKEAkQBRAKEAMQBA%3D%3D",
  video: "EgWKAQIQAWoKEAkQBRAKEAMQBA%3D%3D",
  artist: "EgWKAQIgAWoKEAkQBRAKEAMQBA%3D%3D",
  album: "EgWKAQIYAWoKEAkQBRAKEAMQBA%3D%3D",
  playlist: "EgWKAQIoAWoKEAkQBRAKEAMQBA%3D%3D",
};

export async function searchRaw(query: string, filter?: InnertubeSearchFilter, signal?: AbortSignal): Promise<SearchResult[]> {
  const params = filter ? SEARCH_PARAMS[filter] : undefined;
  const body = await postInnertube("search", { query, ...(params ? { params } : {}) }, { signal });
  return mapSearchResponse(body);
}

/** Videos from regular YouTube, kept separate from the music catalog search. */
export async function searchYoutubeVideos(query: string, signal?: AbortSignal): Promise<TrackResult[]> {
  const body = await postInnertube("search", { query }, { profile: YOUTUBE_WEB_PROFILE, signal });
  const found: TrackResult[] = [];
  const seen = new Set<string>();
  const visit = (value: unknown) => {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    const record = asRecord(value);
    if (!record) return;
    const video = asRecord(record.videoRenderer);
    if (video) {
      const id = typeof video.videoId === "string" ? video.videoId : "";
      const title = asArray(asRecord(video.title)?.runs)
        .map((run) => asRecord(run)?.text)
        .find((text): text is string => typeof text === "string");
      const channel = asArray(asRecord(video.ownerText)?.runs)[0];
      const channelRecord = asRecord(channel);
      const channelName = typeof channelRecord?.text === "string" ? channelRecord.text : "YouTube";
      const channelId = asRecord(asRecord(channelRecord?.navigationEndpoint)?.browseEndpoint)?.browseId;
      const thumbnails = asArray(asRecord(video.thumbnail)?.thumbnails).map((item) => asRecord(item)).filter(Boolean);
      const thumbnail = thumbnails[thumbnails.length - 1];
      const duration = asRecord(video.lengthText)?.simpleText;
      if (id && title && !seen.has(id)) {
        seen.add(id);
        found.push({
          type: "track",
          id,
          title,
          artists: [{ id: typeof channelId === "string" ? channelId : "", name: channelName }],
          durationMs: typeof duration === "string" ? (parseDurationMs(duration) ?? 0) : 0,
          ...(typeof thumbnail?.url === "string"
            ? { cover: { url: thumbnail.url, width: Number(thumbnail.width) || 0, height: Number(thumbnail.height) || 0 } }
            : {}),
        });
      }
    }
    Object.values(record).forEach(visit);
  };
  visit(body);
  return found;
}

export async function searchArtistOfficialVideos(
  artistId: string,
  artistName: string,
  signal?: AbortSignal,
): Promise<Track[]> {
  const query = `${artistName} official music video`;
  const body = await postInnertube(
    "search",
    { query, params: SEARCH_PARAMS.video },
    { signal },
  );
  const normalizedArtist = artistName.trim().toLocaleLowerCase();
  return mapOfficialVideoSearchResponse(body)
    .filter((item): item is TrackResult => item.type === "track")
    .filter((track) => track.artists.some((artist) =>
      artist.id === artistId || artist.name.trim().toLocaleLowerCase() === normalizedArtist,
    ))
    .map(({ type: _type, viewer: _viewer, ...track }) => track);
}

function onlyTracks(results: SearchResult[]): TrackResult[] {
  return results.filter((item): item is TrackResult => item.type === "track");
}

function settledOrEmpty(result: PromiseSettledResult<SearchResult[]>): SearchResult[] {
  return result.status === "fulfilled" ? result.value : [];
}

function throwIfAllFailed(results: PromiseSettledResult<SearchResult[]>[]): void {
  const firstFailure = results.find((result) => result.status === "rejected");
  if (firstFailure && results.every((result) => result.status === "rejected")) {
    throw firstFailure.reason;
  }
}

function matches(query: string, track: TrackResult): boolean {
  return matchesQueryWell(query, track.title, track.artists.map((artist) => artist.name));
}

function createCollector(enrichment: Map<string, TrackResult>) {
  const results: SearchResult[] = [];
  const seen = new Set<string>();
  const add = (item: SearchResult) => {
    const key = `${item.type}:${item.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (item.type !== "track") {
      results.push(item);
      return;
    }
    const detailed = enrichment.get(item.id);
    results.push(detailed && detailed.durationMs > 0 && !item.durationMs ? { ...item, ...detailed } : item);
  };
  return { results, add };
}

// a clip / upload rather than the song: those carry a frame of the video
// (i.ytimg.com/vi/...) instead of album artwork
function isVideoResult(item: SearchResult): boolean {
  return item.type === "track" && isVideoTrack({ coverUrl: item.cover?.url });
}

async function searchTracksAndMixed(query: string, includeMixed: boolean, signal?: AbortSignal): Promise<SearchResult[]> {
  // songs only: music videos, clips and uploads are not searched for at all
  const settled = await Promise.allSettled([searchRaw(query, undefined, signal), searchRaw(query, "track", signal)]);
  throwIfAllFailed(settled);
  const mixed = settledOrEmpty(settled[0]).filter((item) => !isVideoResult(item));
  // the "Songs" filter only returns songs; the mixed results also carry clips
  const tracks = onlyTracks(settledOrEmpty(settled[1]));
  const enrichment = new Map(tracks.map((track) => [track.id, track] as const));
  const { results, add } = createCollector(enrichment);
  const topResult = mixed[0];

  if (includeMixed && topResult && topResult.type !== "track") add(topResult);
  tracks.filter((track) => matches(query, track)).forEach(add);
  if (includeMixed) {
    mixed.forEach(add);
  } else if (topResult?.type === "track" && matches(query, topResult) && !isJunkVideo(topResult.title, query)) {
    add(topResult);
  }
  tracks.filter((track) => !matches(query, track)).forEach(add);
  return results;
}

async function searchTyped(query: string, type: Exclude<SearchType, "all" | "track">, signal?: AbortSignal): Promise<SearchResult[]> {
  const settled = await Promise.allSettled([searchRaw(query, undefined, signal), searchRaw(query, type, signal)]);
  throwIfAllFailed(settled);
  const mixed = settledOrEmpty(settled[0]);
  const typed = settledOrEmpty(settled[1]).filter((item) => item.type === type);
  const { results, add } = createCollector(new Map());
  if (mixed[0]?.type === type) add(mixed[0]);
  typed.forEach(add);
  return results;
}

export function searchCatalog(query: string, type: SearchType = "all", signal?: AbortSignal): Promise<SearchResult[]> {
  if (type === "all") return searchTracksAndMixed(query, true, signal);
  if (type === "track") return searchTracksAndMixed(query, false, signal);
  return searchTyped(query, type, signal);
}
