import type { SearchResult } from "@/shared/contracts";
import { asArray, asRecord, type JsonRecord } from "@/shared/utils/json";
import { getBrowseEndpoint, getPageType, getRuns, getText, runsToArtists } from "./innertubeJson";
import { mapCardShelf } from "./innertubeCardMapper";
import { coverFromThumbnail } from "./innertubeThumbnail";
import { isMusicVideo, mapInnertubeTrack } from "./innertubeTrackMapper";

interface ListRow {
  renderer: JsonRecord;
  browseId: string;
  pageType: string | undefined;
  title: string;
  metadata: JsonRecord[];
}

function readListRow(raw: unknown): ListRow | null {
  const renderer = asRecord(asRecord(raw)?.musicResponsiveListItemRenderer);
  if (!renderer) return null;
  const endpoint = getBrowseEndpoint(renderer);
  const columnText = (index: number) =>
    asRecord(asRecord(asRecord(asArray(renderer.flexColumns)[index])?.musicResponsiveListItemFlexColumnRenderer)?.text);
  const title = getText(columnText(0));
  if (typeof endpoint?.browseId !== "string" || !title) return null;
  return {
    renderer,
    browseId: endpoint.browseId,
    pageType: getPageType(endpoint),
    title,
    metadata: getRuns(columnText(1)),
  };
}

function mapListRow(row: ListRow): SearchResult | null {
  if (row.pageType === "MUSIC_PAGE_TYPE_ARTIST") {
    const cover = coverFromThumbnail(row.renderer.thumbnail, { isArtist: true });
    return { type: "artist", id: row.browseId, name: row.title, ...(cover ? { cover } : {}) };
  }
  const cover = coverFromThumbnail(row.renderer.thumbnail);
  const coverPart = cover ? { cover } : {};
  if (row.pageType === "MUSIC_PAGE_TYPE_ALBUM") {
    const year = row.metadata
      .map((run) => (typeof run.text === "string" && /^\d{4}$/.test(run.text) ? Number(run.text) : undefined))
      .find((value): value is number => value !== undefined);
    const artists = runsToArtists(row.metadata, (type) => type === "MUSIC_PAGE_TYPE_ARTIST");
    return { type: "album", id: row.browseId, title: row.title, artists, year, ...coverPart };
  }
  if (row.pageType === "MUSIC_PAGE_TYPE_PLAYLIST") {
    const author = row.metadata
      .map((run) => (typeof run.text === "string" ? run.text.trim() : ""))
      .find(Boolean);
    return { type: "playlist", id: row.browseId, title: row.title, author, ...coverPart };
  }
  return null;
}

export function mapInnertubeSearchResult(raw: unknown): SearchResult | null {
  const card = mapCardShelf(raw);
  if (card) return card;
  const track = mapInnertubeTrack(raw);
  if (track) return { type: "track", ...track };
  const row = readListRow(raw);
  return row ? mapListRow(row) : null;
}

export function getSearchItems(response: unknown): unknown[] {
  const tabs = asArray(asRecord(asRecord(asRecord(response)?.contents)?.tabbedSearchResultsRenderer)?.tabs);
  const tabContent = asRecord(asRecord(asRecord(tabs[0])?.tabRenderer)?.content);
  const sections = asRecord(tabContent?.sectionListRenderer)?.contents;
  if (!Array.isArray(sections)) return [];
  return sections.flatMap((section) => {
    const record = asRecord(section);
    const cardShelf = asRecord(record?.musicCardShelfRenderer);
    if (cardShelf) return [cardShelf, ...asArray(cardShelf.contents)];
    const shelf = asRecord(record?.musicShelfRenderer);
    if (Array.isArray(shelf?.contents)) return shelf.contents;
    return asArray(asRecord(record?.itemSectionRenderer)?.contents);
  });
}

export function mapSearchResponse(response: unknown): SearchResult[] {
  const results: SearchResult[] = [];
  const videos: SearchResult[] = [];
  const seen = new Set<string>();
  for (const item of getSearchItems(response)) {
    const mapped = mapInnertubeSearchResult(item);
    if (!mapped) continue;
    const key = `${mapped.type}:${mapped.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // clips and uploads are held back: shown only when the song itself isn't there
    if (mapped.type === "track" && isMusicVideo(item)) videos.push(mapped);
    else results.push(mapped);
  }
  const songKeys = new Set(
    results.flatMap((r) => (r.type === "track" ? [songKey(r.title, r.artists.map((a) => a.name).join(" "))] : [])),
  );
  // songs only: clips and uploads are left out, unless the search found no
  // song at all (then a clip is better than nothing)
  if (!results.some((r) => r.type === "track")) {
    for (const video of videos) {
      if (video.type !== "track") continue;
      if (!songKeys.has(songKey(video.title, video.artists.map((a) => a.name).join(" ")))) results.push(video);
    }
  }
  return results;
}

/** "Song (Official Video)" and "Song" by the same artist are one song */
function songKey(title: string, artists: string): string {
  const clean = title
    .toLowerCase()
    .replace(/[([][^)\]]*(video|clip|клип|visualizer|lyric|audio|live|mv)[^)\]]*[)\]]/gi, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  const artist = artists.toLowerCase().split(/,|&| feat| ft| x /)[0].replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  return `${clean}|${artist}`;
}
