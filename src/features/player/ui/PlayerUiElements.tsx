import { useShallow } from "zustand/react/shallow";
import { usePlayerStore } from "../store/playerStore";
import { setArtworkInteracting } from "../store/artworkInteractionStore";
import { coverSwipeIntent, coverSlideScale } from "./coverSwipe";
import { ArtistAvatars } from "@/features/artist/ui/ArtistAvatars";
import { useIsMobile } from "@/shared/hooks/useIsMobile";
import { useState, useRef, useCallback, useEffect, useLayoutEffect, memo } from "react";
import { useLocation } from "react-router-dom";
import {
  SkipNext,
  SkipPrevious,
  Repeat,
  RepeatOne,
  Shuffle,
} from "@solar-icons/react";
import { HeartFill, HeartLine, Music2Fill } from "@mingcute/react";
import {
  PlayerMorphIcon,
  ICON_PLAY,
  ICON_PAUSE,
} from "./morphPlayerIcons";
import { playerEngine } from "../engine/playerEngine";
import { isRadioContext, nextRepeatMode } from "../engine/radioMode";
import { useIsTrackLiked, useLikeTrack, useUnlikeTrack } from "@/features/library/hooks";
import { AnimatePresence, motion, useMotionValue, useTransform, animate } from "framer-motion";
import { ArtistLink } from "@/features/artist";
import { useCoverReady, CoverImage, preloadCoverArt } from "@/features/covers";
import ExplicitBadge from "@/shared/ui/ExplicitBadge";
import SourceBadge from "@/shared/ui/SourceBadge";
import { VolumePicker } from "./VolumePicker";
import { TimelineSlider } from "./TimelineSlider";

import { useTranslation } from "@/languages";

const COVER_GAP = 16;

const iconButtonClass =
  "inline-flex h-[40px] w-[40px] items-center justify-center text-white opacity-70 transition-all duration-150 ease-out hover:opacity-100 active:scale-[0.94] shrink-0 border-none bg-transparent cursor-pointer";

export function PlayPauseIcon({ status }: { status: string }) {
  const { t } = useTranslation();
  const loading = status === "loading";
  const playing = status === "playing";
  // keep the morph icon mounted through the loading state (spinner overlays
  // it) — unmounting the icon on "loading" would remount MorphIcon when the
  // track starts, which skips the play -> pause morph animation.
  return (
    <span className="relative flex h-[22px] w-[22px] items-center justify-center">
      <span
        className={`absolute inset-0 flex items-center justify-center ${
          loading ? "opacity-0" : ""
        } transition-transform ${playing ? "" : "translate-x-[1px]"}`}
      >
        <PlayerMorphIcon
          icon={playing ? ICON_PAUSE : ICON_PLAY}
          size={22}
        />
      </span>
      {loading && (
        <span
          className="absolute h-[18px] w-[18px] animate-spin rounded-full border-[2px] border-current border-t-transparent"
          aria-label={t("player.loading_playback")}
        />
      )}
    </span>
  );
}

interface PlayerUiElementsProps {
  onDuration?: (duration: number) => void;
  onClose?: () => void;
}

function PlaybackTimeline({ width }: { width: string }) {
  const state = usePlayerStore(useShallow(s => ({ positionMs: s.positionMs, durationMs: s.durationMs, fallbackDuration: s.currentTrack?.durationMs ?? 0 })));
  return <TimelineSlider positionMs={state.positionMs} durationMs={state.durationMs > 0 ? state.durationMs : state.fallbackDuration}
    onSeek={playerEngine.seek.bind(playerEngine)} showTime size="lg" className="text-[12px]" style={{ width }} />;
}

