// Covers the user picked for their playlists. The server has no cover field for
// user playlists, so the image (downscaled JPEG) is kept on this device.
import { getImportedPlaylistMeta } from "./import/importedPlaylistMeta";

const STORAGE_KEY = "lane_playlist_covers_v1";
const MAX_SIDE = 640;

function readAll(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

/** custom cover, else the original artwork of an imported playlist */
/** covers stored with the playlist on the server (see playlistCoverMarker) */
const serverCovers = new Map<string, string>();

export function rememberServerCover(playlistId: string, coverUrl: string | undefined): void {
  if (coverUrl) serverCovers.set(playlistId, coverUrl);
  else serverCovers.delete(playlistId);
}

export function getPlaylistCover(playlistId: string | null | undefined): string | undefined {
  if (!playlistId) return undefined;
  return readAll()[playlistId] ?? getImportedPlaylistMeta(playlistId)?.coverUrl ?? serverCovers.get(playlistId);
}

export function hasCustomPlaylistCover(playlistId: string | null | undefined): boolean {
  return Boolean(playlistId && readAll()[playlistId]);
}

export async function imageFileToCover(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(MAX_SIDE, Math.min(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = side;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  // centre crop to a square
  const crop = Math.min(bitmap.width, bitmap.height);
  ctx.drawImage(bitmap, (bitmap.width - crop) / 2, (bitmap.height - crop) / 2, crop, crop, 0, 0, side, side);
  return canvas.toDataURL("image/jpeg", 0.88);
}

export function setPlaylistCover(playlistId: string, dataUrl: string | null): void {
  const all = readAll();
  if (dataUrl) all[playlistId] = dataUrl;
  else delete all[playlistId];
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    throw new Error("Not enough space to store the cover");
  }
  window.dispatchEvent(new Event("library:changed"));
}
