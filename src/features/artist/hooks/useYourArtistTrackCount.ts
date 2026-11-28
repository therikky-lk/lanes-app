import { useMemo } from "react";
import { useLikedTracks } from "@/features/library/hooks/useLikedTracks";
import { sameArtistName } from "@/shared/media/artistIdentity";
import type { Track } from "@/shared/types";

const norm = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export function findArtistTracks(tracks: readonly Track[], artist: { id?: string | null; name?: string | null }): Track[] {
  const id = artist.id && artist.id !== "unknown" ? artist.id : "";
  const name = artist.name ?? "";
  const normalizedName = norm(name);
  const matchesName = (credit: string) => !!normalizedName &&
    (norm(credit) === normalizedName || sameArtistName(credit, name));
  if (!id && !name) return [];
  return tracks.filter(track => {
    const list = track.artistList ?? [];
    const byList = list.some((a) => (id && a.id === id) || (a.name && matchesName(a.name)));
    const byText =
      !byList &&
      ((id.length > 0 && track.artistId === id) ||
        (normalizedName.length > 0 &&
          (track.artists ?? "").split(/,|&| feat\.? | ft\.? /i).some(matchesName)));
    return byList || byText;
  });
}

export function countArtistTracks(tracks: readonly Track[], artist: { id?: string | null; name?: string | null }): number {
  return findArtistTracks(tracks, artist).length;
}

/** how many of the artist's songs are in your liked songs */
export function useYourArtistTrackCount(artist: { id?: string | null; name?: string | null }): {
  count: number;
  isLoading: boolean;
} {
  const { tracks, isLoading } = useYourArtistTracks(artist);
  return { count: tracks.length, isLoading };
}

export function useYourArtistTracks({ id, name }: { id?: string | null; name?: string | null }) {
  const { data, isLoading } = useLikedTracks();
  const tracks = useMemo(() => findArtistTracks(data.tracks, { id, name }), [data.tracks, id, name]);
  return { tracks, isLoading };
}
