import type { AlbumDetails } from "@/shared/contracts";
import { isAbortError } from "@/shared/utils/abort";

/** A failed/shorter optional fallback must not erase a playable album. */
export async function loadAlbumWithFallback(
  client: () => Promise<AlbumDetails>,
  server: () => Promise<AlbumDetails>,
  timeoutMs = 4000,
): Promise<AlbumDetails> {
  let album: AlbumDetails;
  try {
    album = await client();
  } catch (error) {
    if (isAbortError(error)) throw error;
    return server();
  }
  if (album.tracks.length > 0 && (!album.trackCount || album.tracks.length >= album.trackCount)) return album;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const fallback = await Promise.race([
      server(),
      new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), timeoutMs); }),
    ]);
    return fallback && fallback.tracks.length > album.tracks.length ? fallback : album;
  } catch (error) {
    if (isAbortError(error) || !album.tracks.length) throw error;
    return album;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
