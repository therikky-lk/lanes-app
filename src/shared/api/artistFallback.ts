import type { ArtistDetails } from "@/shared/contracts";
import { isAbortError } from "@/shared/utils/abort";

function mergeById<T extends { id: string }>(primary: T[], extra: T[]): T[] {
  const seen = new Set<string>();
  return [...primary, ...extra].filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

/**
 * Artist responses have no total count: a successful response can still be a
 * regionally restricted catalog. Check the server too, without letting an
 * unavailable/slower fallback erase the client result.
 */
export async function loadArtistWithFallback(
  client: () => Promise<ArtistDetails>,
  server: () => Promise<ArtistDetails>,
  timeoutMs = 4000,
): Promise<ArtistDetails> {
  let artist: ArtistDetails;
  try {
    artist = await client();
  } catch (error) {
    if (isAbortError(error)) throw error;
    return server();
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const fallback = await Promise.race([
      server(),
      new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), timeoutMs); }),
    ]);
    if (!fallback || fallback.id !== artist.id) return artist;
    return {
      ...artist,
      tracks: mergeById(artist.tracks, fallback.tracks),
      albums: mergeById(artist.albums, fallback.albums).sort((a, b) => (b.year ?? 0) - (a.year ?? 0)),
      singles: mergeById(artist.singles, fallback.singles).sort((a, b) => (b.year ?? 0) - (a.year ?? 0)),
    };
  } catch (error) {
    if (isAbortError(error)) throw error;
    return artist;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
