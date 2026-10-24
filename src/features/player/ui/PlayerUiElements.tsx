import { useIsMobile } from "@/shared/hooks/useIsMobile";
import { useState, useRef, useCallback, useEffect } from "react";
import { useLocation } from "react-router-dom";
import {
  SkipNext,
  SkipPrevious,
  MusicNote,
  Repeat,
  RepeatOne,
  Shuffle,
} from "@solar-icons/react";
import { HeartFill, HeartLine } from "@mingcute/react";
import {
  PlayerMorphIcon,
  ICON_PLAY,
  ICON_PAUSE,
} from "./morphPlayerIcons";
import { usePlayerState } from "../hooks/usePlayerState";
import { playerEngine } from "../engine/playerEngine";
import { isRadioContext, nextRepeatMode } from "../engine/radioMode";
import { useIsTrackLiked, useLikeTrack, useUnlikeTrack } from "@/features/library/hooks";
import { AnimatePresence, motion } from "framer-motion";
import { ArtistLink } from "@/features/artist";
import { useCoverReady, CoverImage } from "@/features/covers";
import ExplicitBadge from "@/shared/ui/ExplicitBadge";
import SourceBadge from "@/shared/ui/SourceBadge";
import { VolumePicker } from "./VolumePicker";
import { TimelineSlider } from "./TimelineSlider";

import { useTranslation } from "@/languages";

const iconButtonClass =
  "inline-flex h-[40px] w-[40px] items-center justify-center text-white opacity-70 transition-all duration-150 ease-out hover:opacity-100 active:scale-[0.94] shrink-0 border-none bg-transparent cursor-pointer";

export function PlayPauseIcon({ status }: { status: string }) {
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
          aria-label="Loading playback"
        />
      )}
    </span>
  );
}

interface PlayerUiElementsProps {
  onDuration?: (duration: number) => void;
  onClose?: () => void;
}

