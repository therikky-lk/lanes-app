import TrackMenuHeader from "./TrackMenuHeader";
import { cleanTrackTitle } from "@/shared/utils/trackTitle";
import { memo, useEffect, useRef, useState } from "react";
import { HeartFill, HeartLine, More2Fill, RepeatFill } from "@mingcute/react";
import { LuCircleArrowDown } from "react-icons/lu";
import DropdownMenu from "@/shared/ui/DropdownMenu";
import type { DropdownMenuItem } from "@/shared/ui/DropdownMenu";
import { useTranslation } from "@/languages";
import { ArtistLink } from "@/features/artist";
import HighlightedText from "@/shared/ui/HighlightedText";
import ExplicitBadge from "@/shared/ui/ExplicitBadge";
import SourceBadge from "@/shared/ui/SourceBadge";
import CoverImage from "@/features/covers/ui/CoverImage";
import { isCoverReady } from "@/features/covers/lib/coverArt";
import type { TrackArtist } from "@/shared/types";

export interface SongCardProps {
  id?: string;
  title: string;
  artists?: string;
  artistId?: string;
  artistList?: TrackArtist[];
  artistsClickable?: boolean;
  coverUrl: string;
  className?: string;
  onPlay?: () => void;
  onDoubleClick?: () => void;
  duration?: string;
  releaseDate?: string;
  explicit?: boolean;
  imageShape?: "square" | "circle";
  trackNumber?: number;
  /** Spotify-style table row: running number before the cover */
  rowNumber?: number;
  /** Spotify-style table row: album column between title and duration */
  albumTitle?: string;
  /** Saved date column used by the liked tracks table. */
  addedDate?: string;
  /** Relative time shown when hovering the saved date. */
  addedDateTooltip?: string;
  /** highlight the row as the one playing now */
  isCurrent?: boolean;
  /** show that the audio is available in the local cache */
  isCached?: boolean;
  /** shows where the track streams from */
  trackId?: string;
  repostedBy?: string;
  menuItems?: DropdownMenuItem[];
  menuOpen?: boolean;
  onMenuOpenChange?: (open: boolean) => void;
  menuPosition?: { x: number; y: number } | null;
  onContextMenu?: (e: React.MouseEvent) => void;
  onNavigate?: () => void;
  onOpenArtist?: (artist: { id: string; name: string }) => void;
  compact?: boolean;
  icon?: React.ReactNode;
  showReorderHandle?: boolean;
  onGrabStart?: (e: React.PointerEvent<HTMLDivElement>) => void;
  /** search query whose matches get marked in the title */
  highlight?: string;
  /** greyed-out row that can't be played here, with the reason */
  unavailableNote?: string;
  /** shows a heart button in the row (your own files, liked on this device) */
  liked?: boolean;
  onToggleLike?: () => void;
}

