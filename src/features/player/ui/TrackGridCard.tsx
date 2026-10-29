import { cleanTrackTitle } from "@/shared/utils/trackTitle";
import { memo, useCallback, useRef, useState } from "react";
import { PlayFill, More2Fill, MusicLine, HeartFill, HeartLine } from "@mingcute/react";
import CoverImage from "@/features/covers/ui/CoverImage";
import DropdownMenu from "@/shared/ui/DropdownMenu";
import ExplicitBadge from "@/shared/ui/ExplicitBadge";
import { ArtistLink } from "@/features/artist";
import type { Track } from "@/shared/types";
import { useSongMenuItems } from "../hooks/useSongMenuItems";
import { useIsTrackLiked, useLikeTrack, useUnlikeTrack } from "@/features/library/hooks";
import { useTranslation } from "@/languages";

export interface TrackGridCardProps {
  track: Track;
  coverFallback?: string;
  isCurrent?: boolean;
  playlistId?: string;
  playlistTitle?: string;
  onPlay: () => void;
  showLikeButton?: boolean;
}

/** a track as a tile: cover, title, artist; same menu as the list rows */
function TrackGridCard({ track, coverFallback, isCurrent, playlistId, playlistTitle, onPlay, showLikeButton = false }: TrackGridCardProps) {
  const { t } = useTranslation();
  const coverUrl = track.coverUrl || coverFallback || "";
  const menuItems = useSongMenuItems({
    id: track.id,
    title: track.title,
    artists: track.artists,
    coverUrl,
    durationMs: track.durationMs,
    searchType: "track",
    playlistId,
    playlistItemId: track.playlistItemId,
    playlistTitle,
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const isLiked = useIsTrackLiked(track.id);
  const likeMutation = useLikeTrack();
  const unlikeMutation = useUnlikeTrack();
  const togglingLikeRef = useRef(false);

  const handleLikeToggle = useCallback(() => {
    if (togglingLikeRef.current) return;
    togglingLikeRef.current = true;
    const onSettled = () => {
      togglingLikeRef.current = false;
    };
    if (isLiked) {
      unlikeMutation.mutate(track.id, { onSettled });
    } else {
      likeMutation.mutate({ trackId: track.id, track }, { onSettled });
    }
  }, [isLiked, likeMutation, unlikeMutation, track]);

  const onContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setMenuPosition({ x: e.clientX, y: e.clientY });
    setMenuOpen(true);
  }, []);

  return (
    <div
      className={`group flex min-w-0 flex-col gap-[8px] cursor-pointer select-none ${track.onlyOnDevice ? "opacity-[0.42]" : ""}`}
      style={{ contentVisibility: "auto", containIntrinsicSize: "auto 220px", fontFamily: "var(--font-inter), sans-serif" }}
      onClick={onPlay}
      onContextMenu={onContextMenu}
    >
      <div className="relative aspect-square w-full overflow-hidden rounded-md bg-bg-panel">
        {coverUrl ? (
          <CoverImage
            src={coverUrl}
            alt={track.title}
            fill
            sizes="200px"
            className="object-cover transition-all duration-300 group-hover:brightness-[0.8]"
            draggable={false}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-text-tertiary">
            <MusicLine size={32} />
          </div>
        )}
        <span
          className={`absolute bottom-[8px] right-[8px] inline-flex h-[38px] w-[38px] items-center justify-center rounded-full bg-white text-black shadow-[0_6px_18px_rgba(0,0,0,0.35)] transition-all duration-200 ${
            isCurrent ? "opacity-100 translate-y-0" : "opacity-0 translate-y-[6px] group-hover:opacity-100 group-hover:translate-y-0"
          }`}
        >
          <PlayFill size={18} className="translate-x-[1px]" />
        </span>
        <button
          type="button"
          aria-label={t("common.more_options")}
          onClick={(e) => {
            e.stopPropagation();
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            setMenuPosition({ x: r.left, y: r.bottom });
            setMenuOpen(true);
          }}
          className="absolute top-[6px] right-[6px] inline-flex h-[28px] w-[28px] items-center justify-center rounded-full border-0 bg-black/45 text-white opacity-0 backdrop-blur-md transition-opacity group-hover:opacity-100 cursor-pointer"
        >
          <More2Fill size={16} />
        </button>
        {showLikeButton && (
          <button
            type="button"
            aria-label={isLiked ? t("common.unlike") : t("common.like")}
            aria-pressed={isLiked}
            onClick={(e) => {
              e.stopPropagation();
              handleLikeToggle();
            }}
            className={`absolute top-[6px] left-[6px] inline-flex h-[28px] w-[28px] items-center justify-center rounded-full border-0 bg-black/45 backdrop-blur-md transition-opacity group-hover:opacity-100 cursor-pointer ${
              isLiked ? "text-[#ff3b5c] opacity-100" : "text-white opacity-0"
            }`}
          >
            {isLiked ? <HeartFill size={16} /> : <HeartLine size={16} />}
          </button>
        )}
      </div>
      <div className="min-w-0">
        <p className={`m-0 truncate text-[14px] font-[500] ${isCurrent ? "text-accent-primary" : "text-text-primary"}`}>{cleanTrackTitle(track.title, track.artists)}</p>
        <p className="m-0 mt-[2px] flex min-w-0 items-center gap-[5px] text-[13px] text-text-tertiary" onClick={(e) => e.stopPropagation()}>
          {track.explicit && <ExplicitBadge size="md" className="shrink-0" />}
          <ArtistLink name={track.artists} artistId={track.artistId} artistList={track.artistList} className="text-text-tertiary" />
        </p>
      </div>
      {menuItems.length > 0 && (
        <DropdownMenu
          trigger={<span />}
          items={menuItems}
          open={menuOpen}
          onOpenChange={(open) => {
            setMenuOpen(open);
            if (!open) setMenuPosition(null);
          }}
          position={menuPosition}
        />
      )}
    </div>
  );
}

export default memo(TrackGridCard);
