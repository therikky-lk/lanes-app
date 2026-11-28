import { useShallow } from "zustand/react/shallow";
import { fullscreenChromeMask } from "./fullscreenChromeMask";
import { VisualQualityPicker } from "./VisualQualityPicker";
import { useVisualQualityStore, fullscreenVisualQuality } from "../store/visualQualityStore";
import { usePlayerStore } from "../store/playerStore";
import { useIsTrackLiked, useLikeTrack, useUnlikeTrack } from "@/features/library/hooks";
import { useIsMobile } from "@/shared/hooks/useIsMobile";
import { attachLetterAnimation } from "@/features/lyrics/ui/letterAnimation";
import CustomLyricsDialog from "@/features/lyrics/ui/CustomLyricsDialog";
import { applyLyricsLatency, lyricsOutputLatencyMs } from "@/features/lyrics/engine/lyricsLatency";
import { CUSTOM_LYRICS_PROVIDER } from "@/shared/media/lyrics/customLyrics";
import { LuCaptions, LuFilePenLine, LuMessageCircle } from "react-icons/lu";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  createElement,
  useRef,
  useState,
  memo,
} from "react";
import { useNavigate } from "react-router-dom";
import { shouldReleaseTopPin, startsPinnedToTop } from "./lyricsTopPin";
import { installFullscreenLyrics } from "./installFullscreenLyrics";
import { fullscreenLyricsForMode } from "./fullscreenKaraoke";
import { playerEngine } from "../engine/playerEngine";
import {
  useLyricsStore,
  LyricsProviderIsland,
  braccatoThemeCss,
  hasSyncedLyricsSources,
} from "@/features/lyrics";
import { AnimatePresence, motion, useDragControls } from "framer-motion";
import { PlayerUiElements } from "./PlayerUiElements";
import { EqualizerPicker } from "./EqualizerPicker";
import { isEqActive } from "../engine/equalizer";
import { Settings6Line } from "@mingcute/react";
import { DownLine } from "@mingcute/react";
import { Sidebar } from "@solar-icons/react";
import { preloadCoverArt, useCoverSrc } from "@/features/covers";
import "@braccato/core/element";
import type { BraccatoLyricsElement } from "@braccato/core/element";
import "@braccato/core/styles/variables.css";
import "@braccato/core/styles/lyrics.css";
import "@braccato/core/styles/instrumental.css";
import KawarpWrapper from "./KawarpWrapper";
import { SpeedPitchPicker } from "./SpeedPitchPicker";
import { PlaybackSpeed } from "@solar-icons/react";
import { useTranslation } from "@/languages";
import ConnectDevicesButton from "@/features/connect/ui/ConnectDevicesButton";
import { getRemotePlaybackClock } from "@/features/connect/connectService";
import FullscreenQueueSheet from "./FullscreenQueueSheet";
import TrackComments, { supportsTrackComments, useTrackCommentsAccount } from "./TrackComments";

const BRACCATO_TAG = "braccato-lyrics";

interface BraccatoLyricsViewProps {
  lyrics: ReturnType<typeof fullscreenLyricsForMode>;
  karaoke: boolean;
  offsetMs: number;
  blurEdges?: boolean;
}

