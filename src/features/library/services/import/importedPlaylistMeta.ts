import type { ImportSource } from "@/shared/contracts";
import { canSyncCoverMarker, withCoverMarker } from "../playlistCoverMarker";

// The server keeps only title/description for playlists. What a playlist was
// imported from (and the original cover art) is remembered on this device so the
// playlist page can show it Spotify-style.

export interface ImportedPlaylistMeta {
  source: ImportSource;
  sourceUrl: string;
  coverUrl?: string;
  owner?: string;
  importedAt: string;
}

const STORAGE_KEY = "lane_imported_playlists_v1";
const pendingBySourceUrl = new Map<string, { coverUrl?: string; owner?: string }>();
const spotifyCoverLookups = new Set<string>();

function readAll(): Record<string, ImportedPlaylistMeta> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") as Record<string, ImportedPlaylistMeta>;
  } catch {
    return {};
  }
}

/** called by a source parser while the import runs */
export function rememberSourceMeta(sourceUrl: string, meta: { coverUrl?: string; owner?: string }): void {
  pendingBySourceUrl.set(sourceUrl, { ...pendingBySourceUrl.get(sourceUrl), ...meta });
}

/** called once the playlist exists on the server */
export function saveImportedPlaylistMeta(playlistId: string, source: ImportSource, sourceUrl: string): void {
  let key = sourceUrl;
  if (!pendingBySourceUrl.has(key)) {
    const norm = (u: string) => u.trim().replace(/[?#].*$/, "").replace(/\/+$/, "");
    key = [...pendingBySourceUrl.keys()].find((k) => norm(k) === norm(sourceUrl)) ?? key;
  }
  const pending = pendingBySourceUrl.get(key);
  pendingBySourceUrl.delete(key);
  try {
    const all = readAll();
    all[playlistId] = {
      source,
      sourceUrl,
      ...(pending?.coverUrl ? { coverUrl: pending.coverUrl } : {}),
      ...(pending?.owner ? { owner: pending.owner } : {}),
      importedAt: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    window.dispatchEvent(new Event("library:changed"));
  } catch {}
  // keep the cover with the playlist on the server too, for the other devices
  const cover = pending?.coverUrl;
  if (cover) {
    void import("@/shared/api").then(({ api }) =>
      api
        .getUserPlaylist(playlistId)
        .then((detail) => canSyncCoverMarker(detail.playlist.description, cover)
          ? api.updatePlaylist(playlistId, { description: withCoverMarker(detail.playlist.description, cover) })
          : undefined)
        .catch(() => undefined),
    );
  }
}

export function getImportedPlaylistMeta(playlistId: string | null | undefined): ImportedPlaylistMeta | null {
  if (!playlistId) return null;
  return readAll()[playlistId] ?? null;
}

export function getImportedPlaylistIds(source: ImportSource): Set<string> {
  return new Set(Object.entries(readAll()).filter(([, meta]) => meta?.source === source).map(([id]) => id));
}

/** Older imports may have the Spotify source saved but no usable cover marker. */
export async function recoverSpotifyPlaylistCover(playlistId: string): Promise<void> {
  const meta = getImportedPlaylistMeta(playlistId);
  if (meta?.source !== "spotify" || !meta.sourceUrl || meta.coverUrl || spotifyCoverLookups.has(playlistId)) return;
  spotifyCoverLookups.add(playlistId);
  try {
    const { parseSpotifyUrl } = await import("./sources/spotify/spotifyUrl");
    const { fetchSpotifyEmbed } = await import("./sources/spotify/spotifyEmbed");
    const { id, type } = parseSpotifyUrl(meta.sourceUrl);
    const result = await fetchSpotifyEmbed(type, id, "");
    if (!result.coverUrl) return;
    const all = readAll();
    if (all[playlistId]?.sourceUrl !== meta.sourceUrl || all[playlistId]?.coverUrl) return;
    all[playlistId] = { ...all[playlistId], coverUrl: result.coverUrl };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    window.dispatchEvent(new Event("library:changed"));
  } catch { /* The playlist still uses its track covers if Spotify is unavailable. */ }
}
