import { useEffect, useRef } from "react";
import { usePlayerStore } from "../store/playerStore";
import { useIsTrackLiked, useLikeTrack, useUnlikeTrack } from "@/features/library/hooks";
import { isNativeApp } from "@/shared/platform/native";
import { LaneAudio, onNativeLike } from "@/shared/platform/nativeAudio";

/** Android: keeps the media notification's like button in sync with the library */
export function useNativeMediaSync(): void {
  const native = isNativeApp();
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const isLiked = useIsTrackLiked(currentTrack?.id);
  const likeMutation = useLikeTrack();
  const unlikeMutation = useUnlikeTrack();
  const state = useRef({ currentTrack, isLiked, likeMutation, unlikeMutation });
  state.current = { currentTrack, isLiked, likeMutation, unlikeMutation };

  useEffect(() => {
    if (!native) return;
    void LaneAudio.setLiked({ liked: isLiked }).catch(() => undefined);
  }, [native, isLiked, currentTrack?.id]);

  useEffect(() => {
    if (!native) return;
    onNativeLike(() => {
      const { currentTrack: track, isLiked: liked, likeMutation: like, unlikeMutation: unlike } = state.current;
      if (!track) return;
      if (liked) unlike.mutate(track.id);
      else like.mutate(track.id);
    });
    return () => onNativeLike(null);
  }, [native]);
}
