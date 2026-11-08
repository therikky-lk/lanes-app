import { useConnectStore } from "@/features/connect/connectService";
import { useTranslation } from "@/languages";
import { SkipNext, SkipPrevious } from "@solar-icons/react";
import { Sidebar } from "@solar-icons/react";
import { HeartFill, HeartLine } from "@mingcute/react";
import { useCallback, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { usePlayerStore } from "../store/playerStore";
import { playerEngine } from "../engine/playerEngine";
import MiniPlayerTrackInfo from "./MiniPlayerTrackInfo";
import { PlayPauseIcon } from "./PlayerUiElements";
import CoverImage from "@/features/covers/ui/CoverImage";
import { useIsTrackLiked, useLikeTrack, useUnlikeTrack } from "@/features/library/hooks";

/** phone mini player: cover, title, play/pause and next; tap opens the full player */
function MobileProgress() {
  const progress = usePlayerStore(state => state.fullscreen || state.durationMs <= 0 ? 0 : Math.min(1, state.positionMs / state.durationMs));
  return <div className="h-full w-full origin-left rounded-full bg-text-primary" style={{ transform: `scaleX(${progress})` }} />;
}

export default function MobileMiniPlayer({ onQueueToggle }: { onQueueToggle?: () => void } = {}) {
  const player = usePlayerStore(useShallow(s => ({ currentTrack: s.currentTrack, status: s.status, queue: s.queue, currentIndex: s.currentIndex, repeat: s.repeat })));
  const setFullscreen = usePlayerStore((s) => s.setFullscreen);
  const track = player.currentTrack;
  const { t } = useTranslation();
  const remoteName = useConnectStore((s) => (s.followingId ? s.devices[s.followingId]?.name ?? "…" : null));
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

  if (!track) return null;
  const queue = player.queue ?? [];
  const index = player.currentIndex ?? -1;
  const neighbor = (step: number) => {
    const at = index + step;
    return queue[at] ?? (player.repeat === "all" && queue.length > 1 ? queue[(at + queue.length) % queue.length] : undefined);
  };
  const info = (item: typeof track | undefined) => item ? <>
    <p className="m-0 truncate text-[14px] font-[500] text-text-primary">{item.title}</p>
    <p className="m-0 truncate text-[12px] text-text-tertiary">{item.artists}</p>
  </> : null;

  return (
    <div
      className="lane-dock-glass lane-dock-glass--elevated relative mx-[8px] mb-[6px] flex h-[56px] items-center gap-[10px] overflow-hidden rounded-xl bg-bg-elevated/75 backdrop-blur-2xl backdrop-saturate-150 border border-white/[0.06] px-[8px] shadow-[0_6px_24px_rgba(0,0,0,0.35)]"
      style={{ fontFamily: "var(--font-inter), sans-serif" }}
      onClick={() => setFullscreen(true)}
      role="button"
    >
      <div className="relative h-[40px] w-[40px] shrink-0 overflow-hidden rounded-md bg-bg-panel">
        {track.coverUrl && <CoverImage src={track.coverUrl} alt={track.title} fill sizes="40px" className="object-cover" draggable={false} />}
      </div>
      <MiniPlayerTrackInfo trackId={track.id} previous={info(neighbor(-1))} next={info(neighbor(1))} onSwipe={(direction) => {
        if (direction === "next") void playerEngine.skipNext();
        else void playerEngine.skipPrevious(true);
      }}>
        <p className="m-0 truncate text-[14px] font-[500] text-text-primary">{track.title}</p>
        {remoteName ? (
          <p className="m-0 truncate text-[12px] text-accent-primary">
            {(t("connect.playing_on", { name: remoteName }) || "").includes(remoteName) ? t("connect.playing_on", { name: remoteName }) : `Playing on ${remoteName}`}
          </p>
        ) : (
          <p className="m-0 truncate text-[12px] text-text-tertiary">{track.artists}</p>
        )}
      </MiniPlayerTrackInfo>
      <button
        type="button"
        aria-label={isLiked ? t("common.unlike") : t("common.like")}
        aria-pressed={isLiked}
        onClick={(e) => {
          e.stopPropagation();
          handleLikeToggle();
        }}
        className={`inline-flex h-[40px] w-[36px] shrink-0 items-center justify-center rounded-full border-0 bg-transparent cursor-pointer transition-colors duration-150 ${
          isLiked ? "text-[#ff3b5c]" : "text-text-primary"
        }`}
      >
        {isLiked ? <HeartFill size={21} /> : <HeartLine size={21} />}
      </button>
      <button
        type="button"
        aria-label={t("player.previous")}
        onClick={(e) => {
          e.stopPropagation();
          void playerEngine.skipPrevious();
        }}
        className="inline-flex h-[40px] w-[36px] shrink-0 items-center justify-center rounded-full border-0 bg-transparent text-text-primary cursor-pointer"
      >
        <SkipPrevious size={22} weight="Bold" />
      </button>
      <button
        type="button"
        aria-label={player.status === "playing" ? t("common.pause") : t("common.play")}
        onClick={(e) => {
          e.stopPropagation();
          void playerEngine.togglePlayPause();
        }}
        className="inline-flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-full border-0 bg-transparent text-text-primary cursor-pointer"
      >
        <PlayPauseIcon status={player.status} />
      </button>
      <button
        type="button"
        aria-label={t("player.next")}
        onClick={(e) => {
          e.stopPropagation();
          void playerEngine.skipNext();
        }}
        className="inline-flex h-[40px] w-[36px] shrink-0 items-center justify-center rounded-full border-0 bg-transparent text-text-primary cursor-pointer"
      >
        <SkipNext size={22} weight="Bold" />
      </button>
      <button
        type="button"
        aria-label={t("player.queue")}
        title={t("player.queue")}
        onClick={(e) => { e.stopPropagation(); onQueueToggle?.(); }}
        className="inline-flex h-[40px] w-[36px] shrink-0 items-center justify-center rounded-full border-0 bg-transparent text-text-primary cursor-pointer"
      >
        <Sidebar size={20} weight="Bold" />
      </button>
      <div className="absolute bottom-0 left-[8px] right-[8px] h-[2px] rounded-full bg-border-alpha-14">
        {/* scaleX instead of width: no layout on every position tick */}
        <MobileProgress />
      </div>
    </div>
  );
}
