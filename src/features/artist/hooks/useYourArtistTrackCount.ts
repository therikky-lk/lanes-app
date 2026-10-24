import { useMemo } from "react";
import { useLikedTracks } from "@/features/library/hooks/useLikedTracks";
import type { Track } from "@/shared/types";

const norm = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export function countArtistTracks(tracks: readonly Track[], artist: { id?: string | null; name?: string | null }): number {
  const id = artist.id && artist.id !== "unknown" ? artist.id : "";
  const name = artist.name ? norm(artist.name) : "";
  if (!id && !name) return 0;
  let count = 0;
  for (const track of tracks) {
    const list = track.artistList ?? [];
    const byList = list.some((a) => (id && a.id === id) || (name && a.name && norm(a.name) === name));
    const byText =
      !byList &&
      ((id.length > 0 && track.artistId === id) ||
        (name.length > 0 &&
          (track.artists ?? "")
            .split(/,|&| feat\.? | ft\.? /i)
            .some((part) => norm(part) === name)));
    if (byList || byText) count += 1;
  }
  return count;
}

/** how many of the artist's songs are in your liked songs */
export function useYourArtistTrackCount(artist: { id?: string | null; name?: string | null }): {
  count: number;
  isLoading: boolean;
} {
  const { data, isLoading } = useLikedTracks();
  const count = useMemo(() => countArtistTracks(data.tracks, artist), [data.tracks, artist.id, artist.name]);
  return { count, isLoading };
}
