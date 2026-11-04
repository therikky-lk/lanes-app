import { useShallow } from "zustand/react/shallow";
import { fullscreenChromeMask } from "./fullscreenChromeMask";
import { VisualQualityPicker } from "./VisualQualityPicker";
import { useVisualQualityStore, visualEffects } from "../store/visualQualityStore";
import { usePlayerStore } from "../store/playerStore";
import { HeartFill, HeartLine } from "@mingcute/react";
import { useIsTrackLiked, useLikeTrack, useUnlikeTrack } from "@/features/library/hooks";
import { useIsMobile } from "@/shared/hooks/useIsMobile";
import CustomLyricsDialog from "@/features/lyrics/ui/CustomLyricsDialog";
import { attachLetterAnimation } from "@/features/lyrics/ui/letterAnimation";
import { applyLyricsLatency, lyricsOutputLatencyMs } from "@/features/lyrics/engine/lyricsLatency";
import { AddLine, Edit2Line } from "@mingcute/react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  createElement,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import { shouldReleaseTopPin, startsPinnedToTop } from "./lyricsTopPin";
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
import { preloadCoverArt, useCoverSrc } from "@/features/covers";
import "@braccato/core/element";
import "@braccato/core/styles/variables.css";
import "@braccato/core/styles/lyrics.css";
import "@braccato/core/styles/instrumental.css";
import KawarpWrapper from "./KawarpWrapper";
import { SpeedPitchPicker } from "./SpeedPitchPicker";
import { PlaybackSpeed } from "@solar-icons/react";
import { useTranslation } from "@/languages";
import ConnectDevicesButton from "@/features/connect/ui/ConnectDevicesButton";

const BRACCATO_TAG = "braccato-lyrics";

interface BraccatoLyricsViewProps {
  lyrics: any[];
  animateLetters?: boolean;
  blurEdges?: boolean;
}

