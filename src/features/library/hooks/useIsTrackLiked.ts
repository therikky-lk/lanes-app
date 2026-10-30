import { useMemo } from "react";
import { useLikedTracks } from "./useLikedTracks";

export function useIsTrackLiked(trackId: string | undefined): boolean {
  const { data, isLoading } = useLikedTracks();
  return useMemo(() => {
    if (isLoading || !trackId || !data?.tracks) return false;
    return data.tracks.some((t) => Boolean(t.id) && t.id === trackId);
  }, [trackId, data, isLoading]);
}
