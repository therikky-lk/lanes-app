import { useConnectStore } from "@/features/connect/connectService";
import { useTranslation } from "@/languages";
import { SkipNext, SkipPrevious } from "@solar-icons/react";
import { HeartFill, HeartLine } from "@mingcute/react";
import { useCallback, useRef } from "react";
import { usePlayerState } from "../hooks/usePlayerState";
import { usePlayerStore } from "../store/playerStore";
import { playerEngine } from "../engine/playerEngine";
import { PlayPauseIcon } from "./PlayerUiElements";
import CoverImage from "@/features/covers/ui/CoverImage";
import { useIsTrackLiked, useLikeTrack, useUnlikeTrack } from "@/features/library/hooks";

/** phone mini player: cover, title, play/pause and next; tap opens the full player */
export default function MobileMiniPlayer() {
  const player = usePlayerState();
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
  const progress = player.durationMs > 0 ? Math.min(1, player.positionMs / player.durationMs) : 0;

  return (
    <div
      className="relative mx-[8px] mb-[6px] flex h-[56px] items-center gap-[10px] overflow-hidden rounded-xl bg-bg-elevated/75 backdrop-blur-2xl backdrop-saturate-150 border border-white/[0.06] px-[8px] shadow-[0_6px_24px_rgba(0,0,0,0.35)]"
      style={{ fontFamily: "var(--font-inter), sans-serif" }}
      onClick={() => setFullscreen(true)}
      role="button"
    >
      <div className="relative h-[40px] w-[40px] shrink-0 overflow-hidden rounded-md bg-bg-panel">
        {track.coverUrl && <CoverImage src={track.coverUrl} alt={track.title} fill sizes="40px" className="object-cover" draggable={false} />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="m-0 truncate text-[14px] font-[500] text-text-primary">{track.title}</p>
        {remoteName ? (
          <p className="m-0 truncate text-[12px] text-accent-primary">
            {(t("connect.playing_on", { name: remoteName }) || "").includes(remoteName) ? t("connect.playing_on", { name: remoteName }) : `Playing on ${remoteName}`}
          </p>
        ) : (
          <p className="m-0 truncate text-[12px] text-text-tertiary">{track.artists}</p>
        )}
      </div>
      <button
        type="button"
        aria-label="Previous track"
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
        aria-label={player.status === "playing" ? "Pause" : "Play"}
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
        aria-label="Next track"
        onClick={(e) => {
          e.stopPropagation();
          void playerEngine.skipNext();
        }}
        className="inline-flex h-[40px] w-[36px] shrink-0 items-center justify-center rounded-full border-0 bg-transparent text-text-primary cursor-pointer"
      >
        <SkipNext size={22} weight="Bold" />
      </button>
      <div className="absolute bottom-0 left-[8px] right-[8px] h-[2px] rounded-full bg-border-alpha-14">
        <div className="h-full rounded-full bg-text-primary" style={{ width: `${progress * 100}%` }} />
      </div>
    </div>
  );
}
