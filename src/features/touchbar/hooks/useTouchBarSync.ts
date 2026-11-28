import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useShallow } from "zustand/react/shallow";
import { playerEngine } from "@/features/player/engine/playerEngine";
import { usePlayerStore } from "@/features/player/store/playerStore";
import { useLyricsStore } from "@/features/lyrics";
import { useIsTrackLiked, useLikeTrack, useUnlikeTrack } from "@/features/library/hooks";
import type { TouchBarAction, TouchBarStatePayload } from "../contracts";

export function useTouchBarSync() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const nativeTouchBar = window.linerElectron?.platform === "darwin";
  const { status, currentTrack, fullscreen } = usePlayerStore(useShallow(s => ({
    status: s.status,
    currentTrack: s.currentTrack,
    fullscreen: nativeTouchBar && s.fullscreen,
  })));
  const isLiked = useIsTrackLiked(currentTrack?.id);
  const likeMutation = useLikeTrack();
  const unlikeMutation = useUnlikeTrack();
  const isTogglingLike = useRef(false);
  const [syncRequestTick, setSyncRequestTick] = useState(0);
  const fullscreenLyrics = fullscreen || pathname === "/player";

  useEffect(() => {
    return window.linerElectron?.onTouchBarRequestSync?.(() => setSyncRequestTick(t => t + 1));
  }, []);

  useEffect(() => {
    return window.linerElectron?.onTouchBarAction?.((action: TouchBarAction) => {
      switch (action.type) {
        case "togglePlay": void playerEngine.togglePlayPause(); break;
        case "play": void playerEngine.resume(); break;
        case "pause": playerEngine.pause(); break;
        case "next": void playerEngine.skipNext(true); break;
        case "prev": void playerEngine.skipPrevious(); break;
        case "seek":
          if (typeof action.payload?.positionMs === "number") playerEngine.seek(action.payload.positionMs);
          break;
        case "volume":
          if (typeof action.payload?.volume === "number") playerEngine.setVolume(action.payload.volume);
          break;
        case "toggleShuffle":
          playerEngine.setShuffle(!playerEngine.getSnapshot().shuffle);
          break;
        case "toggleFullscreen":
          if (pathname === "/player") navigate(-1);
          else usePlayerStore.getState().setFullscreen(!usePlayerStore.getState().fullscreen);
          break;
        case "adjustOffset":
          if (typeof action.payload?.deltaMs === "number") useLyricsStore.getState().adjustOffset(action.payload.deltaMs);
          break;
        case "like":
          if (currentTrack && !isTogglingLike.current) {
            isTogglingLike.current = true;
            const onSettled = () => { isTogglingLike.current = false; };
            (isLiked ? unlikeMutation : likeMutation).mutate(currentTrack.id, { onSettled });
          }
          break;
        case "navigate":
          if (action.payload?.route) navigate(action.payload.route);
          break;
      }
    });
  }, [currentTrack, isLiked, likeMutation, unlikeMutation, navigate, pathname]);

  useEffect(() => {
    const bridge = window.linerElectron;
    if (!bridge?.touchbarUpdateState) return;

    const track = currentTrack
      ? { id: currentTrack.id, title: currentTrack.title, artist: currentTrack.artists || "" }
      : null;
    let lastText: string | undefined;
    const publish = (text: string) => {
      if (lastText === text) return;
      lastText = text;
      const payload: TouchBarStatePayload = { status, track, activeLyricText: text };
      bridge.touchbarUpdateState(payload);
    };

    // Windows taskbar controls and desktop sleep prevention only need playback
    // state, not time updates or a copy of the song's lyrics.
    if (!nativeTouchBar || !track) {
      publish("");
      return;
    }

    const audio = document.getElementById("liner-audio") as HTMLAudioElement | null;
    const update = () => {
      const { syncedLines, activeLineIndex } = useLyricsStore.getState();
      if (!hasTiming) {
        publish("");
        return;
      }
      const positionMs = audio && Number.isFinite(audio.currentTime) && !audio.seeking
        ? audio.currentTime * 1000 : usePlayerStore.getState().positionMs;
      let index = fullscreenLyrics ? activeLineIndex ?? -1 : -1;
      if (index < 0 || index >= syncedLines.length) {
        let low = 0;
        let high = starts.length;
        while (low < high) {
          const mid = (low + high) >>> 1;
          if (starts[mid] <= positionMs) low = mid + 1;
          else high = mid;
        }
        index = low - 1;
      }
      publish(syncedLines[index]?.text || "");
    };

    let starts: number[] = [];
    let hasTiming = false;
    const indexLyrics = () => {
      const { syncedLines, currentLyricsTrackId } = useLyricsStore.getState();
      hasTiming = currentLyricsTrackId === track.id &&
        syncedLines.some(line => line.timeMs > 0 || (line.isInstrumental && (line.durationMs ?? 0) > 0));
      if (!hasTiming) {
        starts = [];
        return;
      }
      starts = syncedLines.map((line, index) => {
        const prev = syncedLines[index - 1];
        return Math.max(prev?.words?.at(-1)?.endMs ?? prev?.timeMs ?? 0, line.timeMs - 600);
      });
      // Overlapping lines can move the raw cutoff backwards. Preserve the
      // previous first-unreached cutoff while still allowing binary search.
      for (let i = 1; i < starts.length; i++) starts[i] = Math.max(starts[i], starts[i - 1]);
    };

    let raf: number | null = null;
    let lastFrame = -Infinity;
    const frame = (timestamp: number) => {
      raf = null;
      if (timestamp - lastFrame >= 40) {
        lastFrame = timestamp;
        update();
      }
      schedule();
    };
    const schedule = () => {
      if (raf === null && status === "playing" && hasTiming && !fullscreenLyrics) {
        raf = requestAnimationFrame(frame);
      }
    };
    indexLyrics();
    update();
    schedule();
    const unsubscribeLyrics = useLyricsStore.subscribe((state, prev) => {
      if (state.syncedLines !== prev.syncedLines || state.currentLyricsTrackId !== prev.currentLyricsTrackId) {
        indexLyrics();
        schedule();
      } else if (!fullscreenLyrics || state.activeLineIndex === prev.activeLineIndex) return;
      update();
    });
    const unsubscribePlayer = usePlayerStore.subscribe((state, prev) => {
      if (status !== "playing" && state.positionMs !== prev.positionMs) update();
    });
    return () => {
      if (raf !== null) cancelAnimationFrame(raf);
      unsubscribeLyrics();
      unsubscribePlayer();
    };
  }, [nativeTouchBar, status, currentTrack, fullscreenLyrics, syncRequestTick]);
}
