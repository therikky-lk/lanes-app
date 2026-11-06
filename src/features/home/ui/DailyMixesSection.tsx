import { memo, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import ScrollableRow from "@/shared/ui/ScrollableRow";
import CoverImage from "@/features/covers/ui/CoverImage";
import MixCover from "./MixCover";
import { playerEngine } from "@/features/player";
import { usePlayerStore } from "@/features/player/store/playerStore";
import { useToast } from "@/shared/ui";
import { useTranslation } from "@/languages";
import DropdownMenu, { type DropdownMenuItem } from "@/shared/ui/DropdownMenu";
import type { DailyMix } from "../hooks/useDailyMixes";
import { SparklesFill, PlayFill, AddFill } from "@mingcute/react";
import { ArrowLeftLine, ArrowRightLine } from "@mingcute/react";
import useHorizontalScroll from "@/shared/hooks/useHorizontalScroll";
import { isMobileLayout, useIsMobile } from "@/shared/hooks/useIsMobile";

interface DailyMixCardProps {
  mix: DailyMix;
}

function DailyMixCard({ mix }: DailyMixCardProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const { t } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const trackDoubleClickBehavior = usePlayerStore(
    (state) => state.trackDoubleClickBehavior,
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handlePlay = useCallback(() => {
    if (mix.tracks.length === 0) return;
    const firstTrack = mix.tracks[0];
    if (!firstTrack) return;
    // same context as the mix page, so both show it as playing
    void playerEngine.playTrack(
      firstTrack,
      mix.tracks,
      `playlist:${mix.id}`,
      mix.coverUrl || firstTrack.coverUrl,
    );
  }, [mix]);

  const handleAddQueue = useCallback(() => {
    if (mix.tracks.length === 0) return;
    for (const track of mix.tracks) {
      playerEngine.addToQueue({
        id: track.id,
        title: track.title,
        artists: track.artists,
        coverUrl: track.coverUrl,
        durationMs: track.durationMs,
        playCount: track.playCount ?? 0,
      });
    }
    toast(t("common.added_to_queue"), "checkmark", {
      description: `${mix.title} (${mix.trackCount} ${t("library.tracks")})`,
    });
  }, [mix, toast, t]);

  const menuItems: DropdownMenuItem[] = [
    {
      id: "play",
      label: t("artist.play"),
      icon: <PlayFill size={16} />,
      onClick: handlePlay,
    },
    {
      id: "add_to_queue",
      label: t("artist.add_to_queue"),
      icon: <AddFill size={16} />,
      onClick: handleAddQueue,
    },
  ];

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuPosition({ x: e.clientX, y: e.clientY });
    setMenuOpen(true);
  }, []);

  const handleDoubleClick = useCallback(() => {
    if (trackDoubleClickBehavior === "queue") {
      handleAddQueue();
    } else {
      handlePlay();
    }
  }, [trackDoubleClickBehavior, handleAddQueue, handlePlay]);

  const handleClick = (e: React.MouseEvent) => {
    if (isMobileLayout()) { navigate(`/collection?type=playlist&id=${encodeURIComponent(mix.id)}`); return; }
    const detail = (e as React.MouseEvent<HTMLDivElement>).detail;
    if (detail >= 2) {
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
        clickTimerRef.current = null;
      }
      handleDoubleClick();
      return;
    }
    clickTimerRef.current = setTimeout(() => {
      clickTimerRef.current = null;
      navigate(`/collection?type=playlist&id=${encodeURIComponent(mix.id)}`);
    }, 200);
  };

  const mixLabel = t("home.mix_label") || "Mix";

  return (
    <div
      className="group flex-shrink-0 w-full min-w-0 md:w-[175px] cursor-pointer select-none"
      onClick={handleClick}
      onContextMenu={handleContextMenu}
    >
      <div
        className="relative aspect-square w-full overflow-hidden rounded-[12px] bg-border-alpha-14"

      >
        {mix.mixIndex ? (
          <MixCover index={mix.mixIndex} covers={mix.mosaic ?? []} label={mixLabel} showBadge={false} />
        ) : mix.coverUrl && (
          <CoverImage
            src={mix.coverUrl}
            alt={mix.title}
            fill
            sizes="180px"
            className={`object-cover ${
              imageLoaded ? "opacity-100" : "opacity-0"
            }`}
            onLoad={() => setImageLoaded(true)}
          />
        )}

      </div>

      <p className="m-0 mt-[8px] truncate text-[14px] text-text-primary">{mix.title}</p>
      <p className="m-0 truncate text-[12px] text-text-tertiary">{mix.clusterArtists.join(", ")}</p>

      {menuItems.length > 0 && (
        <DropdownMenu
          trigger={<span />}
          items={menuItems}
          open={menuOpen}
          onOpenChange={(isOpen) => {
            setMenuOpen(isOpen);
            if (!isOpen) setMenuPosition(null);
          }}
          position={menuPosition}
        />
      )}
    </div>
  );
}

