import type { ArtistAlbum, ArtistDetails, ArtistRelease } from "@/shared/contracts";
import { asArray, asRecord, findFirst, walkRecords } from "@/shared/utils/json";
import { getPageType, getRuns, getText, yearFromRuns } from "./innertubeJson";
import { coverFromThumbnail } from "./innertubeThumbnail";
import { hasExplicitBadge } from "./innertubeTrackMapper";
import { mapInnertubeBrowseTracks, microformatCover } from "./innertubeCollectionMapper";
import { isVerifiedArtist } from "./monthlyListeners";

const LISTENERS_PATTERN = /[\d.,]+[KMBkmb]?\s*(?:monthly (?:audience|listeners)|слушателей за месяц|слухачів за місяць)/i;

function artistHeader(body: unknown) {
  return (
    findFirst(body, "musicImmersiveHeaderRenderer") ??
    findFirst(body, "musicVisualHeaderRenderer") ??
    findFirst(body, "musicHeaderRenderer") ??
    findFirst(body, "musicResponsiveHeaderRenderer")
  );
}

function parseMonthlyListeners(header: Record<string, unknown> | undefined): string | undefined {
  if (!header) return undefined;
  const direct = getText(header.monthlyListenerCount);
  if (direct) return direct;
  const label = asRecord(asRecord(asRecord(header.monthlyListenerCount)?.accessibility)?.accessibilityData)?.label;
  if (typeof label === "string" && label.trim()) return label.trim();
  return getText(header.subtitle)?.match(LISTENERS_PATTERN)?.[0] ?? getText(header.secondSubtitle)?.match(LISTENERS_PATTERN)?.[0];
}

function mapReleaseItem(raw: unknown): ArtistAlbum | null {
  const item = asRecord(asRecord(raw)?.musicTwoRowItemRenderer);
  const titleRun = getRuns(item?.title)[0];
  const endpoint =
    asRecord(asRecord(titleRun?.navigationEndpoint)?.browseEndpoint) ??
    asRecord(asRecord(item?.navigationEndpoint)?.browseEndpoint);
  const title = getText(item?.title);
  const browseId = typeof endpoint?.browseId === "string" ? endpoint.browseId : "";
  const isAlbum = getPageType(endpoint) === "MUSIC_PAGE_TYPE_ALBUM" || /^(MPRE|OLAK|MPLA|MPL)/.test(browseId);
  if (!isAlbum || !browseId || !title) {
    return null;
  }
  const year = yearFromRuns(item?.subtitle);
  const cover = coverFromThumbnail(item?.thumbnailRenderer);
  return {
    id: browseId,
    title,
    ...(year ? { year } : {}),
    ...(cover ? { cover } : {}),
    explicit: hasExplicitBadge(item),
  };
}

function releaseTypeOf(raw: unknown): ArtistRelease["releaseType"] {
  const item = asRecord(asRecord(raw)?.musicTwoRowItemRenderer);
  const subtitle = getRuns(item?.subtitle)
    .map((run) => typeof run.text === "string" ? run.text.trim().toLocaleLowerCase() : "")
    .join(" ");
  return /(?:^|\s)(?:ep|eps|е\.п\.|еп)(?:$|\s|[·•])/.test(subtitle) ? "ep" : "single";
}

type ReleaseShelf = "albums" | "singles";

/** YouTube Music has used several labels for the two release shelves */
export function releaseShelfKind(title: string | undefined): ReleaseShelf | null {
  const t = (title ?? "").trim().toLowerCase();
  if (["albums", "album", "альбомы", "альбом", "альбоми"].includes(t)) return "albums";
  if (
    /^(singles?|eps?)( (&|and) (eps?|singles?))?$/.test(t) ||
    /^(синглы?|сингли)(\s*(и|й|та|&|\+)\s*(ep|eps|эп|мини-?альбомы?))?$/.test(t) ||
    /^(ep|eps|эп)(\s*(&|и|й|та)\s*(singles?|синглы?|сингли))$/.test(t)
  ) return "singles";
  return null;
}

export interface BrowseRef {
  browseId: string;
  params?: string;
}

function browseRefOf(endpoint: Record<string, unknown> | undefined): BrowseRef | undefined {
  if (typeof endpoint?.browseId !== "string") return undefined;
  return { browseId: endpoint.browseId, ...(typeof endpoint.params === "string" ? { params: endpoint.params } : {}) };
}

