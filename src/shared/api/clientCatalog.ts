import { innertubeCatalog } from "@/shared/media/innertube";
import { isSoundCloudCatalogId, isSoundCloudUrl, resolveSoundCloudUrl, soundcloudCatalog } from "@/shared/media/soundcloud";
import { audiusCatalog, isAudiusId } from "@/shared/media/audius";
import { isJunkVideo, matchesQueryWell } from "@/shared/media/innertube/innertubeSearchRanking";
import { isAbortError } from "@/shared/utils/abort";
import { log } from "@/shared/utils/logger";
import type {
  AlbumDetails,
  ArtistDetails,
  CatalogPlaylistDetails,
  RadioResponse,
  SearchResponse,
  SearchType,
  Track,
  TrackDetails,
} from "@/shared/contracts";

export function isClientCatalogId(id: string): boolean {
  return !isSoundCloudCatalogId(id) && !isAudiusId(id);
}

const norm = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/**
 * YouTube results first; SoundCloud and Audius add full tracks YouTube doesn't
 * have (Russian underground, sped up versions…). SoundCloud only steps in
 * when YouTube found little that matches the query, so it never crowds out
 * the songs themselves.
 */
async function withAudius(items: SearchResponse["items"], query: string, type: SearchType): Promise<SearchResponse["items"]> {
  if (type !== "all" && type !== "track") return items;
  const ytMatches = items.filter(
    (item) => item.type === "track" && matchesQueryWell(query, item.title, item.artists.map((a) => a.name)),
  ).length;
  const [audius, soundcloud] = await Promise.all([
    audiusCatalog.search(query, 8).catch(() => []),
    ytMatches < 3 ? soundcloudCatalog.search(query, 12).catch(() => []) : Promise.resolve([]),
  ]);
  const extra = [
    ...soundcloud.filter(
      (t) =>
        t.durationMs > 60_000 &&
        !isJunkVideo(t.title, query) &&
        matchesQueryWell(query, t.title, t.artists.map((a) => a.name)),
    ),
    ...audius,
  ];
  if (extra.length === 0) return items;
  const have = new Set(
    items.flatMap((item) =>
      item.type === "track" ? [norm(`${item.title} ${item.artists.map((a) => a.name).join(" ")}`)] : [],
    ),
  );
  const fresh = extra
    .filter((t) => !have.has(norm(`${t.title} ${t.artists.map((a) => a.name).join(" ")}`)))
    .slice(0, type === "track" ? 10 : 5)
    .map((t) => ({ ...t, type: "track" as const }));
  return [...items, ...fresh];
}

async function preferClient<T>(label: string, client: () => Promise<T>, server: () => Promise<T>): Promise<T> {
  try {
    return await client();
  } catch (error) {
    if (isAbortError(error)) throw error;
    log("yellow", "catalog", `${label} failed on client, using server fallback`, error);
    return server();
  }
}

const SNAPSHOT_TIMEOUT_MS = 4000;

async function resolveSnapshot(id: string): Promise<Track | undefined> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SNAPSHOT_TIMEOUT_MS);
  const catalog = isSoundCloudCatalogId(id) ? soundcloudCatalog : isAudiusId(id) ? audiusCatalog : innertubeCatalog;
  try {
    const details = await catalog.getTrack(id, controller.signal);
    return {
      // keep the id the caller asked for: the server files a like under the
      // snapshot id, and the heart is looked up by the playing track's id, so
      // a canonicalised id here makes the like vanish on the next refetch
      id,
      title: details.title,
      artists: details.artists,
      durationMs: details.durationMs,
      ...(details.album ? { album: details.album } : {}),
      ...(details.cover ? { cover: details.cover } : {}),
      ...(details.explicit !== undefined ? { explicit: details.explicit } : {}),
    };
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

export const clientCatalog = {
  resolveSnapshot,

  async search(query: string, type: SearchType, server: () => Promise<SearchResponse>): Promise<SearchResponse> {
    if (isSoundCloudUrl(query)) return { items: await resolveSoundCloudUrl(query, type).catch(() => []) };
    const [main] = await Promise.all([
      preferClient("search", async () => ({ items: await innertubeCatalog.search(query, type) }), server),
    ]);
    return { items: await withAudius(main.items, query, type) };
  },

  getTrack(id: string, server: () => Promise<TrackDetails>): Promise<TrackDetails> {
    if (isSoundCloudCatalogId(id)) return soundcloudCatalog.getTrack(id);
    if (isAudiusId(id)) return audiusCatalog.getTrack(id);
    return preferClient("track", () => innertubeCatalog.getTrack(id), server);
  },

  getRadio(id: string, k: number | undefined, server: () => Promise<RadioResponse>): Promise<RadioResponse> {
    if (isSoundCloudCatalogId(id)) return soundcloudCatalog.getRadio(id, k);
    if (isAudiusId(id)) return audiusCatalog.getRadio(id, k);
    return preferClient("radio", () => innertubeCatalog.getRadio(id, { k }), server);
  },

  getAlbum(id: string, server: () => Promise<AlbumDetails>): Promise<AlbumDetails> {
    if (isSoundCloudCatalogId(id)) return soundcloudCatalog.getAlbum(id);
    return preferClient("album", () => innertubeCatalog.getAlbum(id), server);
  },

  async getArtistImage(id: string): Promise<string | undefined> {
    if (isSoundCloudCatalogId(id)) return soundcloudCatalog.getArtistImage(id).catch(() => undefined);
    return innertubeCatalog.getArtistImage(id).catch(() => undefined);
  },

  getArtist(id: string, server: () => Promise<ArtistDetails>): Promise<ArtistDetails> {
    if (isSoundCloudCatalogId(id)) return soundcloudCatalog.getArtist(id);
    return preferClient("artist", () => innertubeCatalog.getArtist(id), server);
  },

  getPlaylist(id: string, server: () => Promise<CatalogPlaylistDetails>): Promise<CatalogPlaylistDetails> {
    if (isSoundCloudCatalogId(id)) return soundcloudCatalog.getPlaylist(id);
    return preferClient("playlist", () => innertubeCatalog.getPlaylist(id), server);
  },
};