export interface DailyMixesSectionProps {
  mixes: DailyMix[];
  headingMarginTop?: string;
}

function DailyMixesSection({ mixes, headingMarginTop = "mt-[8px]" }: DailyMixesSectionProps) {
  const { t } = useTranslation();
  const scroll = useHorizontalScroll();
  const isMobile = useIsMobile();
  const [showAll, setShowAll] = useState(false);
  if (mixes.length === 0) return null;

  return (
    <div className="home-scroll-section flex min-w-0 flex-col overflow-hidden">
      <div className={`${headingMarginTop} flex min-w-0 items-center justify-between gap-[12px] px-[16px] md:px-[32px]`}>
        <div className="flex items-center gap-2.5">
          <div className="flex items-center shrink-0">
            <SparklesFill className="w-5 h-5 text-text-primary" />
          </div>
          <h2
            className="text-text-primary text-[20px] font-semibold m-0 leading-tight tracking-tight"
            style={{ fontFamily: "var(--font-inter), sans-serif" }}
          >
            {t("home.dailyMixes") || "Daily Mixes"}
          </h2>
        </div>
        {isMobile && mixes.length > 2 && (
          <button
            type="button"
            aria-expanded={showAll}
            onClick={() => setShowAll(value => !value)}
            className="min-h-[44px] shrink-0 cursor-pointer whitespace-nowrap border-0 bg-transparent p-0 text-[13px] font-medium text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary/40"
          >
            {t(showAll ? "artist.show_less" : "common.show_more")}
          </button>
        )}
        {!isMobile && (
          <div className="hidden shrink-0 items-center gap-[4px] md:flex">
            <button
              type="button"
              aria-label={t("home.previous_mixes")}
              onClick={scroll.scrollPrev}
              disabled={!scroll.canScrollLeft}
              className={`inline-flex h-[24px] w-[24px] items-center justify-center border-0 bg-transparent text-white/80 cursor-pointer disabled:cursor-default ${scroll.canScrollLeft ? "opacity-100" : "invisible"}`}
            >
              <ArrowLeftLine size={16} />
            </button>
            <button
              type="button"
              aria-label={t("home.next_mixes")}
              onClick={scroll.scrollNext}
              disabled={!scroll.canScrollRight}
              className={`inline-flex h-[24px] w-[24px] items-center justify-center border-0 bg-transparent text-white/80 cursor-pointer disabled:cursor-default ${scroll.canScrollRight ? "opacity-100" : "invisible"}`}
            >
              <ArrowRightLine size={16} />
            </button>
          </div>
        )}
      </div>

      {isMobile ? <div className="mt-[12px] grid grid-cols-2 gap-x-[12px] gap-y-[20px] px-[16px]">
        {(showAll ? mixes : mixes.slice(0, 2)).map(mix => <DailyMixCard key={mix.id} mix={mix} />)}
      </div> : (      <ScrollableRow
        controller={scroll}
        className="min-w-0 flex flex-nowrap gap-[28px] overflow-x-auto pl-8 pr-8 pb-[2px] pt-0 mt-[3px]"
      >
        {mixes.map((mix, index) => (
          <DailyMixCard key={`daily-mix-${mix.id}-${index}`} mix={mix} />
        ))}
      </ScrollableRow>)}

    </div>
  );
}

export default memo(DailyMixesSection);