/** "See all" targets of the albums / singles shelves: they list every release, not just ~10 */
export function getArtistReleaseBrowses(body: unknown): Partial<Record<ReleaseShelf, BrowseRef>> {
  const found: Partial<Record<ReleaseShelf, BrowseRef>> = {};
  walkRecords(body, (record) => {
    const carousel = asRecord(record.musicCarouselShelfRenderer);
    if (!carousel) return false;
    const header = asRecord(asRecord(carousel.header)?.musicCarouselShelfBasicHeaderRenderer);
    const kind = releaseShelfKind(getText(header?.title));
    if (!kind || found[kind]) return true;
    const more = asRecord(
      asRecord(asRecord(asRecord(header?.moreContentButton)?.buttonRenderer)?.navigationEndpoint)?.browseEndpoint,
    );
    const titleLink = asRecord(asRecord(getRuns(header?.title)[0]?.navigationEndpoint)?.browseEndpoint);
    const ref = browseRefOf(more) ?? browseRefOf(titleLink);
    if (ref) found[kind] = ref;
    return true;
  });
  return found;
}

/** every release card of a "see all" grid page (or its continuation) */
export function mapReleaseGrid(
  body: unknown,
  fallbackKind?: ReleaseShelf,
): { albums: ArtistAlbum[]; singles: ArtistRelease[] } {
  const albums: ArtistAlbum[] = [];
  const singles: ArtistRelease[] = [];
  walkRecords(body, (record) => {
    if (!record.musicTwoRowItemRenderer) return false;
    const release = mapReleaseItem(record);
    if (release) {
      const type = releaseTypeOf(record);
      const subtitle = getRuns(asRecord(record.musicTwoRowItemRenderer)?.subtitle)
        .map((run) => typeof run.text === "string" ? run.text.trim().toLocaleLowerCase() : "");
      const explicitlySingle = subtitle.some((part) => /^(?:single|singles|сингл|синглы|сингли)$/.test(part));
      const explicitlyAlbum = subtitle.some((part) => /^(?:album|albums|альбом|альбомы|альбоми)$/.test(part));
      if (explicitlySingle || type === "ep" || (!explicitlyAlbum && fallbackKind === "singles")) {
        singles.push({ ...release, releaseType: type });
      } else {
        albums.push(release);
      }
    }
    return true;
  });
  return { albums, singles };
}

/** continuation token of a grid page, if more releases follow */
export function getGridContinuation(body: unknown): string | undefined {
  let token: string | undefined;
  walkRecords(body, (record) => {
    if (token) return true;
    const next = asRecord(record.nextContinuationData);
    if (typeof next?.continuation === "string") {
      token = next.continuation;
      return true;
    }
    const command = asRecord(asRecord(record.continuationEndpoint)?.continuationCommand);
    if (typeof command?.token === "string") {
      token = command.token;
      return true;
    }
    return false;
  });
  return token;
}

function mapArtistReleases(body: unknown): { albums: ArtistAlbum[]; singles: ArtistRelease[] } {
  const albums: ArtistAlbum[] = [];
  const singles: ArtistRelease[] = [];
  const seen = new Set<string>();
  walkRecords(body, (record) => {
    const carousel = asRecord(record.musicCarouselShelfRenderer);
    if (!carousel) return false;
    const header = asRecord(asRecord(carousel.header)?.musicCarouselShelfBasicHeaderRenderer);
    const kind = releaseShelfKind(getText(header?.title));
    if (!kind) return true;
    for (const raw of asArray(carousel.contents)) {
      const release = mapReleaseItem(raw);
      if (!release || seen.has(release.id)) continue;
      seen.add(release.id);
      if (kind === "albums") albums.push(release);
      else singles.push({ ...release, releaseType: releaseTypeOf(raw) });
    }
    return true;
  });
  return { albums, singles };
}

export function mapInnertubeArtistDetails(id: string, body: unknown): ArtistDetails | null {
  const header = artistHeader(body);
  const name = getText(header?.title);
  if (!name) return null;
  const monthlyListeners = parseMonthlyListeners(header);
  const cover = microformatCover(body, true) ?? coverFromThumbnail(header?.thumbnail, { isArtist: true });
  const releases = mapArtistReleases(body);
  return {
    type: "artist",
    id,
    name,
    verified: isVerifiedArtist(monthlyListeners),
    ...(cover ? { cover } : {}),
    ...(monthlyListeners ? { monthlyListeners } : {}),
    tracks: mapInnertubeBrowseTracks(body, [{ id, name }], true),
    albums: releases.albums,
    singles: releases.singles,
  };
}

export function getArtistTopSongsBrowse(body: unknown): { browseId: string; params?: string } | undefined {
  let found: { browseId: string; params?: string } | undefined;
  walkRecords(body, (record) => {
    if (found) return true;
    const shelf = asRecord(record.musicShelfRenderer);
    if (!shelf) return false;
    const titleRun = getRuns(shelf.title)[0];
    const endpoint =
      asRecord(asRecord(titleRun?.navigationEndpoint)?.browseEndpoint) ??
      asRecord(asRecord(shelf.bottomEndpoint)?.browseEndpoint);
    if (typeof endpoint?.browseId !== "string") return false;
    found = {
      browseId: endpoint.browseId,
      ...(typeof endpoint.params === "string" ? { params: endpoint.params } : {}),
    };
    return true;
  });
  return found;
}