function SongCard({
  title,
  artists,
  artistId,
  artistList,
  artistsClickable = true,
  coverUrl,
  className,
  onPlay,
  onDoubleClick,
  duration,
  releaseDate,
  explicit = false,
  imageShape = "square",
  trackNumber,
  rowNumber,
  albumTitle,
  addedDate,
  addedDateTooltip,
  isCurrent = false,
  isCached = false,
  trackId,
  repostedBy,
  menuItems,
  menuOpen,
  onMenuOpenChange,
  menuPosition,
  onContextMenu,
  onNavigate,
  onOpenArtist,
  compact = false,
  icon,
  showReorderHandle,
  onGrabStart,
  highlight,
  unavailableNote,
  liked,
  onToggleLike,
}: SongCardProps) {
  const shownTitle = cleanTrackTitle(title, artists);
  const { t } = useTranslation();
  const [imageLoaded, setImageLoaded] = useState(() => isCoverReady(coverUrl));
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // right click opens the same menu as the ⋯ button, also on rows whose
  // owner doesn't manage the menu itself (my files, the queue)
  const [ownMenuOpen, setOwnMenuOpen] = useState(false);
  const [ownMenuPosition, setOwnMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const hasMenu = Boolean(menuItems && menuItems.length > 0);
  const managesOwnMenu = hasMenu && !onContextMenu;
  const resolvedMenuOpen = managesOwnMenu ? ownMenuOpen : menuOpen;
  const resolvedMenuPosition = managesOwnMenu ? ownMenuPosition : menuPosition;
  const handleMenuOpenChange = (open: boolean) => {
    if (managesOwnMenu) {
      setOwnMenuOpen(open);
      if (!open) setOwnMenuPosition(null);
    }
    onMenuOpenChange?.(open);
  };
  const handleContextMenu = (e: React.MouseEvent) => {
    if (onContextMenu) {
      onContextMenu(e);
      return;
    }
    if (!hasMenu) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    setOwnMenuPosition({ x: e.clientX, y: e.clientY });
    setOwnMenuOpen(true);
  };

  useEffect(() => {
    setImageLoaded(isCoverReady(coverUrl));
  }, [coverUrl]);

  const imageSizeClass = compact ? "h-[40px] w-[40px]" : "h-[48px] w-[48px]";
  const titleSizeClass = compact ? "text-[14px]" : "text-[16px]";
  const artistSizeClass = compact ? "text-[12px]" : "text-[15px]";
  const gapClass = compact ? "gap-[12px]" : "gap-[16px]";
  const paddingClass = compact ? "p-[6px]" : "p-[8px]";

  const handleClick = (e: React.MouseEvent) => {
    if (typeof window !== "undefined" && window.__linerWasDragging) {
      e.stopPropagation();
      e.preventDefault();
      return;
    }
    if (!onPlay) return;
    if (!onDoubleClick) {
      onPlay();
      return;
    }

    const detail = (e as React.MouseEvent<HTMLDivElement>).detail;
    if (detail >= 2) {
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
        clickTimerRef.current = null;
      }
      onDoubleClick();
      return;
    }

    clickTimerRef.current = setTimeout(() => {
      clickTimerRef.current = null;
      if (typeof window !== "undefined" && window.__linerWasDragging) return;
      onPlay();
    }, 200);
  };

  return (
    <div
      data-reorder-item
      className={`group w-full ${addedDate !== undefined ? "flex items-center justify-between md:grid md:items-center md:justify-normal" : "flex items-center justify-between"} rounded-[10px] ${paddingClass} outline-none transition-colors duration-150 ease-out ${
        className ?? ""
      } ${unavailableNote ? "opacity-[0.42]" : ""} ${onPlay ? "cursor-pointer" : ""} ${onPlay && !className?.includes("hover:bg-") ? "hover:bg-border-alpha-14" : ""}`}
      style={addedDate !== undefined ? { gridTemplateColumns: "minmax(0, 1fr) minmax(120px, 30%) 140px 76px" } : undefined}
      onClick={handleClick}
      onPointerDown={(e) => {
        if (clickTimerRef.current) {
          clearTimeout(clickTimerRef.current);
          clickTimerRef.current = null;
        }
        if (e.clientY <= 32) return;
        if (!onGrabStart) return;
        const target = e.target as HTMLElement;
        if (target.closest("[data-reorder-handle]")) return;
        if (
          target.closest("button") ||
          target.closest("a") ||
          target.closest("[role='menuitem']") ||
          target.closest("[data-prevent-drag]")
        ) {
          return;
        }
        onGrabStart(e);
      }}
      onContextMenu={handleContextMenu}
      onKeyDown={(event) => {
        if (!onPlay) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onPlay();
        }
      }}
      role={onPlay ? "button" : undefined}
      tabIndex={onPlay ? 0 : undefined}
    >
      <div className={`flex flex-1 items-center ${gapClass} min-w-0`}>
        {rowNumber !== undefined && (
          <div
            className={`w-[26px] shrink-0 text-right tabular-nums text-[14px] ${isCurrent ? "text-accent-primary" : "text-text-tertiary"}`}
            style={{ fontFamily: "var(--font-inter), sans-serif", fontWeight: 400 }}
          >
            {rowNumber}
          </div>
        )}
        {trackNumber !== undefined ? (
          <div
            className={`flex ${imageSizeClass} shrink-0 items-center justify-center ${titleSizeClass} text-text-tertiary`}
            style={{
              fontFamily: "var(--font-inter), sans-serif",
              fontWeight: 400,
            }}
          >
            {trackNumber}
          </div>
        ) : (
          <div
            className={`relative ${imageSizeClass} shrink-0 overflow-hidden bg-[#161616] flex items-center justify-center ${
              imageShape === "circle" ? "rounded-full" : "rounded-[12px]"
            }`}
          >
            {icon ? (
              icon
            ) : (
              <CoverImage
                key={coverUrl}
                src={coverUrl}
                alt={title}
                fill
                sizes={compact ? "40px" : "48px"}
                placeholder="empty"
                onLoadStart={() => setImageLoaded(isCoverReady(coverUrl))}
                onLoad={() => setImageLoaded(true)}
                className={`object-cover pointer-events-none transition-opacity duration-300 ${
                  imageLoaded ? "opacity-100" : "opacity-0"
                }`}
                draggable={false}
              />
            )}
          </div>
        )}

        {isCached && (
          <span
            className="-ml-[8px] -mr-[8px] inline-flex h-[17px] w-[17px] shrink-0 items-center justify-center text-emerald-400"
            title={t("common.cache_saved")}
            aria-label={t("common.cache_saved")}
          >
            <LuCircleArrowDown size={16} aria-hidden="true" />
          </span>
        )}

        <div className="min-w-0 flex flex-col gap-[2px]">
          <div className="flex items-center gap-[8px]">
            <h3
              className={`m-0 max-w-[min(52vw,560px)] overflow-hidden text-ellipsis whitespace-nowrap ${titleSizeClass} leading-[1.2] ${isCurrent ? "text-accent-primary" : "text-text-primary"}`}
              style={{
                fontFamily: "var(--font-inter), sans-serif",
                fontWeight: 400,
              }}
            >
              {highlight ? <HighlightedText text={shownTitle} query={highlight} /> : shownTitle}
            </h3>
            {repostedBy && (
              <div
                className="flex items-center gap-[4px] text-text-tertiary text-[13px]"
                title={t("common.reposted_by", { name: repostedBy })}
              >
                <RepeatFill size={14} />
                <span>{repostedBy}</span>
              </div>
            )}
          </div>
          <p
            className={`m-0 flex min-w-0 items-center ${artistSizeClass} leading-[1.2] text-text-secondary overflow-hidden`}
            style={{
              fontFamily: "var(--font-inter), sans-serif",
              fontWeight: 350,
            }}
          >
            {trackId && <SourceBadge trackId={trackId} className="mr-[5px]" />}
            {explicit && <ExplicitBadge size="md" className="mr-[6px] shrink-0" />}
            {artistsClickable ? (
              <ArtistLink
                name={artists}
                artistId={artistId}
                artistList={artistList}
                onNavigate={onOpenArtist ? undefined : onNavigate}
                onOpenArtist={onOpenArtist}
                className="text-text-secondary"
              />
            ) : (
              <span className="truncate select-none">{artists}</span>
            )}
            {unavailableNote && (
              <span className="ml-[6px] shrink-0 truncate select-none text-text-tertiary">· {unavailableNote}</span>
            )}
          </p>
        </div>
      </div>

      {albumTitle !== undefined && (
        <div
          className={`hidden md:block shrink-0 min-w-0 pl-[16px] truncate text-[14px] text-text-secondary ${addedDate !== undefined ? "" : "w-[30%] max-w-[360px]"}`}
          style={{ fontFamily: "var(--font-inter), sans-serif", fontWeight: 350 }}
          title={albumTitle}
        >
          {albumTitle}
        </div>
      )}

      {addedDate !== undefined && (
        <div
          className="hidden md:block w-[140px] shrink-0 pl-[16px] truncate text-[14px] text-text-secondary"
          style={{ fontFamily: "var(--font-inter), sans-serif", fontWeight: 350 }}
          title={addedDateTooltip ?? addedDate}
        >
          {addedDate}
        </div>
      )}

      <div className={`flex items-center shrink-0 ml-auto gap-[16px] justify-end ${addedDate !== undefined ? "md:ml-0 md:w-[76px] md:gap-[8px]" : ""} ${onToggleLike ? "w-[144px] gap-[8px] md:w-[180px] md:gap-[12px]" : ""}`}>
        {releaseDate && (
          <span
            className="text-[14px] text-text-tertiary"
            style={{
              fontFamily: "var(--font-inter), sans-serif",
              fontWeight: 400,
            }}
          >
            {releaseDate}
          </span>
        )}
        {onToggleLike && (
          <button
            type="button"
            aria-label={liked ? t("common.unlike") : t("common.like")}
            aria-pressed={Boolean(liked)}
            data-prevent-drag
            onClick={(e) => {
              e.stopPropagation();
              onToggleLike();
            }}
            className={`flex h-[24px] w-[24px] shrink-0 items-center justify-center border-0 bg-transparent p-0 cursor-pointer transition-colors ${
              liked ? "text-[#ff3b5c]" : "text-text-tertiary hover:text-text-primary"
            }`}
          >
            {liked ? <HeartFill size={18} /> : <HeartLine size={18} />}
          </button>
        )}
        {duration && (
          <span
            className="text-[14px] text-text-tertiary"
            style={{
              fontFamily: "var(--font-inter), sans-serif",
              fontWeight: 400,
            }}
          >
            {duration}
          </span>
        )}
        {showReorderHandle && onGrabStart && (
          <button
            type="button"
            aria-label={t("player.reorder_track") || "Reorder track"}
            data-reorder-handle
            data-prevent-drag
            onPointerDown={event => {
              if (event.button !== 0) return;
              event.preventDefault();
              event.stopPropagation();
              onGrabStart(event as unknown as React.PointerEvent<HTMLDivElement>);
            }}
            className="ml-[4px] flex h-[36px] w-[28px] shrink-0 touch-none items-center justify-center rounded-md border-0 bg-transparent text-text-tertiary transition-colors hover:bg-white/[0.06] hover:text-text-primary active:cursor-grabbing"
          >
            <svg aria-hidden="true" width="16" height="20" viewBox="0 0 16 20" fill="currentColor">
              <circle cx="5" cy="4" r="1.25" /><circle cx="11" cy="4" r="1.25" />
              <circle cx="5" cy="10" r="1.25" /><circle cx="11" cy="10" r="1.25" />
              <circle cx="5" cy="16" r="1.25" /><circle cx="11" cy="16" r="1.25" />
            </svg>
          </button>
        )}
        {menuItems && menuItems.length > 0 && (
          <DropdownMenu
            trigger={
              <button
                type="button"
                aria-label={t("common.more_options")}
                className="rounded-md bg-transparent border-0 p-0 text-text-primary transition-all duration-200 active:scale-[0.96] flex items-center justify-center cursor-pointer"
              >
                <More2Fill size={22} />
              </button>
            }
            items={menuItems}
            open={resolvedMenuOpen}
            onOpenChange={handleMenuOpenChange}
            position={resolvedMenuPosition}
            closeLabel={t("common.close")}
            mobileSheetHeader={<TrackMenuHeader coverUrl={coverUrl} title={shownTitle} artists={artists} />}
          />
        )}
      </div>
    </div>
  );
}

export default memo(SongCard);
