import { isMusicVideo } from "./innertubeTrackMapper";
import type {
  AlbumDetails,
  ArtistDetails,
  CatalogPlaylistDetails,
  RadioResponse,
  SearchResult,
  SearchType,
  Track,
  TrackDetails,
} from "@/shared/contracts";
import { InnertubeError, postInnertube } from "./innertubeClient";
import {
  getArtistReleaseBrowses,
  getArtistTopSongsBrowse,
  getGridContinuation,
  mapInnertubeArtistDetails,
  mapReleaseGrid,
  type BrowseRef,
} from "./innertubeArtistMapper";
import type { ArtistAlbum, ArtistRelease } from "@/shared/contracts";
import {
  mapInnertubeAlbumDetails,
  mapInnertubeBrowseTracks,
  mapInnertubePlaylistDetails,
} from "./innertubeCollectionMapper";
import { getQueueItems, getTrackItem, mapInnertubeRadioTrack, mapInnertubeTrackDetails } from "./innertubeQueueMapper";
import { searchArtistOfficialVideos, searchCatalog } from "./innertubeSearch";
import { soundcloudCatalog } from "@/shared/media/soundcloud";

export interface RadioOptions {
  k?: number;
  signal?: AbortSignal;
}

const DEFAULT_RADIO_SIZE = 25;

function browse(browseId: string, params?: string, signal?: AbortSignal): Promise<unknown> {
  return postInnertube("browse", { browseId, ...(params ? { params } : {}) }, { signal });
}

function next(body: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
  return postInnertube("next", body, { signal });
}

function notFound(entity: string): InnertubeError {
  return new InnertubeError(`${entity} was not found.`, 404);
}

async function getTrack(trackId: string, signal?: AbortSignal): Promise<TrackDetails> {
  const fromNext = await next({ videoId: trackId }, signal)
    .then((body) => mapInnertubeTrackDetails(getTrackItem(body, trackId)))
    .catch(() => null);
  if (fromNext) return fromNext;

  const searched = await searchCatalog(trackId, "track", signal).catch(() => []);
  const match = searched.find((item) => item.id === trackId);
  if (match?.type === "track") {
    const { type: _type, viewer: _viewer, ...track } = match;
    return track;
  }
  throw notFound("Track");
}

async function getRadio(trackId: string, options: RadioOptions = {}): Promise<RadioResponse> {
  let queue = getQueueItems(await next({ videoId: trackId, playlistId: `RDAMVM${trackId}` }, options.signal));
  if (queue.length === 0) {
    queue = getQueueItems(await next({ videoId: trackId }, options.signal));
  }
  const limit = options.k ?? DEFAULT_RADIO_SIZE;
  const items: Track[] = [];
  for (const raw of queue) {
    // songs only: radio, mixes and My Vibe skip music videos and uploads
    if (isMusicVideo(raw)) continue;
    const track = mapInnertubeRadioTrack(raw);
    if (track) items.push(track);
    if (items.length >= limit) break;
  }
  return { items };
}

async function getAlbum(albumId: string, signal?: AbortSignal): Promise<AlbumDetails> {
  const album = mapInnertubeAlbumDetails(albumId, await browse(albumId, undefined, signal));
  if (!album) throw notFound("Album");
  return album;
}

async function getPlaylist(playlistId: string, signal?: AbortSignal): Promise<CatalogPlaylistDetails> {
  const browseId = /^(VL|MPRE|UC|FE)/.test(playlistId) ? playlistId : `VL${playlistId}`;
  const playlist = mapInnertubePlaylistDetails(playlistId, await browse(browseId, undefined, signal));
  if (!playlist) throw notFound("Playlist");
  return playlist;
}

const MAX_RELEASE_PAGES = 8;

/** walks a "see all" release grid through its continuations */
async function loadAllReleases(
  ref: BrowseRef,
  kind: "albums" | "singles",
  signal?: AbortSignal,
): Promise<{ albums: ArtistAlbum[]; singles: ArtistRelease[] }> {
  const albums: ArtistAlbum[] = [];
  const singles: ArtistRelease[] = [];
  let body = await browse(ref.browseId, ref.params, signal);
  for (let page = 0; page < MAX_RELEASE_PAGES; page++) {
    const mapped = mapReleaseGrid(body, kind);
    albums.push(...mapped.albums);
    singles.push(...mapped.singles);
    const token = getGridContinuation(body);
    if (!token) break;
    body = await postInnertube("browse", { continuation: token }, { signal });
  }
  return { albums, singles };
}

function mergeReleases<T extends { id: string }>(primary: T[], extra: T[]): T[] {
  const seen = new Set(primary.map((r) => r.id));
  return [...primary, ...extra.filter((r) => !seen.has(r.id) && seen.add(r.id))];
}

