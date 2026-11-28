import { api } from "@/shared/api";
import { sameArtistName } from "@/shared/media/artistIdentity";
import type { AlbumDetails } from "@/shared/contracts";
import { isAppleReleaseId } from "@/shared/media/innertube/appleReleaseCatalog";

const key = (title: string) => title.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();

export function isVerifiedRelease(album: AlbumDetails, id: string, title?: string | null, artistName?: string | null): boolean {
  if (album.id !== id || (title && key(album.title) !== key(title))) return false;
  // These release IDs come directly from the artist's Apple discography.
  if (!artistName || isAppleReleaseId(id)) return true;
  return [...album.artists, ...album.tracks.flatMap(track => track.artists)]
    .some(credit => sameArtistName(credit.name, artistName));
}

export async function loadVerifiedRelease(id: string, title?: string | null, artistName?: string | null): Promise<AlbumDetails | null> {
  const album = await api.getAlbum(id).catch(() => null);
  return album && isVerifiedRelease(album, id, title, artistName) ? album : null;
}
