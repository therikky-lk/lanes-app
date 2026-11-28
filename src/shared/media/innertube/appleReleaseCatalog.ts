import type { AlbumDetails, ArtistAlbum, ArtistDetails, Cover, SearchArtistItem, Track } from "@/shared/contracts";
import { sameArtistName } from "@/shared/media/artistIdentity";
import { resolveAlbumAudioTracks } from "./albumAudioTracks";

type AppleEntry = {
  wrapperType?: string;
  kind?: string;
  artistName?: string;
  artistId?: number;
  collectionId?: number;
  collectionName?: string;
  collectionExplicitness?: string;
  artworkUrl100?: string;
  releaseDate?: string;
  trackCount?: number;
  trackId?: number;
  trackName?: string;
  trackTimeMillis?: number;
  trackExplicitness?: string;
  discNumber?: number;
  trackNumber?: number;
};

const normalize = (title: string) => title.normalize("NFC").trim().toLowerCase();

export const isAppleReleaseId = (id: string) => /^apple-release:\d+$/.test(id);
export const isAppleArtistId = (id: string) => /^apple-artist:\d+$/.test(id);

export function appleArtistIdFromUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "music.apple.com") return;
    const id = /^\/[a-z]{2}\/artist\/(?:[^/]+\/)?(\d+)\/?$/i.exec(url.pathname)?.[1];
    if (id) return `apple-artist:${id}`;
  } catch { /* not a URL */ }
}