const BraccatoLyricsView = memo(function BraccatoLyricsView({ lyrics, karaoke, offsetMs, blurEdges = false }: BraccatoLyricsViewProps) {
  const player = usePlayerStore(useShallow(s => ({ status: s.status })));
  const elementRef = useRef<BraccatoLyricsElement | null>(null);
  const offsetRef = useRef(offsetMs);
  const latestLyricsRef = useRef(lyrics);
  const assignedLyricsRef = useRef<BraccatoLyricsViewProps["lyrics"] | null>(null);
  const finishLayoutRef = useRef<(() => void) | null>(null);
  const freeScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastWheelTimeRef = useRef(0);
  const isInFreeSearchRef = useRef(false);
  const waitingForAudioAfterClickRef = useRef(false);
  const pinnedToTopRef = useRef(!getRemotePlaybackClock() && startsPinnedToTop(player.status, playerEngine.getSnapshot().positionMs));

  const scrollToActiveLine = useCallback(
    (behavior: ScrollBehavior = "smooth") => {
      const el = elementRef.current;
      if (!el) return false;

      const activeEls = (el as HTMLElement).querySelectorAll<HTMLElement>(
        ".blyrics--active",
      );
      if (activeEls.length === 0) return false;
      const activeEl = activeEls[activeEls.length - 1];

      const containerRect = el.getBoundingClientRect();
      const elRect = activeEl.getBoundingClientRect();
      if (containerRect.height === 0 || elRect.height === 0) return false;

      const offset = elRect.top - containerRect.top + el.scrollTop;
      const targetScrollTop =
        offset - containerRect.height / 2 + elRect.height / 2;

      if (behavior === "auto") {
        el.scrollTop = Math.max(0, targetScrollTop);
      } else {
        el.scrollTo({
          top: Math.max(0, targetScrollTop),
          behavior,
        });
      }
      return true;
    },
    [],
  );

  const returnToFollowingMode = useCallback(() => {
    if (freeScrollTimerRef.current) {
      clearTimeout(freeScrollTimerRef.current);
      freeScrollTimerRef.current = null;
    }
    isInFreeSearchRef.current = false;
    lastWheelTimeRef.current = 0;

    const el = elementRef.current;
    if (!el) return;

    if (el.renderer) {
      el.renderer.resumeAutoscroll?.();
      const engine = (el.renderer as any)?.engine;
      if (engine) {
        engine.scrollResumeTime = 0;
        engine.nextScrollAllowedTime = 0;
        engine.queuedScroll = true;
      }
    }

    scrollToActiveLine("smooth");
  }, [scrollToActiveLine]);

  const returnToFollowingModeRef = useRef(returnToFollowingMode);
  returnToFollowingModeRef.current = returnToFollowingMode;

  const handleUserInteraction = useCallback(() => {
    pinnedToTopRef.current = false;
    lastWheelTimeRef.current = Date.now();
    isInFreeSearchRef.current = true;

    const el = elementRef.current;
    if (el?.renderer) {
      el.renderer.noteUserScroll?.();
    }

    if (freeScrollTimerRef.current) {
      clearTimeout(freeScrollTimerRef.current);
      freeScrollTimerRef.current = null;
    }

    freeScrollTimerRef.current = setTimeout(() => {
      const elapsed = Date.now() - lastWheelTimeRef.current;
      if (elapsed < 5900) return;

      returnToFollowingMode();
    }, 6000);
  }, [returnToFollowingMode]);

  const handleUserInteractionRef = useRef(handleUserInteraction);
  handleUserInteractionRef.current = handleUserInteraction;

  const setElement = useCallback((el: BraccatoLyricsElement | null) => {
    elementRef.current = el;
    if (!el) return;
    // Braccato needs a scroll host even to update highlight classes. The lyrics
    // element owns the scroll; don't infer it from the surrounding player layout.
    el.host = { getScrollElement: () => el };
    el.theme = braccatoThemeCss;
    el.tickOptions = { ...el.tickOptions, lyricOffset: offsetRef.current / 1000 };
    const localSource = "#liner-audio";
    const syncTouchBar = window.linerElectron?.platform === "darwin";
    el.source = getRemotePlaybackClock() ? null : localSource;

    const handleBraccatoLineClick = (e: Event) => {
      const isAudioLoading = playerEngine.getSnapshot().status === "loading";
      if (isAudioLoading) {
        waitingForAudioAfterClickRef.current = true;
        isInFreeSearchRef.current = true;
        if (freeScrollTimerRef.current) {
          clearTimeout(freeScrollTimerRef.current);
          freeScrollTimerRef.current = null;
        }
        if (el.renderer) {
          el.renderer.noteUserScroll?.();
        }
      } else {
        returnToFollowingModeRef.current();
      }

      const detail = (e as CustomEvent).detail as
        | { timeS?: number; time?: number }
        | undefined;
      const timeMs =
        detail?.timeS !== undefined
          ? Math.round(detail.timeS * 1000)
          : detail?.time !== undefined
            ? detail.time > 1000
              ? Math.round(detail.time)
              : Math.round(detail.time * 1000)
            : null;
      if (timeMs !== null) {
        playerEngine.seek(Math.max(0, timeMs + offsetRef.current), true);
      }
    };

    const onUserScroll = () => {
      handleUserInteractionRef.current();
    };

    let syncRafId: number;
    let lastReportedIndex = -1;
    let lastCheckAt = -Infinity;
    let appliedLatency = -1;
    const syncLatency = (remote: boolean) => {
      const lat = remote ? 0 : lyricsOutputLatencyMs();
      if (appliedLatency >= 0 && lat !== 0 && Math.abs(lat - appliedLatency) < 10) return;
      if (lat === appliedLatency) return;
      appliedLatency = lat;
      applyLyricsLatency(el, lat);
    };

    const checkActiveLine = (timestamp: number) => {
      syncRafId = requestAnimationFrame(checkActiveLine);
      const remote = getRemotePlaybackClock();
      const source = remote ? null : localSource;
      if (el.source !== source) {
        syncLatency(Boolean(remote));
        el.source = source;
      }
      if (remote) {
        if (el.tickOptions.playbackRate !== remote.rate) el.tickOptions = { ...el.tickOptions, playbackRate: remote.rate };
        if (el.playing !== remote.playing) el.playing = remote.playing;
        const time = remote.positionMs / 1000;
        if (el.currentTime !== time) el.currentTime = time;
      }
      if (!syncTouchBar || timestamp - lastCheckAt < 40) return;
      lastCheckAt = timestamp;
      const audioEl = el.mediaElement;
      const positionMs = remote?.positionMs ?? (audioEl ? audioEl.currentTime * 1000 : NaN);
      if (Number.isFinite(positionMs)) {
        const currentMs = positionMs - Math.max(appliedLatency, 0) - offsetRef.current;
        const lines = useLyricsStore.getState().syncedLines;
        let low = 0;
        let high = lines.length;
        while (low < high) {
          const i = (low + high) >>> 1;
          const previous = lines[i - 1];
          const prevEnd = previous?.words?.length
            ? previous.words[previous.words.length - 1].endMs
            : previous?.timeMs ?? 0;
          const targetEarlyMs = Math.max(prevEnd, lines[i].timeMs - 600);
          if (targetEarlyMs <= currentMs) low = i + 1;
          else high = i;
        }
        const idx = low - 1;
        if (idx !== lastReportedIndex) {
          lastReportedIndex = idx;
          useLyricsStore.getState().setActiveLineIndex(idx >= 0 ? idx : null);
        }
      }
    };

    syncRafId = requestAnimationFrame(checkActiveLine);
    // keep the lyrics on the sound that is heard, not on the element's clock
    syncLatency(Boolean(getRemotePlaybackClock()));
    finishLayoutRef.current = installFullscreenLyrics(el, latestLyricsRef.current);
    assignedLyricsRef.current = latestLyricsRef.current;
    const latencyTimer = setInterval(() => syncLatency(Boolean(getRemotePlaybackClock())), 2000);

    el.addEventListener("braccato:line-click", handleBraccatoLineClick);
    el.addEventListener("wheel", onUserScroll, { passive: true, capture: true });
    el.addEventListener("touchmove", onUserScroll, { passive: true, capture: true });

    return () => {
      cancelAnimationFrame(syncRafId);
      finishLayoutRef.current?.();
      finishLayoutRef.current = null;
      clearInterval(latencyTimer);
      if (syncTouchBar) useLyricsStore.getState().setActiveLineIndex(null);
      el.removeEventListener("braccato:line-click", handleBraccatoLineClick);
      el.removeEventListener("wheel", onUserScroll, { capture: true });
      el.removeEventListener("touchmove", onUserScroll, { capture: true });
      if (freeScrollTimerRef.current) {
        clearTimeout(freeScrollTimerRef.current);
        freeScrollTimerRef.current = null;
      }
      elementRef.current = null;
      assignedLyricsRef.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    offsetRef.current = offsetMs;
    const element = elementRef.current;
    if (!element || element.tickOptions.lyricOffset === offsetMs / 1000) return;
    // Shift the media clock, not the lyric DOM. Rebuilding the view during a
    // drag also stalls the WebGL background and restarts the letter animation.
    element.tickOptions = { ...element.tickOptions, lyricOffset: offsetMs / 1000 };
    if (!element.playing) {
      element.renderer?.tick(element.currentTime, { ...element.tickOptions, isPlaying: false });
    }
  }, [offsetMs]);

  useEffect(() => {
    const element = elementRef.current;
    if (!karaoke || !element) return;
    return attachLetterAnimation(element);
  }, [karaoke]);

  useEffect(() => {
    latestLyricsRef.current = lyrics;
    const element = elementRef.current;
    // The ref callback already installs the initial lyrics. Assigning again
    // rebuilds the entire custom element when the lyrics pane is first opened.
    if (element && assignedLyricsRef.current !== lyrics) {
      finishLayoutRef.current?.();
      finishLayoutRef.current = installFullscreenLyrics(element, lyrics);
      assignedLyricsRef.current = lyrics;
    }
  }, [lyrics]);

  useEffect(() => {
    if (
      (player.status === "playing" || player.status === "paused") &&
      waitingForAudioAfterClickRef.current
    ) {
      waitingForAudioAfterClickRef.current = false;
      returnToFollowingMode();
    }
  }, [player.status, returnToFollowingMode]);

  useEffect(() => {
    if (!pinnedToTopRef.current) return;
    const startedAt = performance.now();
    let rafId = 0;
    const holdTop = () => {
      const el = elementRef.current as HTMLElement & { renderer?: { noteUserScroll?: () => void; resumeAutoscroll?: () => void } };
      if (!pinnedToTopRef.current) return;
      const audio = document.getElementById("liner-audio") as HTMLAudioElement | null;
      const release = shouldReleaseTopPin({
        status: playerEngine.getSnapshot().status,
        audioPaused: !audio || audio.paused,
        audioTimeMs: (audio?.currentTime ?? 0) * 1000,
        pinnedForMs: performance.now() - startedAt,
      });
      if (getRemotePlaybackClock() || release) {
        pinnedToTopRef.current = false;
        el?.renderer?.resumeAutoscroll?.();
        return;
      }
      if (el) {
        el.renderer?.noteUserScroll?.();
        if (el.scrollTop !== 0) el.scrollTop = 0;
      }
      rafId = requestAnimationFrame(holdTop);
    };
    rafId = requestAnimationFrame(holdTop);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <div data-lyrics-mode={karaoke ? "karaoke" : "source"} className="lane-lyrics-viewport relative flex flex-col flex-1 w-full h-full min-h-0">
      {createElement(BRACCATO_TAG, {
        ref: setElement,
        className: "block flex-1 w-full h-full px-6",
        style: {
          overflowY: "auto",
          overflowX: "hidden",
          position: "relative",
          scrollbarWidth: "none",
        },
      })}
      {blurEdges && <><div aria-hidden className="lane-lyrics-blur-edge lane-lyrics-blur-edge--top" /><div aria-hidden className="lane-lyrics-blur-edge lane-lyrics-blur-edge--bottom" /></>}
    </div>
  );
});

export interface FullscreenPlayerProps {
  effectsReady?: boolean;
  onClose: () => void;
}

export function FullscreenPlayer({
  effectsReady = true,
  onClose,
}: FullscreenPlayerProps) {
  const { t } = useTranslation();
  const player = usePlayerStore(useShallow(s => ({ currentTrack: s.currentTrack, queue: s.queue, currentIndex: s.currentIndex, isEqEnabled: s.isEqEnabled, eqGains: s.eqGains })));
  const isMobile = useIsMobile();
  const fullscreenRoot = useRef<HTMLDivElement>(null);
  const toolbar = useRef<HTMLDivElement>(null);
  const chromeGlass = useRef<HTMLDivElement>(null);
  const [dismissZoneHeight, setDismissZoneHeight] = useState(64);
  useLayoutEffect(() => {
    if (isMobile) return;
    const root = fullscreenRoot.current;
    const controls = toolbar.current;
    const glass = chromeGlass.current;
    if (!root || !controls || !glass) return;
    const measure = () => {
      const box = root.getBoundingClientRect();
      const bar = controls.getBoundingClientRect();
      // The toolbar animates its width. Updating just the mask avoids rendering
      // the entire fullscreen player again at every intermediate size.
      const mask = fullscreenChromeMask(box.width, bar.left - box.left, bar.width);
      if (glass.style.getPropertyValue("--lane-fs-toolbar-mask") !== mask) {
        glass.style.setProperty("--lane-fs-toolbar-mask", mask);
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root); observer.observe(controls);
    return () => observer.disconnect();
  }, [isMobile]);

  const quality = useVisualQualityStore(state => fullscreenVisualQuality(state.quality, isMobile));
  const [mobileLyrics, setMobileLyrics] = useState(false);
  useLayoutEffect(() => {
    if (!isMobile) return;
    const root = fullscreenRoot.current;
    const artwork = root?.querySelector<HTMLElement>("[data-player-artwork]");
    if (!root) return;
    const measure = () => {
      const box = artwork?.getBoundingClientRect();
      setDismissZoneHeight(box && box.height > 0 ? Math.max(0, box.top - root.getBoundingClientRect().top) : 64);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root); if (artwork) observer.observe(artwork);
    return () => observer.disconnect();
  }, [isMobile, mobileLyrics]);
  const [speedOpen, setSpeedOpen] = useState(false);
  const [audioSheet, setAudioSheet] = useState<"speed" | "eq">("speed");
  const [queueOpen, setQueueOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [lyricsEditor, setLyricsEditor] = useState<{ id: string; title: string } | null>(null);
  const openLyricsEditor = useCallback(() => {
    const track = player.currentTrack;
    if (track) setLyricsEditor({ id: track.id, title: track.title });
  }, [player.currentTrack]);
  const commentsAccount = useTrackCommentsAccount();
  const commentsTrack = isMobile && commentsAccount && player.currentTrack && supportsTrackComments(player.currentTrack.id)
    ? player.currentTrack
    : null;
  const speedSheetDragControls = useDragControls();
  const speedChanged = usePlayerStore(
    (s) => Math.abs((s.playbackRate ?? 1) - 1) > 0.001 || Math.abs(s.pitchSemitones ?? 0) > 0.001,
  );
  const coverUrl = player.currentTrack?.coverUrl;
  const kawarpSrc = useCoverSrc(coverUrl);

  useEffect(() => {
    if (!player.currentTrack) {
      onClose();
    }
  }, [player.currentTrack, onClose]);

  const {
    braccatoLyrics,
    rawFormat,
    lyricsLoading,
    lyricsError,
    plainLyrics,
    displayMode,
    offsetMs,
    availableProviders,
    currentLyricsTrackId,
  } = useLyricsStore(useShallow(s => ({
    braccatoLyrics: s.baseBraccatoLyrics,
    rawFormat: s.rawFormat,
    lyricsLoading: s.lyricsLoading,
    lyricsError: s.lyricsError,
    plainLyrics: s.plainLyrics,
    displayMode: s.displayMode,
    offsetMs: s.offsetMs,
    availableProviders: s.availableProviders,
    currentLyricsTrackId: s.currentLyricsTrackId,
  })));

  const onError = useCallback((err: Error) => {
    console.error("kawarp load error:", err);
  }, []);

  const [kawarpShown, setKawarpShown] = useState(false);
  const onKawarpLoad = useCallback(() => {
    setKawarpShown(true);
  }, []);
  useEffect(() => {
    if (quality === "blur" || !effectsReady) setKawarpShown(false);
  }, [quality, effectsReady]);

  const nextCoverUrl = player.queue[player.currentIndex + 1]?.coverUrl;
  useEffect(() => {
    void preloadCoverArt(coverUrl);
    void preloadCoverArt(nextCoverUrl);
  }, [coverUrl, nextCoverUrl]);

  const currentTrackId = player.currentTrack?.id;
  const isMatchingTrack = Boolean(currentTrackId && currentLyricsTrackId === currentTrackId);
  const hasLyrics = isMatchingTrack && braccatoLyrics.length > 0;
  const trackDurationMs = player.currentTrack?.durationMs;
  const displayLyrics = useMemo(
    () => fullscreenLyricsForMode(braccatoLyrics, rawFormat, displayMode, trackDurationMs),
    [rawFormat, braccatoLyrics, displayMode, trackDurationMs],
  );
  const karaoke = displayMode === "karaoke" && rawFormat !== null && rawFormat !== "plain";
  const hasSyncedSources = hasSyncedLyricsSources(
    availableProviders,
    braccatoLyrics,
    rawFormat,
  );
  const showProviderIsland =
    hasLyrics && (hasSyncedSources || availableProviders.length > 1 ||
      availableProviders.some(option => option.provider === CUSTOM_LYRICS_PROVIDER));
  const isInstrumental =
    isMatchingTrack &&
    !lyricsLoading &&
    !hasLyrics &&
    !lyricsError &&
    plainLyrics === "[INSTRUMENTAL]";

  return (
    <div
      ref={fullscreenRoot}
      data-theme="dark"
      data-visual-quality={quality}
      className={`lane-fs-player ${isMobile ? "" : "lane-fs-player--desktop"} dark relative h-full w-full overflow-hidden bg-black text-white`}
    >
      <div className="lane-fs-background absolute inset-0 overflow-hidden">
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{ backgroundColor: "var(--color-bg-primary)" }}
        />
        {quality === "blur" ? (
          kawarpSrc && <div aria-hidden="true"
            className="absolute inset-0 bg-cover bg-center filter blur-xl scale-105 opacity-50 pointer-events-none"
            style={{ backgroundImage: `url(${kawarpSrc})` }}
          />
        ) : (
          <>
            <AnimatePresence initial={false}>
              {kawarpSrc && !kawarpShown && (
                <motion.div key={kawarpSrc}
                  initial={{ opacity: 0 }} animate={{ opacity: 0.5 }} exit={{ opacity: 0 }}
                  transition={{ duration: 0.65, ease: "easeInOut" }}
                  className="absolute inset-0 bg-cover bg-center filter blur-xl scale-105 pointer-events-none"
                  style={{ backgroundImage: `url(${kawarpSrc})` }}
                />
              )}
            </AnimatePresence>
            {effectsReady && <KawarpWrapper src={kawarpSrc} quality={quality} onLoad={onKawarpLoad} onError={onError} />}
          </>
        )}
      </div>

      <div className={`absolute inset-0 z-[1] ${isMobile ? "bg-black/40" : "lane-fs-desktop-shade"}`} />
      {!isMobile && <div ref={chromeGlass} aria-hidden className="lane-fs-chrome-glass" />}
      {isMobile && <div aria-hidden className="absolute inset-x-0 top-0 z-20" style={{ height: dismissZoneHeight, touchAction: "none" }} />}


      <div
        className={`lane-fs-content absolute inset-0 z-10 flex ${isMobile ? "flex-col" : ""}`}
        style={isMobile ? { paddingTop: "calc(var(--lane-safe-top, 0px) + 48px)", paddingBottom: "var(--lane-safe-bottom, 0px)" } : undefined}
      >
        <div className={`[container-type:inline-size] min-w-0 flex-1 flex flex-col items-center justify-center gap-[clamp(10px,3dvh,24px)] ${isMobile && mobileLyrics ? "hidden" : ""}`}>
          <PlayerUiElements onClose={onClose} />
        </div>

        <div
          className={`flex-1 h-full min-h-0 flex flex-col relative ${isMobile ? "px-[12px]" : "pl-2 pr-6"} ${
            isMobile && !mobileLyrics ? "hidden" : ""
          }`}
        >
          <div
            className="flex-1 min-h-0 relative w-full h-full"
            style={{
              display: hasLyrics ? "flex" : "none",
            }}
          >
            <AnimatePresence initial={false}>
              {hasLyrics && (!isMobile || mobileLyrics) && (
                <motion.div
                  key={`lyrics-${currentTrackId}`}
                  initial={isMobile ? { opacity: 0 } : false}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, pointerEvents: "none" }}
                  transition={{ duration: isMobile ? 0.22 : 0, ease: "easeInOut" }}
                  className="absolute inset-0 flex flex-col"
                >
                  <BraccatoLyricsView lyrics={displayLyrics} karaoke={karaoke} offsetMs={offsetMs} blurEdges={quality === "all"} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <AnimatePresence mode="wait">
            {!hasLyrics && lyricsLoading ? (
              <motion.div
                key="skeleton"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="absolute inset-0 flex flex-col items-center justify-center"
              >
                <div className="flex flex-col gap-5 w-full max-w-[500px]">
                  {[80, 65, 45, 70, 55, 85, 60, 50, 75, 40, 65, 55].map(
                    (w, i) => (
                      <div
                        key={i}
                        className="h-5 rounded animate-pulse bg-border-alpha-14"
                        style={{ width: `${w}%` }}
                      />
                    ),
                  )}
                </div>
              </motion.div>
            ) : !hasLyrics && isInstrumental ? (
              <motion.div
                key="instrumental"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="absolute inset-0 flex items-center justify-center text-text-tertiary text-lg"
              >
                <span>{t("player.instrumental")}</span>
              </motion.div>
            ) : !hasLyrics ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="absolute inset-0 flex items-center justify-center text-text-tertiary"
              >
                <div className="flex flex-col items-center justify-center gap-3 opacity-80">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="48"
                    height="48"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="opacity-40"
                  >
                    <path d="M9 18V5l12-2v13"></path>
                    <circle cx="6" cy="18" r="3"></circle>
                    <circle cx="18" cy="16" r="3"></circle>
                    <line x1="2" y1="2" x2="22" y2="22"></line>
                  </svg>
                  <span
                    className="text-[15px] font-[400] max-w-[250px] text-center"
                    style={{ lineHeight: "1.4" }}
                  >
                    {lyricsError || t("player.no_lyrics_found")}
                  </span>
                  {currentTrackId && (
                    <button type="button" onClick={openLyricsEditor}
                      className="mt-1 inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-3.5 text-[13px] font-medium text-white transition-colors hover:bg-white/20">
                      <LuFilePenLine size={15} aria-hidden />
                      {t("player.custom_lyrics_add")}
                    </button>
                  )}
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>

      <AnimatePresence>
        {isMobile && speedOpen && (
          <motion.div
            key="speed-sheet"
            data-no-sheet-drag
            className="absolute inset-0 z-40 flex items-end"
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 1 }}
            onClick={() => setSpeedOpen(false)}
          >
            <div className="lane-sheet-dimmer absolute inset-0" />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              drag="y"
              dragListener={false}
              dragControls={speedSheetDragControls}
              dragConstraints={{ top: 0, bottom: typeof window === "undefined" ? 1000 : window.innerHeight }}
              dragElastic={0}
              dragMomentum={false}
              onDragEnd={(_, info) => {
                if (info.offset.y > 90 || info.velocity.y > 650) setSpeedOpen(false);
              }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              data-no-sheet-drag
              className="lane-frost-sheet relative w-full max-h-[88dvh] overflow-y-auto overscroll-contain rounded-t-2xl border-t border-white/[0.08] bg-black/20 p-[18px] backdrop-blur-xl"
              style={{
                maxHeight: "min(88dvh, calc(100dvh - var(--lane-safe-top, 0px) - 16px))",
                paddingBottom: "calc(var(--lane-safe-bottom, 0px) + 16px)",
                touchAction: "pan-y",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                aria-label={t("common.close")}
                onPointerDown={(event) => speedSheetDragControls.start(event)}
                className="mx-auto mb-[12px] flex h-[24px] w-[72px] touch-none cursor-grab items-center justify-center border-0 bg-transparent active:cursor-grabbing"
              >
                <span className="h-[4px] w-[36px] rounded-full bg-white/30" />
              </button>
              {audioSheet === "eq"
                ? <EqualizerPicker />
                : <SpeedPitchPicker onClose={() => setSpeedOpen(false)} />}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {queueOpen && (
          <motion.div
            key="fullscreen-queue-modal"
            className="absolute inset-0 z-50 flex items-end"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.14, ease: "easeOut" }}
            onClick={() => setQueueOpen(false)}
            data-no-sheet-drag
          >
            <div className="lane-sheet-dimmer absolute inset-0" />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              drag="y"
              dragListener={false}
              dragControls={speedSheetDragControls}
              dragConstraints={{ top: 0, bottom: typeof window === "undefined" ? 1000 : window.innerHeight }}
              dragElastic={0}
              dragMomentum={false}
              onDragEnd={(_, info) => {
                if (info.offset.y > 90 || info.velocity.y > 650) setQueueOpen(false);
              }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className="lane-frost-sheet relative w-full max-h-[88dvh] overflow-hidden rounded-t-2xl border-t border-white/[0.08] bg-black/20 p-[18px] pb-[calc(var(--lane-safe-bottom,0px)+16px)] backdrop-blur-xl"
              onClick={event => event.stopPropagation()}
              style={{ maxHeight: "min(88dvh, calc(100dvh - var(--lane-safe-top, 0px) - 16px))", touchAction: "pan-y" }}
            >
              <button
                type="button"
                aria-label={t("player.queue")}
                onPointerDown={event => speedSheetDragControls.start(event)}
                className="mx-auto mb-[12px] flex h-[24px] w-[72px] touch-none cursor-grab items-center justify-center border-0 bg-transparent active:cursor-grabbing"
              >
                <span className="h-[4px] w-[36px] rounded-full bg-white/30" />
              </button>
              <div className="max-h-[calc(88dvh-62px-var(--lane-safe-bottom,0px))] overflow-y-auto overscroll-contain">
                <FullscreenQueueSheet />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {commentsOpen && commentsTrack && (
          <TrackComments key="track-comments" track={commentsTrack} onClose={() => setCommentsOpen(false)} onOpenProfile={onClose} />
        )}
      </AnimatePresence>

      <button
        type="button"
        aria-label={t("player.close_fullscreen")}
        onClick={onClose}
        style={isMobile ? { top: "calc(var(--lane-safe-top, 0px) + 10px)", touchAction: "none" } : undefined}
        data-no-window-drag
        className="lane-fs-close absolute top-[12px] left-[12px] z-30 inline-flex h-[32px] w-[32px] items-center justify-center rounded-lg border-none bg-black/50 backdrop-blur-xl text-white/80 hover:text-white hover:bg-white/10 active:scale-[0.94] transition-all cursor-pointer select-none pointer-events-auto"
      >
        <DownLine size={18} />
      </button>
      {/* top-right group: phones get lyrics + devices together; on the
          desktop the devices button sits right next to the window controls */}
      <div
        ref={toolbar}
        className={`absolute z-30 flex max-w-[calc(100vw-64px)] flex-wrap items-center justify-end ${isMobile ? "gap-[6px]" : "lane-fs-toolbar gap-[8px]"}`}
        style={isMobile ? { top: "calc(var(--lane-safe-top, 0px) + 10px)", right: 12, touchAction: "none" } : { top: 0, left: "50%", transform: "translateX(-50%)" }}
        data-no-window-drag
      >
        {!isMobile && <VisualQualityPicker />}
        {showProviderIsland && (!isMobile || mobileLyrics) && <LyricsProviderIsland onEditCustomLyrics={openLyricsEditor} />}
        {isMobile && (
          <button
            type="button"
            onClick={() => setQueueOpen(true)}
            aria-label={t("player.queue")}
            aria-expanded={queueOpen}
            className={`inline-flex h-[34px] w-[34px] items-center justify-center rounded-lg border-none backdrop-blur-xl active:scale-[0.92] transition-[transform,background-color] duration-150 cursor-pointer ${queueOpen ? "bg-white text-black" : "bg-black/45 text-white/85"}`}
          >
            <Sidebar size={18} weight="Bold" />
          </button>
        )}
        {isMobile && (
          <button
            type="button"
            onClick={() => setMobileLyrics((v) => !v)}
            aria-pressed={mobileLyrics}
            aria-label={t("player.lyrics") || "Lyrics"}
            title={t("player.lyrics") || "Lyrics"}
            className={`inline-flex h-[34px] w-[34px] items-center justify-center rounded-lg border-none p-0 text-[13px] font-[500] backdrop-blur-xl transition-colors cursor-pointer ${
              mobileLyrics ? "bg-white text-black" : "bg-black/45 text-white/85"
            }`}
          >
            <LuCaptions size={19} />
          </button>
        )}
        {commentsTrack && (
          <button
            type="button"
            onClick={() => setCommentsOpen(true)}
            aria-label={t("track_comments.title")}
            aria-expanded={commentsOpen}
            className="inline-flex size-[34px] items-center justify-center rounded-lg border-none bg-black/45 text-white/85 backdrop-blur-xl transition-transform active:scale-[0.92] cursor-pointer"
          >
            <LuMessageCircle size={18} />
          </button>
        )}
        {isMobile && (
          <ConnectDevicesButton
            size={18}
            className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-lg border-none bg-black/45 text-white/85 backdrop-blur-xl active:scale-[0.92] transition-all cursor-pointer"
          />
        )}
        {isMobile && <button type="button" aria-label={t("player.equalizer")}
          onClick={() => { setAudioSheet("eq"); setSpeedOpen(true); }}
          className={`inline-flex h-[34px] w-[34px] items-center justify-center rounded-lg border-none backdrop-blur-xl cursor-pointer ${isEqActive(player.isEqEnabled, player.eqGains) ? "bg-white text-black" : "bg-black/45 text-white/85"}`}>
          <Settings6Line size={18} />
        </button>}
        {isMobile && (
          <button
            type="button"
            onClick={() => { setAudioSheet("speed"); setSpeedOpen(true); }}
            aria-label={t("player.speed")}
            className={`inline-flex h-[34px] w-[34px] items-center justify-center rounded-lg border-none backdrop-blur-xl active:scale-[0.92] transition-all cursor-pointer ${
              speedChanged ? "bg-white text-black" : "bg-black/45 text-white/85"
            }`}
          >
            <PlaybackSpeed size={18} weight={speedChanged ? "Bold" : "Outline"} />
          </button>
        )}
      </div>
      {lyricsEditor && (
        <CustomLyricsDialog
          open
          trackId={lyricsEditor.id}
          trackTitle={lyricsEditor.title}
          onOpenChange={open => { if (!open) setLyricsEditor(null); }}
        />
      )}
    </div>
  );
}

export default function PlayerPage() {
  const navigate = useNavigate();
  return <FullscreenPlayer onClose={() => navigate(-1)} />;
}
