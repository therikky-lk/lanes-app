import { useEffect, useRef } from "react";
import { usePlayerStore } from "../store/playerStore";
import { useIsTrackLiked, useLikeTrack, useUnlikeTrack } from "@/features/library/hooks";
import { isNativeApp } from "@/shared/platform/native";
import { LaneAudio, onNativeLike, onNativeRepeat } from "@/shared/platform/nativeAudio";
import { playerEngine } from "../engine/playerEngine";
import { isRadioContext, nextRepeatMode } from "../engine/radioMode";

/** Android: keeps the media notification's like button in sync with the library */
export function useNativeMediaSync(): void {
  const native = isNativeApp();
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const repeat = usePlayerStore((s) => s.repeat);
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
    void LaneAudio.setRepeat({ mode: repeat === "one" ? 2 : repeat === "all" ? 1 : 0 }).catch(() => undefined);
  }, [native, repeat]);

  useEffect(() => {
    if (!native) return;
    onNativeRepeat(() => {
      const st = usePlayerStore.getState();
      playerEngine.setRepeat(nextRepeatMode(st.repeat, isRadioContext(st.playbackContext)));
    });
    return () => onNativeRepeat(null);
  }, [native]);

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