export function PlayerUiElements({
  onDuration: _onDuration,
  onClose,
}: PlayerUiElementsProps) {
  const player = usePlayerState();

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

  // phones: no hover, so a tap on the cover shows the heart for a moment and a
  // double tap likes the track (with a burst)
  const [heartShown, setHeartShown] = useState(false);
  const [burst, setBurst] = useState(0);
  const lastTapRef = useRef(0);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showHeart = useCallback(() => {
    setHeartShown(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setHeartShown(false), 2500);
  }, []);
  useEffect(() => () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
  }, []);
  const onCoverTap = useCallback(
    (e: React.PointerEvent) => {
      if (!isMobile || (e.target as HTMLElement).closest("button")) return;
      const now = Date.now();
      if (now - lastTapRef.current < 320) {
        lastTapRef.current = 0;
        setBurst((n) => n + 1);
        if (track && !isLiked && !togglingRef.current) {
          togglingRef.current = true;
          likeMutation.mutate(track.id, { onSettled: () => (togglingRef.current = false) });
        }
        showHeart();
        return;
      }
      lastTapRef.current = now;
      showHeart();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [track, isLiked, likeMutation, showHeart],
  );

  const { t } = useTranslation();

  const S = isMobile ? "min(84vw, 44vh)" : "clamp(300px, min(36vw, 52vh), 460px)";

  return (
    <>
      {/* Artwork: grows with the window */}
      <div
        style={{ width: S, height: S }}
        className={`group/cover relative shrink-0 overflow-hidden rounded-2xl bg-black/20 shadow-[0_24px_80px_rgba(0,0,0,0.45)] ${
          coverUrl && !isCoverLoaded ? "animate-pulse" : ""
        }`}
        onPointerUp={onCoverTap}
      >
        <AnimatePresence>
          <motion.div
            key={track?.id || coverUrl || "empty"}
            initial={isMobile ? { opacity: 0 } : { opacity: 0, filter: "blur(8px)" }}
            animate={isMobile ? { opacity: 1 } : { opacity: 1, filter: "blur(0px)" }}
            exit={isMobile ? { opacity: 0 } : { opacity: 0, filter: "blur(8px)" }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="absolute inset-0"
          >
            {coverUrl ? (
              <CoverImage
                key={coverUrl}
                src={coverUrl}
                alt={trackTitle}
                fill
                sizes="460px"
                priority
                unoptimized
                className="rounded-2xl object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-white/5 text-white/40">
                <MusicNote size={64} />
              </div>
            )}
          </motion.div>
        </AnimatePresence>
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
        {/* like button: centred on the cover; desktop shows it on hover, phones after a tap */}
        {<button
          type="button"
          aria-label={isLiked ? t("common.unlike") : t("common.like")}
          className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 inline-flex h-[72px] w-[72px] items-center justify-center rounded-full ${
            isMobile ? (heartShown && burst === 0 ? "opacity-100" : "opacity-0 pointer-events-none") : "opacity-0 group-hover/cover:opacity-100"
          } focus-visible:opacity-100 transition-[opacity,transform,background-color] duration-200 ease-out active:scale-[0.92] bg-black/35 backdrop-blur-md border-none hover:bg-black/50 ${
            isLiked ? "text-[#ff3b5c]" : "text-white/85 hover:text-white"
          }`}
          onClick={() => {
            handleLikeToggle();
            if (isMobile) showHeart();
          }}
          style={{ cursor: "pointer" }}
        >
          {/* subtle crossfade: outline heart out, filled heart in with a slight scale */}
          <motion.div
            initial={false}
            animate={{ scale: isLiked ? 0.85 : 1, opacity: isLiked ? 0 : 1 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <HeartLine size={34} />
          </motion.div>
          <motion.div
            initial={false}
            animate={{ scale: isLiked ? 1 : 0.75, opacity: isLiked ? 1 : 0 }}
            transition={
              isLiked
                ? { type: "spring", stiffness: 500, damping: 30, mass: 0.6 }
                : { duration: 0.16, ease: "easeOut" }
            }
            className="absolute inset-0 flex items-center justify-center"
          >
            <HeartFill size={34} />
          </motion.div>
        </button>}
      </div>

      {/* Track info */}
      <div style={{ width: S }} className="flex items-start justify-center min-w-0 mt-[4px]">
        <div className="flex flex-col gap-[2px] min-w-0 text-center">
          <p
            className="m-0 text-[22px] leading-[1.2] font-[650] text-white flex items-center justify-center gap-[6px] max-w-full"
            style={{ letterSpacing: "-0.03em" }}
          >
            <span className="min-w-0 truncate">{trackTitle}</span>
          </p>
          <p className="m-0 mt-[2px] flex items-center justify-center gap-[5px] text-[15px] text-white/65 leading-snug max-w-full overflow-hidden">
            {track && <SourceBadge trackId={track.id} size={15} />}
            {track?.explicit && (
              <ExplicitBadge className="!bg-white/60 !text-black !pb-0 !leading-none shrink-0" />
            )}
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
          </p>
        </div>
      </div>

      {/* Timeline (Compact, with smooth spring pill, no thumb) */}
      <TimelineSlider
        positionMs={player.positionMs}
        durationMs={player.durationMs}
        onSeek={(pos) => playerEngine.seek(pos)}
        showTime
        size="lg"
        className="text-[12px]"
        style={{ width: `min(calc(${S} + 72px), 92vw)` }}
      />

      {/* Primary Playback Controls */}
      <div className="flex items-center gap-[26px]">
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
          aria-label="Previous track"
          onClick={() => void playerEngine.skipPrevious()}
          className={iconButtonClass}
        >
          <SkipPrevious size={28} weight="Bold" />
        </button>

        <button
          type="button"
          aria-label={player.status === "playing" ? "Pause" : "Play"}
          onClick={() => void playerEngine.togglePlayPause()}
          className="inline-flex h-[60px] w-[60px] items-center justify-center rounded-full bg-white text-black transition-all duration-150 ease-out hover:scale-[1.05] active:scale-[0.94] shrink-0 border-none cursor-pointer shadow-[0_8px_30px_rgba(0,0,0,0.35)]"
        >
          <span className="flex scale-[1.35]">
            <PlayPauseIcon status={player.status} />
          </span>
        </button>

        <button
          type="button"
          aria-label="Next track"
          onClick={() => void playerEngine.skipNext()}
          className={iconButtonClass}
        >
          <SkipNext size={28} weight="Bold" />
        </button>

        <button
          type="button"
          aria-label="Repeat"
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
}

export default PlayerUiElements;
