// Covers the user picked for their playlists. The server has no cover field for
// user playlists, so a compact data-image travels in the playlist description.
import { getImportedPlaylistMeta } from "./import/importedPlaylistMeta";

const STORAGE_KEY = "lane_playlist_covers_v1";
const MAX_SIDE = 192;
const MIN_SIDE = 64;
const MAX_SYNCED_COVER_LENGTH = 6_000;

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
  return Boolean(playlistId && (readAll()[playlistId] || serverCovers.get(playlistId)?.startsWith("data:image/")));
}

async function compactCover(source: Blob): Promise<string> {
  let bitmap: ImageBitmap | HTMLImageElement;
  let dispose = () => {};
  try {
    bitmap = await createImageBitmap(source);
  } catch {
    // Some browsers/formats cannot use createImageBitmap but can still decode
    // the same local file through a normal object URL.
    const url = URL.createObjectURL(source);
    const image = new Image();
    image.decoding = "async";
    try {
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("image decode failed"));
        image.src = url;
      });
      bitmap = image;
      dispose = () => URL.revokeObjectURL(url);
    } catch (error) {
      URL.revokeObjectURL(url);
      throw error;
    }
  }

  try {
    const width = bitmap instanceof HTMLImageElement ? bitmap.naturalWidth : bitmap.width;
    const height = bitmap instanceof HTMLImageElement ? bitmap.naturalHeight : bitmap.height;
    const crop = Math.min(width, height);
    let side = Math.min(MAX_SIDE, crop);
    let quality = 0.76;
    let result = "";

    while (side >= MIN_SIDE) {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = side;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas unavailable");
      // centre crop to a square
      ctx.drawImage(bitmap, (width - crop) / 2, (height - crop) / 2, crop, crop, 0, 0, side, side);
      result = canvas.toDataURL("image/jpeg", quality);
      if (result.length <= MAX_SYNCED_COVER_LENGTH) break;
      side = Math.floor(side * 0.8);
      quality = Math.max(0.62, quality - 0.06);
    }

    return result;
  } finally {
    dispose();
    if (typeof ImageBitmap !== "undefined" && bitmap instanceof ImageBitmap) bitmap.close();
  }
}

export async function imageFileToCover(file: File): Promise<string> {
  return compactCover(file);
}

/** Recompress a legacy local cover before syncing it through playlist metadata. */
export async function compactPlaylistCover(dataUrl: string): Promise<string> {
  if (!dataUrl.startsWith("data:image/")) return dataUrl;
  const blob = await fetch(dataUrl).then((response) => response.blob());
  return compactCover(blob);
}

export function getCustomPlaylistCover(playlistId: string | null | undefined): string | undefined {
  return playlistId ? readAll()[playlistId] : undefined;
}

export function setPlaylistCover(playlistId: string, dataUrl: string | null, options?: { notify?: boolean }): void {
  const all = readAll();
  if (dataUrl) all[playlistId] = dataUrl;
  else delete all[playlistId];
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    throw new Error("Not enough space to store the cover");
  }
  if (options?.notify !== false) window.dispatchEvent(new Event("library:changed"));
}