async function request(endpoint: "search" | "lookup", params: Record<string, string>, signal?: AbortSignal): Promise<AppleEntry[]> {
  const timeout = AbortSignal.timeout(4000);
  const query = new URLSearchParams({ country: "US", ...params });
  const response = await fetch(`https://itunes.apple.com/${endpoint}?${query}`, {
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  if (!response.ok) throw new Error("Release metadata is unavailable");
  const body = await response.json() as { results?: AppleEntry[] };
  return Array.isArray(body.results) ? body.results : [];
}

function coverOf(entry: AppleEntry): Cover | undefined {
  if (!entry.artworkUrl100 || !/^https:\/\/[a-z0-9.-]+\.mzstatic\.com\//i.test(entry.artworkUrl100)) return;
  return { url: entry.artworkUrl100.replace(/\/100x100bb\./, "/600x600bb."), width: 600, height: 600 };
}

function mapAppleArtistResult(entry: AppleEntry): SearchArtistItem | undefined {
  if (entry.wrapperType !== "artist" || !entry.artistId || !entry.artistName) return;
  return { type: "artist", id: `apple-artist:${entry.artistId}`, name: entry.artistName };
}

export async function searchAppleArtists(query: string, signal?: AbortSignal): Promise<SearchArtistItem[]> {
  const linkedId = appleArtistIdFromUrl(query);
  const entries = linkedId
    ? await request("lookup", { id: linkedId.split(":")[1] }, signal)
    : await request("search", { term: query, entity: "musicArtist", media: "music", limit: "12" }, signal);
  const results = entries.flatMap(entry => mapAppleArtistResult(entry) ?? []);
  if (linkedId) return results.filter(result => result.id === linkedId);
  const exact = results.filter(result => sameArtistName(result.name, query));
  // Offer visually similar short names as separate profiles, never as aliases.
  const short = normalize(query);
  if (/^[aа]\d+$/u.test(short)) {
    const lookalikes = results.filter(result => normalize(result.name).replace(/^а/u, "a") === short.replace(/^а/u, "a"));
    if (lookalikes.length) return [...lookalikes.filter(result => /[а-я]/iu.test(result.name)), ...lookalikes.filter(result => !/[а-я]/iu.test(result.name))].slice(0, 6);
  }
  if (exact.length) return exact;
  const queryParts = normalize(query).split(/\s+/);
  const named = results.filter(result => queryParts.includes(normalize(result.name)));
  return named.length ? named : results.length === 1 ? results : [];
}

const releaseTitle = (title: string) => title.replace(/\s+-\s+(?:Single|EP)$/i, "");

export function mergeSupplementalAlbums(existing: ArtistAlbum[], releases: AppleEntry[], artistName: string): ArtistAlbum[] {
  const titles = new Set(existing.map(album => normalize(album.title)));
  const additional = releases.flatMap((entry): ArtistAlbum[] => {
    const title = entry.collectionName?.trim();
    if (entry.wrapperType !== "collection" || !entry.collectionId || !title ||
      !entry.artistName || !sameArtistName(entry.artistName, artistName) ||
      (entry.trackCount ?? 0) < 2 || /\s-\s(single|ep)$/i.test(title) || titles.has(normalize(title))) return [];
    titles.add(normalize(title));
    const year = Number(entry.releaseDate?.slice(0, 4)) || undefined;
    return [{ id: `apple-release:${entry.collectionId}`, title, year, cover: coverOf(entry),
      explicit: entry.collectionExplicitness === "explicit" }];
  });
  return additional.length ? [...existing, ...additional].sort((a, b) => (b.year ?? 0) - (a.year ?? 0)) : existing;
}

export async function supplementArtistAlbums(existing: ArtistAlbum[], name: string, signal?: AbortSignal): Promise<ArtistAlbum[]> {
  const term = sameArtistName(name, "Billie Eilish") ? "Billie Eilish" : name;
  const releases = await request("search", { term, entity: "album", attribute: "artistTerm", limit: "35" }, signal);
  return mergeSupplementalAlbums(existing, releases, name);
}

export function mapAppleAlbum(id: string, entries: AppleEntry[]): AlbumDetails | null {
  const collectionId = Number(id.split(":")[1]);
  const album = entries.find(entry => entry.wrapperType === "collection" && entry.collectionId === collectionId);
  if (!album?.collectionName || !album.artistName) return null;
  const title = releaseTitle(album.collectionName);
  const cover = coverOf(album);
  const artists = [{
    id: album.artistId && !/[,&]/.test(album.artistName) ? `apple-artist:${album.artistId}` : "",
    name: album.artistName,
  }];
  const tracks = entries.filter(entry => entry.kind === "song" && entry.collectionId === collectionId)
    .sort((a, b) => (a.discNumber ?? 1) - (b.discNumber ?? 1) || (a.trackNumber ?? 0) - (b.trackNumber ?? 0))
    .flatMap((entry): Track[] => entry.trackName && entry.trackId ? [{
      id: `unavailable:apple:${entry.trackId}`, title: entry.trackName, artists,
      durationMs: entry.trackTimeMillis ?? 0, album: { id, title }, cover,
      explicit: entry.trackExplicitness === "explicit", catalogUnavailable: true,
    }] : []);
  return { type: "album", id, title, artists, cover, tracks, trackCount: tracks.length,
    year: Number(album.releaseDate?.slice(0, 4)) || undefined, releaseDate: album.releaseDate?.slice(0, 10) };
}

export async function getAppleCatalogArtist(id: string, signal?: AbortSignal): Promise<ArtistDetails> {
  if (!isAppleArtistId(id)) throw new Error("Invalid catalog artist ID");
  const lookupId = id.split(":")[1];
  const [releases, songs] = await Promise.all([
    request("lookup", { id: lookupId, entity: "album", limit: "100" }, signal),
    request("lookup", { id: lookupId, entity: "song", limit: "50" }, signal),
  ]);
  const artist = releases.map(mapAppleArtistResult).find(entry => entry?.id === id);
  if (!artist) throw new Error("Artist is unavailable");
  const details: ArtistDetails = { ...artist, verified: false, albums: [], singles: [], tracks: [] };
  for (const entry of releases) {
    if (entry.wrapperType !== "collection" || !entry.collectionId || !entry.collectionName) continue;
    const release = {
      id: `apple-release:${entry.collectionId}`, title: releaseTitle(entry.collectionName), cover: coverOf(entry),
      year: Number(entry.releaseDate?.slice(0, 4)) || undefined, trackCount: entry.trackCount,
      explicit: entry.collectionExplicitness === "explicit",
    };
    if (/\s-\sEP$/i.test(entry.collectionName)) details.singles.push({ ...release, releaseType: "ep" });
    else if (entry.trackCount === 1 || /\s-\sSingle$/i.test(entry.collectionName)) details.singles.push({ ...release, releaseType: "single" });
    else details.albums.push(release);
  }
  const tracks = songs.flatMap((entry): Track[] => {
    if (entry.kind !== "song" || !entry.trackId || !entry.trackName) return [];
    return [{
      id: `unavailable:apple:${entry.trackId}`, title: entry.trackName,
      artists: [{ id, name: artist.name }],
      album: entry.collectionId && entry.collectionName
        ? { id: `apple-release:${entry.collectionId}`, title: releaseTitle(entry.collectionName) } : undefined,
      cover: coverOf(entry), durationMs: entry.trackTimeMillis ?? 0,
      explicit: entry.trackExplicitness === "explicit", catalogUnavailable: true,
    }];
  });
  details.cover = details.albums[0]?.cover ?? coverOf(songs.find(entry => entry.artistId === Number(lookupId) && entry.kind === "song") ?? {}) ?? tracks[0]?.cover;
  details.tracks = await resolveAlbumAudioTracks(tracks, signal, true);
  return details;
}

export async function getAppleCatalogAlbum(id: string, signal?: AbortSignal): Promise<AlbumDetails> {
  if (!isAppleReleaseId(id)) throw new Error("Invalid release ID");
  const result = mapAppleAlbum(id, await request("lookup", { id: id.split(":")[1], entity: "song", limit: "200" }, signal));
  if (!result) throw new Error("Release is unavailable");
  // Metadata results are not audio. Only expose confirmed matches, within a
  // bounded request window, and leave the other tracks visibly unavailable.
  result.tracks = await resolveAlbumAudioTracks(result.tracks, signal, true);
  return result;
}