export const PlayerUiElements = memo(function PlayerUiElements({
  onDuration: _onDuration,
  onClose,
}: PlayerUiElementsProps) {
  const player = usePlayerStore(useShallow(s => ({ currentTrack: s.currentTrack, queue: s.queue, currentIndex: s.currentIndex, status: s.status, repeat: s.repeat, shuffle: s.shuffle, playbackContext: s.playbackContext })));

  const track = player.currentTrack;
  const coverUrl = track?.coverUrl || "";
  const trackTitle = track?.title || "";
  const trackArtists = track?.artists || "";

  const isMobile = useIsMobile();
  const isLiked = useIsTrackLiked(track?.id);
  const likeMutation = useLikeTrack();
  const unlikeMutation = useUnlikeTrack();
  const togglingRef = useRef(false);

  const handleLikeToggle = useCallback(() => {
    if (!track || togglingRef.current) return;
    togglingRef.current = true;
    const onSettled = () => {
      togglingRef.current = false;
    };
    if (isLiked) {
      unlikeMutation.mutate(track.id, { onSettled });
    } else {
      likeMutation.mutate(track.id, { onSettled });
    }
  }, [track, isLiked, likeMutation, unlikeMutation]);

  const isCoverLoaded = useCoverReady(coverUrl);
  const previousCoverUrl = player.queue[player.currentIndex - 1]?.coverUrl;
  const nextCoverUrl = player.queue[player.currentIndex + 1]?.coverUrl;
  useEffect(() => {
    void preloadCoverArt(previousCoverUrl);
    void preloadCoverArt(nextCoverUrl);
  }, [previousCoverUrl, nextCoverUrl]);

  // On phones, double-tapping the cover likes the track and shows a burst.
  const [burst, setBurst] = useState(0);
  const coverDragX = useMotionValue(0);
  const coverStep = useRef(1);
  const currentCoverScale = useTransform(coverDragX, x => coverSlideScale(x, coverStep.current, 0));
  const previousCoverScale = useTransform(coverDragX, x => coverSlideScale(x, coverStep.current, -1));
  const nextCoverScale = useTransform(coverDragX, x => coverSlideScale(x, coverStep.current, 1));
  const coverAnimation = useRef<ReturnType<typeof animate> | null>(null);
  const swipePending = useRef(false);
  useLayoutEffect(() => {
    coverAnimation.current?.stop();
    setArtworkInteracting(false);
    coverDragX.set(0);
    swipePending.current = false;
    coverPointerStartRef.current = null;
  // Queue entries can share an ID; the cursor still changes and must reset the artwork.
  }, [track?.id, player.currentIndex, isMobile, coverDragX]);
  useEffect(() => () => { coverAnimation.current?.stop(); setArtworkInteracting(false); }, []);
  const lastTapRef = useRef(0);
  const coverPointerStartRef = useRef<{ x: number; y: number; axis: "x" | "y" | null } | null>(null);
  const onCoverPointerDown = useCallback((e: React.PointerEvent) => {
    if (!isMobile || (e.target as HTMLElement).closest("button")) return;
    if (swipePending.current || !e.isPrimary) return;
    coverAnimation.current?.stop();
    coverStep.current = e.currentTarget.getBoundingClientRect().width + COVER_GAP;
    coverPointerStartRef.current = { x: e.clientX, y: e.clientY, axis: null };
  }, [isMobile]);

  const onCoverTap = useCallback(
    (e: React.PointerEvent) => {
      if (!isMobile || (e.target as HTMLElement).closest("button")) return;
      const start = coverPointerStartRef.current;
      coverPointerStartRef.current = null;
      setArtworkInteracting(false);
      if (start) {
        const deltaX = e.clientX - start.x;
        const deltaY = e.clientY - start.y;
        const intent = start.axis === "y" ? null : coverSwipeIntent(deltaX, deltaY);
        if (intent) {
          lastTapRef.current = 0;
          e.stopPropagation();
          swipePending.current = true;
          const distance = coverStep.current;
          const before = track?.id;
          const beforeIndex = player.currentIndex;
          coverAnimation.current = animate(coverDragX, intent === "next" ? -distance : distance, { duration: 0.18, ease: "easeOut" });
          void coverAnimation.current.then(async () => {
            try { if (intent === "next") await playerEngine.skipNext(); else await playerEngine.skipPrevious(); }
            catch { /* The player reports playback failures through its normal state. */ }
            finally {
              const snapshot = playerEngine.getSnapshot();
              if (snapshot.currentTrack?.id === before && snapshot.currentIndex === beforeIndex) {
                swipePending.current = false;
                coverAnimation.current = animate(coverDragX, 0, { type: "spring", stiffness: 350, damping: 32 });
              }
            }
          });
          return;
        }
        coverAnimation.current = animate(coverDragX, 0, { type: "spring", stiffness: 350, damping: 32 });
        if (Math.abs(deltaX) > 12 || Math.abs(deltaY) > 12) return;
      }
      const now = Date.now();
      if (now - lastTapRef.current < 320) {
        lastTapRef.current = 0;
        setBurst((n) => n + 1);
        if (track && !isLiked && !togglingRef.current) {
          togglingRef.current = true;
          likeMutation.mutate(track.id, { onSettled: () => (togglingRef.current = false) });
        }
        return;
      }
      lastTapRef.current = now;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [track, player.currentIndex, isLiked, likeMutation, isMobile, coverDragX],
  );

  const { t } = useTranslation();

  const S = isMobile ? "min(84vw, 44vh)" : "clamp(300px, min(36vw, 52vh), 460px)";
  const controlsWidth = `min(calc(${S} + 72px), 92vw)`;
  const heartLayerClass = `absolute inset-0 flex items-center ${isMobile ? "justify-end" : "justify-center"}`;
  const heartSize = isMobile ? 24 : 30;
  const likeButton = (
    <button
      type="button"
      aria-label={isLiked ? t("common.unlike") : t("common.like")}
      aria-pressed={isLiked}
      disabled={!track}
      className={`inline-flex shrink-0 rounded-full border-none cursor-pointer transition-[opacity,transform,background-color] duration-200 ease-out active:scale-[0.92] ${
        isMobile
          ? "relative h-[44px] w-[44px] bg-transparent opacity-95 disabled:opacity-40"
          : "pointer-events-none absolute inset-0 z-10 m-auto h-[72px] w-[72px] bg-black/55 opacity-0 backdrop-blur-[2px] hover:bg-black/65 group-hover/cover:pointer-events-auto group-hover/cover:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100"
      } ${isLiked ? "text-[#ff3b5c]" : "text-white/85 hover:text-white"}`}
      onClick={handleLikeToggle}
    >
      <motion.span
        initial={false}
        animate={{ scale: isLiked ? 0.85 : 1, opacity: isLiked ? 0 : 1 }}
        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        className={heartLayerClass}
      >
        <HeartLine size={heartSize} />
      </motion.span>
      <motion.span
        initial={false}
        animate={{ scale: isLiked ? 1 : 0.75, opacity: isLiked ? 1 : 0 }}
        transition={
          isLiked
            ? { type: "spring", stiffness: 500, damping: 30, mass: 0.6 }
            : { duration: 0.16, ease: "easeOut" }
        }
        className={heartLayerClass}
      >
        <HeartFill size={heartSize} />
      </motion.span>
    </button>
  );

  return (
    <>
      {/* Artwork: grows with the window */}
      <div
        style={{ width: S, height: S, touchAction: "pan-y" }}
        className={`group/cover relative shrink-0 ${isMobile ? "overflow-visible" : "overflow-hidden rounded-2xl bg-black/20 shadow-[0_24px_80px_rgba(0,0,0,0.45)]"} ${
          coverUrl && !isCoverLoaded && !isMobile ? "animate-pulse" : ""
        }`}
        data-player-artwork
        data-no-sheet-drag
        onPointerDown={onCoverPointerDown}
        onPointerMove={event => {
          const start = coverPointerStartRef.current;
          if (!isMobile || !start || swipePending.current) return;
          const dx = event.clientX - start.x, dy = event.clientY - start.y;
          if (!start.axis && Math.max(Math.abs(dx), Math.abs(dy)) > 8) {
            start.axis = Math.abs(dx) > Math.abs(dy) * 1.25 ? "x" : "y";
            if (start.axis === "x") setArtworkInteracting(true);
          }
          if (start.axis !== "x") return;
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.setPointerCapture(event.pointerId);
          event.stopPropagation();
          coverDragX.set(dx);
        }}
        onPointerCancel={() => {
          setArtworkInteracting(false);
          coverPointerStartRef.current = null;
          coverAnimation.current = animate(coverDragX, 0, { type: "spring", stiffness: 350, damping: 32 });
        }}
        onPointerUp={event => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
          onCoverTap(event);
        }}
      >
        <motion.div className="absolute inset-0" style={isMobile ? { x: coverDragX, willChange: "transform" } : undefined}>
          <motion.div style={isMobile ? { scale: currentCoverScale } : undefined} className={`absolute inset-0 overflow-hidden rounded-2xl bg-black/20 ${isMobile ? "shadow-[0_8px_24px_rgba(0,0,0,0.25)]" : ""}`}>
            {coverUrl ? <CoverImage src={coverUrl} alt={trackTitle} fill sizes="460px" priority unoptimized className="object-cover" draggable={false} />
              : <div className="flex h-full w-full items-center justify-center bg-white/5 text-white/40"><Music2Fill size={64} /></div>}
          </motion.div>
          {isMobile && [-1, 1].map(direction => {
            const adjacent = player.queue[player.currentIndex + direction];
            // An absent queue item is not an empty album: do not slide a fake
            // placeholder over the current artwork while the next track loads.
            if (!adjacent) return null;
            return <motion.div key={direction} aria-hidden className="pointer-events-none absolute inset-y-0 w-full overflow-hidden rounded-2xl bg-black/20 shadow-[0_8px_24px_rgba(0,0,0,0.25)]" style={{ left: `calc(${direction * 100}% + ${direction * COVER_GAP}px)`, scale: direction < 0 ? previousCoverScale : nextCoverScale, transformOrigin: `${direction < 0 ? "100%" : "0%"} 50%` }}>
              {adjacent.coverUrl ? <CoverImage src={adjacent.coverUrl} alt="" fill sizes="460px" className="object-cover" draggable={false} />
                : <div className="flex h-full w-full items-center justify-center bg-white/5 text-white/40"><Music2Fill size={64} /></div>}
            </motion.div>;
          })}
        </motion.div>
        {!isMobile && track && likeButton}
        {/* double-tap burst (phones) */}
        <AnimatePresence>
          {burst > 0 && (
            <motion.div
              key={burst}
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: [0.4, 1.15, 1], opacity: [0, 1, 1, 0] }}
              transition={{ duration: 0.9, times: [0, 0.35, 0.6, 1], ease: "easeOut" }}
              onAnimationComplete={() => setBurst(0)}
              className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center text-[#ff3b5c] drop-shadow-[0_4px_24px_rgba(0,0,0,0.45)]"
            >
              <HeartFill size={110} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Track info */}
      <div style={{ width: isMobile ? S : controlsWidth }} className="mt-[4px] flex min-w-0 items-center gap-3">
        <div className={`flex min-w-0 flex-1 flex-col gap-[2px] ${isMobile ? "text-left" : "items-center text-center"}`}>
          <p
            className="m-0 text-[22px] leading-[1.2] font-[650] text-white flex items-center gap-[6px] max-w-full"
            style={{ letterSpacing: "-0.03em" }}
          >
            <span className="min-w-0 truncate">{trackTitle}</span>
          </p>
          <p className="m-0 mt-[2px] flex items-center gap-[5px] text-[15px] text-white/65 leading-snug max-w-full overflow-hidden">
            {track && <SourceBadge trackId={track.id} size={15} />}
            <ArtistAvatars name={trackArtists} artistId={track?.artistId} artistList={track?.artistList} />
            <ArtistLink
              name={trackArtists}
              artistId={track?.artistId}
              artistList={track?.artistList}
              onNavigate={() => {
                if (location.pathname !== "/player") {
                  onClose?.();
                }
              }}
              className="text-white/60"
            />
            {track?.explicit && (
              <ExplicitBadge className="!bg-white/60 !text-black !pb-0 !leading-none shrink-0" />
            )}
          </p>
        </div>
        {isMobile && likeButton}
      </div>

      {/* Timeline (Compact, with smooth spring pill, no thumb) */}
      <PlaybackTimeline width={controlsWidth} />

      {/* Primary Playback Controls */}
      <div className={`flex items-center ${isMobile ? "gap-[clamp(8px,3.5vw,16px)]" : "gap-[26px]"}`}>
        <button
          type="button"
          aria-label={player.shuffle ? t("player.shuffle_on") : t("player.shuffle_off")}
          onClick={() => playerEngine.setShuffle(!player.shuffle)}
          className={`${iconButtonClass} ${
            player.shuffle ? "!text-white !opacity-100" : "!text-white/40"
          }`}
        >
          <Shuffle size={22} weight="Outline" />
        </button>

        <button
          type="button"
          aria-label={t("player.previous")}
          onClick={() => void playerEngine.skipPrevious()}
          className={iconButtonClass}
        >
          <SkipPrevious size={28} weight="Bold" />
        </button>

        <button
          type="button"
          aria-label={player.status === "playing" ? t("common.pause") : t("common.play")}
          onClick={() => void playerEngine.togglePlayPause()}
          className="inline-flex h-[60px] w-[60px] items-center justify-center rounded-full bg-white text-black transition-all duration-150 ease-out hover:scale-[1.05] active:scale-[0.94] shrink-0 border-none cursor-pointer shadow-[0_8px_30px_rgba(0,0,0,0.35)]"
        >
          <span className="flex scale-[1.35]">
            <PlayPauseIcon status={player.status} />
          </span>
        </button>

        <button
          type="button"
          aria-label={t("player.next")}
          onClick={() => void playerEngine.skipNext()}
          className={iconButtonClass}
        >
          <SkipNext size={28} weight="Bold" />
        </button>

        <button
          type="button"
          aria-label={t("player.repeat")}
          onClick={() =>
            playerEngine.setRepeat(
              // radio has no repeat-all: it refills instead of looping
              nextRepeatMode(player.repeat, isRadioContext(player.playbackContext)),
            )
          }
          className={`${iconButtonClass} ${
            player.repeat !== "off" ? "!text-white !opacity-100" : "!text-white/40"
          }`}
        >
          {player.repeat === "one" ? (
            <RepeatOne size={22} />
          ) : (
            <Repeat size={22} />
          )}
        </button>

      </div>

      {/* Volume (Compact smooth slider, size sm) */}
      {!isMobile && <VolumePicker className="mt-[2px]" size="md" style={{ width: `calc(${S} * 0.62)` }} />}
    </>
  );
});

export default PlayerUiElements;