function BraccatoLyricsView({ lyrics, animateLetters = true, blurEdges = false }: BraccatoLyricsViewProps) {
  const player = usePlayerStore(useShallow(s => ({ status: s.status })));
  const elementRef = useRef<any>(null);
  const latestLyricsRef = useRef(lyrics);
  const freeScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastWheelTimeRef = useRef(0);
  const isInFreeSearchRef = useRef(false);
  const waitingForAudioAfterClickRef = useRef(false);
  const pinnedToTopRef = useRef(startsPinnedToTop(player.status, playerEngine.getSnapshot().positionMs));

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
      el.renderer.noteUserScroll?.();
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

  const setElement = useCallback((el: any) => {
    elementRef.current = el;
    if (!el) return;
    el.theme = braccatoThemeCss;
    el.lyrics = latestLyricsRef.current;
    el.source = "#liner-audio";

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
          el.renderer.noteUserScroll?.();
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
        playerEngine.seek(timeMs, true);
      }
    };

    const onUserScroll = () => {
      handleUserInteractionRef.current();
    };

    const onLyricsLoaded = () => {
      if (waitingForAudioAfterClickRef.current) return;
      requestAnimationFrame(() => {
        if (!waitingForAudioAfterClickRef.current) {
          scrollToActiveLine("auto");
        }
      });
    };

    let syncRafId: number;
    let lastReportedIndex = -1;

    const checkActiveLine = () => {
      const audioEl = document.getElementById("liner-audio") as HTMLAudioElement | null;
      if (audioEl && !Number.isNaN(audioEl.currentTime)) {
        const currentMs = audioEl.currentTime * 1000 - Math.max(appliedLatency, 0);
        const lines = useLyricsStore.getState().syncedLines;
        let idx = -1;
        for (let i = 0; i < lines.length; i++) {
          const prevEnd =
            i > 0 && lines[i - 1].words && lines[i - 1].words!.length > 0
              ? lines[i - 1].words![lines[i - 1].words!.length - 1].endMs
              : i > 0
                ? lines[i - 1].timeMs
                : 0;
          const targetEarlyMs = Math.max(prevEnd, lines[i].timeMs - 600);
          if (targetEarlyMs <= currentMs) {
            idx = i;
          } else {
            break;
          }
        }
        if (idx !== lastReportedIndex) {
          lastReportedIndex = idx;
          useLyricsStore.getState().setActiveLineIndex(idx >= 0 ? idx : null);
        }
      }
      syncRafId = requestAnimationFrame(checkActiveLine);
    };

    syncRafId = requestAnimationFrame(checkActiveLine);
    // keep the lyrics on the sound that is heard, not on the element's clock
    let appliedLatency = -1;
    const syncLatency = () => {
      const lat = lyricsOutputLatencyMs();
      if (Math.abs(lat - appliedLatency) < 10) return;
      appliedLatency = lat;
      applyLyricsLatency(el, lat);
    };
    syncLatency();
    const latencyTimer = setInterval(syncLatency, 2000);

    el.addEventListener("braccato:lyrics-loaded", onLyricsLoaded);
    el.addEventListener("braccato:line-click", handleBraccatoLineClick);
    el.addEventListener("wheel", onUserScroll, { passive: true, capture: true });
    el.addEventListener("touchmove", onUserScroll, { passive: true, capture: true });

    return () => {
      cancelAnimationFrame(syncRafId);
      clearInterval(latencyTimer);
      useLyricsStore.getState().setActiveLineIndex(null);
      el.removeEventListener("braccato:lyrics-loaded", onLyricsLoaded);
      el.removeEventListener("braccato:line-click", handleBraccatoLineClick);
      el.removeEventListener("wheel", onUserScroll, { capture: true });
      el.removeEventListener("touchmove", onUserScroll, { capture: true });
      if (freeScrollTimerRef.current) {
        clearTimeout(freeScrollTimerRef.current);
        freeScrollTimerRef.current = null;
      }
      elementRef.current = null;
    };
  }, [scrollToActiveLine]);

  useEffect(() => {
    if (!animateLetters || !elementRef.current) return;
    return attachLetterAnimation(elementRef.current);
  }, [animateLetters, lyrics]);

  useEffect(() => {
    latestLyricsRef.current = lyrics;
    const element = elementRef.current;
    if (element) element.lyrics = lyrics;
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
    let cancelled = false;
    let attempts = 0;

    const checkAndScroll = () => {
      if (cancelled || waitingForAudioAfterClickRef.current || pinnedToTopRef.current) return;
      attempts++;
      const success = scrollToActiveLine("auto");
      if (!success && attempts < 30) {
        requestAnimationFrame(checkAndScroll);
      }
    };

    const rafId = requestAnimationFrame(checkAndScroll);
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, [lyrics, scrollToActiveLine]);

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
      if (release) {
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
    <div className="lane-lyrics-viewport relative flex flex-col flex-1 w-full h-full min-h-0">
      {createElement(BRACCATO_TAG, {
        ref: setElement,
        source: "#liner-audio",
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
}

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
  const [customLyricsOpen, setCustomLyricsOpen] = useState(false);
  const isMobile = useIsMobile();
  const fullscreenRoot = useRef<HTMLDivElement>(null);
  const toolbar = useRef<HTMLDivElement>(null);
  const [chromeMask, setChromeMask] = useState<string>();
  const [dismissZoneHeight, setDismissZoneHeight] = useState(64);
  useLayoutEffect(() => {
    if (isMobile) return;
    const root = fullscreenRoot.current;
    const controls = toolbar.current;
    if (!root || !controls) return;
    const measure = () => {
      const box = root.getBoundingClientRect();
      const bar = controls.getBoundingClientRect();
      setChromeMask(fullscreenChromeMask(box.width, bar.left - box.left, bar.width));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root); observer.observe(controls);
    return () => observer.disconnect();
  }, [isMobile]);

  const quality = useVisualQualityStore(state => state.quality);
  const effects = visualEffects(quality, isMobile);
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
    activeProvider,
    availableProviders,
    currentLyricsTrackId,
  } = useLyricsStore();

  const onError = useCallback((err: Error) => {
    console.error("kawarp load error:", err);
  }, []);

  const [kawarpShown, setKawarpShown] = useState(false);
  const onKawarpLoad = useCallback(() => {
    setKawarpShown(true);
  }, []);

  const nextCoverUrl = player.queue[player.currentIndex + 1]?.coverUrl;
  useEffect(() => {
    void preloadCoverArt(coverUrl);
    void preloadCoverArt(nextCoverUrl);
  }, [coverUrl, nextCoverUrl]);

  const currentTrackId = player.currentTrack?.id;
  const isMatchingTrack = Boolean(currentTrackId && currentLyricsTrackId === currentTrackId);
  const hasLyrics = isMatchingTrack && braccatoLyrics.length > 0;
  const hasSyncedSources = hasSyncedLyricsSources(
    availableProviders,
    braccatoLyrics,
    rawFormat,
  );
  const showProviderIsland =
    hasLyrics && (hasSyncedSources || availableProviders.length > 1);
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
      data-visual-quality={isMobile ? undefined : quality}
      className={`lane-fs-player ${isMobile ? "" : "lane-fs-player--desktop"} dark relative h-full w-full overflow-hidden bg-black text-white`}
    >
      <div className="lane-fs-background absolute inset-0 overflow-hidden">
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{ backgroundColor: "var(--color-bg-primary)" }}
        />
        <AnimatePresence initial={false}>
          {kawarpSrc && (!kawarpShown || !effects.liveBackground) && (
            <motion.div key={kawarpSrc}
              initial={{ opacity: 0 }} animate={{ opacity: 0.5 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.65, ease: "easeInOut" }}
              className="absolute inset-0 bg-cover bg-center filter blur-xl scale-105 pointer-events-none"
              style={{ backgroundImage: `url(${kawarpSrc})` }}
            />
          )}
        </AnimatePresence>
        {effectsReady && effects.liveBackground ? (
          <KawarpWrapper src={kawarpSrc} onLoad={onKawarpLoad} onError={onError} />
        ) : null}
      </div>

      <div className={`absolute inset-0 z-[1] ${isMobile ? "bg-black/40" : "lane-fs-desktop-shade"}`} />
      {!isMobile && chromeMask && <div aria-hidden className="lane-fs-chrome-glass" style={{ maskImage: chromeMask, WebkitMaskImage: chromeMask }} />}
      {isMobile && <div aria-hidden className="absolute inset-x-0 top-0 z-20" style={{ height: dismissZoneHeight, touchAction: "none" }} />}


      <div
        className={`lane-fs-content absolute inset-0 z-10 flex ${isMobile ? "flex-col" : ""}`}
        style={isMobile ? { paddingTop: "calc(var(--lane-safe-top, 0px) + 48px)", paddingBottom: "var(--lane-safe-bottom, 0px)" } : undefined}
      >
        <div className={`flex-1 flex flex-col items-center justify-center gap-5 ${isMobile && mobileLyrics ? "hidden" : ""}`}>
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
                  <BraccatoLyricsView lyrics={braccatoLyrics} animateLetters={effects.letterAnimation} blurEdges={effects.lyricBlur} />
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
                  <button
                    type="button"
                    onClick={() => setCustomLyricsOpen(true)}
                    className="mt-[4px] inline-flex h-[34px] items-center gap-[6px] rounded-lg border-0 bg-white/10 px-[14px] text-[13px] font-[500] text-white/90 backdrop-blur-md hover:bg-white/20 active:scale-[0.97] transition-all cursor-pointer"
                  >
                    <AddLine size={15} />
                    {t("player.custom_lyrics_add") || "Add your lyrics"}
                  </button>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>

      <CustomLyricsDialog
        open={customLyricsOpen}
        onOpenChange={setCustomLyricsOpen}
        trackId={player.currentTrack?.id ?? null}
        trackTitle={player.currentTrack?.title}
      />

      <AnimatePresence>
        {isMobile && speedOpen && (
          <motion.div
            key="speed-sheet"
            data-no-sheet-drag
            className="absolute inset-0 z-40 flex items-end bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSpeedOpen(false)}
          >
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
              className="w-full max-h-[88dvh] overflow-y-auto overscroll-contain rounded-t-2xl border-t border-white/[0.08] bg-black/20 p-[18px] backdrop-blur-xl"
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
              {audioSheet === "eq" ? <EqualizerPicker /> : <SpeedPitchPicker onClose={() => setSpeedOpen(false)} />}
            </motion.div>
          </motion.div>
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
      {/* top-right group: phones get like + lyrics + devices together; on the
          desktop the devices button sits right next to the window controls */}
      <div
        ref={toolbar}
        className={`absolute z-30 flex max-w-[calc(100vw-64px)] flex-wrap items-center justify-end gap-[8px] ${isMobile ? "" : "lane-fs-toolbar"}`}
        style={isMobile ? { top: "calc(var(--lane-safe-top, 0px) + 10px)", right: 12, touchAction: "none" } : { top: 0, left: "50%", transform: "translateX(-50%)" }}
        data-no-window-drag
      >
        {!isMobile && <VisualQualityPicker />}
        {showProviderIsland && <LyricsProviderIsland />}
        {hasLyrics && (
          <button
            type="button"
            onClick={() => setCustomLyricsOpen(true)}
            title={t("player.custom_lyrics_edit") || "Edit lyrics"}
            aria-label={t("player.custom_lyrics_edit") || "Edit lyrics"}
            className="inline-flex h-[32px] w-[32px] items-center justify-center rounded-lg border-none bg-black/50 text-white/70 backdrop-blur-md cursor-pointer"
          >
            <Edit2Line size={16} />
          </button>
        )}
        {isMobile && (
          <button
            type="button"
            onClick={() => setMobileLyrics((v) => !v)}
            aria-pressed={mobileLyrics}
            className={`inline-flex h-[34px] items-center gap-[6px] rounded-lg border-none px-[14px] text-[13px] font-[500] backdrop-blur-xl transition-colors cursor-pointer ${
              mobileLyrics ? "bg-white text-black" : "bg-black/45 text-white/85"
            }`}
          >
            {t("player.lyrics") || "Lyrics"}
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
    </div>
  );
}

export default function PlayerPage() {
  const navigate = useNavigate();
  return <FullscreenPlayer onClose={() => navigate(-1)} />;
}
