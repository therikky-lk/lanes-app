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
import { useIsMobile } from "@/shared/hooks/useIsMobile";

interface DailyMixCardProps {
  mix: DailyMix;
}

const MIX_COLORS: Array<[string, string]> = [
  ["#7c3aed", "#ec4899"],
  ["#0891b2", "#2563eb"],
  ["#dc2626", "#f97316"],
  ["#475569", "#14b8a6"],
  ["#db2777", "#f59e0b"],
  ["#334155", "#a855f7"],
  ["#059669", "#eab308"],
  ["#2563eb", "#06b6d4"],
  ["#c026d3", "#fb7185"],
  ["#ea580c", "#facc15"],
];

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
  const [gradientFrom, gradientTo] = MIX_COLORS[((mix.mixIndex ?? 1) - 1) % MIX_COLORS.length];

  return (
    <div
      className="group flex-shrink-0 w-[165px] cursor-pointer select-none"
      onClick={handleClick}
      onContextMenu={handleContextMenu}
    >
      <div
        className="relative aspect-square w-full overflow-hidden rounded-[12px] border border-white/10 bg-border-alpha-14"
        style={{
          boxShadow: "0 6px 16px rgba(0,0,0,0.16)",
        }}
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
        <div
          className="pointer-events-none absolute inset-0 z-[5]"
          style={{
            background: `linear-gradient(180deg, rgba(0,0,0,0.04) 20%, transparent 43%, rgba(0,0,0,0.18) 62%, ${gradientFrom}c7 100%)`,
          }}
        />
        <div className="pointer-events-none absolute inset-x-[10px] bottom-[9px] z-10 flex items-end justify-between gap-2">
          <div className="min-w-0 truncate text-[13px] font-semibold leading-tight text-white [text-shadow:0_1px_5px_rgba(0,0,0,0.65)]">
            {mix.title}
          </div>
          <div className="flex h-[25px] w-[25px] shrink-0 items-center justify-center rounded-full bg-white/90 text-black shadow-[0_2px_8px_rgba(0,0,0,0.25)]">
            <PlayFill size={13} />
          </div>
        </div>
      </div>

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
  if (mixes.length === 0) return null;

  return (
    <div className="flex flex-col">
      <div className={`${headingMarginTop} px-[16px] flex items-center justify-between`}>
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
      </div>

      <div className="relative">
        <ScrollableRow
          controller={scroll}
          showScrollMask={false}
          className="flex gap-[14px] pl-[16px] pr-[16px] mt-[3px] overflow-x-auto pt-0 pb-[12px]"
        >
        {mixes.map((mix, index) => (
          <DailyMixCard key={`daily-mix-${mix.id}-${index}`} mix={mix} />
        ))}
        </ScrollableRow>
        {!isMobile && (
          <div className="absolute right-[16px] top-[-38px] flex items-center gap-[4px]">
            <button
              type="button"
              aria-label="Previous mixes"
              onClick={scroll.scrollPrev}
              disabled={!scroll.canScrollLeft}
              className={`inline-flex h-[24px] w-[24px] items-center justify-center border-0 bg-transparent text-white/80 cursor-pointer disabled:cursor-default ${scroll.canScrollLeft ? "opacity-100" : "invisible"}`}
            >
              <ArrowLeftLine size={16} />
            </button>
            <button
              type="button"
              aria-label="Next mixes"
              onClick={scroll.scrollNext}
              disabled={!scroll.canScrollRight}
              className={`inline-flex h-[24px] w-[24px] items-center justify-center border-0 bg-transparent text-white/80 cursor-pointer disabled:cursor-default ${scroll.canScrollRight ? "opacity-100" : "invisible"}`}
            >
              <ArrowRightLine size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(DailyMixesSection);