function mergeArtistTracks(...groups: Track[][]): Track[] {
  const seen = new Set<string>();
  return groups.flat().filter((track) => {
    const title = track.title.toLocaleLowerCase().replace(/ё/g, "е").replace(/[^\p{L}\p{N}]+/gu, "");
    const artists = track.artists.map((artist) => artist.name.toLocaleLowerCase().replace(/ё/g, "е")).sort().join("|");
    const key = `${title}:${artists}`;
    if (!title || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function loadAllTopSongs(
  ref: BrowseRef,
  fallbackArtists: { id: string; name: string }[],
  signal?: AbortSignal,
): Promise<Track[]> {
  const pages: Track[][] = [];
  let body = await browse(ref.browseId, ref.params, signal);
  for (let page = 0; page < 12; page++) {
    pages.push(mapInnertubeBrowseTracks(body, fallbackArtists, true));
    const token = getGridContinuation(body);
    if (!token) break;
    body = await postInnertube("browse", { continuation: token }, { signal });
  }
  return mergeArtistTracks(...pages);
}

async function loadArtistReleaseTracks(releases: { id: string }[], signal?: AbortSignal): Promise<Track[]> {
  const result: Track[][] = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < releases.length) {
      const release = releases[cursor++];
      try {
        const details = mapInnertubeAlbumDetails(release.id, await browse(release.id, undefined, signal));
        result.push(details?.tracks ?? []);
      } catch {
        result.push([]);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, releases.length) }, worker));
  return mergeArtistTracks(...result);
}

async function loadArtist(artistId: string, signal?: AbortSignal): Promise<ArtistDetails | null> {
  const body = await browse(artistId, undefined, signal);
  const artist = mapInnertubeArtistDetails(artistId, body);
  if (!artist) return null;
  const topSongs = getArtistTopSongsBrowse(body);
  const releaseRefs = getArtistReleaseBrowses(body);
  const [allTracks, allAlbums, allSingles] = await Promise.all([
    topSongs
      ? loadAllTopSongs(topSongs, [{ id: artist.id, name: artist.name }], signal).catch(() => [])
      : Promise.resolve([]),
    releaseRefs.albums ? loadAllReleases(releaseRefs.albums, "albums", signal).catch(() => null) : Promise.resolve(null),
    releaseRefs.singles ? loadAllReleases(releaseRefs.singles, "singles", signal).catch(() => null) : Promise.resolve(null),
  ]);
  // Artist pages can omit the Top songs shelf (or its browse endpoint can
  // stop resolving) while still returning the artist header and releases.
  // In that case, recover songs from catalog search, keeping only tracks
  // whose credited artist matches this artist.
  const releases = mergeReleases(
    [...(artist.albums ?? []), ...(allAlbums?.albums ?? [])],
    [...(artist.singles ?? []), ...(allAlbums?.singles ?? []), ...(allSingles?.albums ?? []), ...(allSingles?.singles ?? [])],
  );
  let tracks = mergeArtistTracks(allTracks, artist.tracks);
  const normalizedArtist = artist.name.trim().toLocaleLowerCase();
  const [searchedTracks, officialVideos] = await Promise.all([
    searchCatalog(artist.name, "track", signal).catch(() => []),
    searchArtistOfficialVideos(artist.id, artist.name, signal).catch(() => []),
  ]);
  const matchingSearchTracks = searchedTracks.flatMap((item) => {
    if (item.type !== "track") return [];
    if (!item.artists.some((credit) =>
      credit.id === artist.id || credit.name.trim().toLocaleLowerCase() === normalizedArtist,
    )) return [];
    const { type: _type, viewer: _viewer, ...track } = item;
    return [track];
  });
  tracks = mergeArtistTracks(tracks, matchingSearchTracks, officialVideos);

  // Sparse artist catalogs often have only one or two top-song entries. Load
  // every discovered release (with bounded concurrency) so their full tracklists
  // appear on the artist page and can be played as one queue.
  if (tracks.length < 30 && releases.length > 0) {
    tracks = mergeArtistTracks(tracks, await loadArtistReleaseTracks(releases, signal));
  }

  if (tracks.length < 30) {
    const soundcloudTracks = await soundcloudCatalog.search(artist.name, 30, signal).catch(() => []);
    tracks = mergeArtistTracks(
      tracks,
      soundcloudTracks.filter((track) =>
        track.artists.some((credit) => credit.name.trim().toLocaleLowerCase() === normalizedArtist),
      ),
    );
  }
  // a grid is one kind of release; anything the label sorts the other way stays in its shelf
  const albums = mergeReleases(artist.albums ?? [], [...(allAlbums?.albums ?? []), ...(allAlbums?.singles ?? [])]);
  const singles = mergeReleases(
    artist.singles ?? [],
    [...(allSingles?.singles ?? []), ...(allSingles?.albums ?? [])].map((r) => ({
      releaseType: "single" as const,
      ...r,
    })),
  );
  return {
    ...artist,
    tracks,
    albums,
    singles,
  };
}

async function getArtistImage(artistId: string, signal?: AbortSignal): Promise<string | undefined> {
  return mapInnertubeArtistDetails(artistId, await browse(artistId, undefined, signal))?.cover?.url;
}

async function getArtist(artistId: string, signal?: AbortSignal): Promise<ArtistDetails> {
  const direct = await loadArtist(artistId, signal).catch(() => null);
  if (direct) return direct;
  const searched = await searchCatalog(artistId, "artist", signal).catch(() => []);
  const match = searched.find((item) => item.type === "artist");
  if (match && match.id !== artistId) {
    const resolved = await loadArtist(match.id, signal);
    if (resolved) return resolved;
  }
  throw notFound("Artist");
}

function search(query: string, type: SearchType = "all", signal?: AbortSignal): Promise<SearchResult[]> {
  return searchCatalog(query, type, signal);
}

export const innertubeCatalog = {
  search,
  getArtist,
  getArtistImage,
  getAlbum,
  getPlaylist,
  getTrack,
  getRadio,
};
