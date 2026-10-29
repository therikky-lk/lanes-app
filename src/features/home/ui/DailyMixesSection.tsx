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

interface DailyMixCardProps {
  mix: DailyMix;
}

function DailyMixCard({ mix }: DailyMixCardProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isCardHovered, setIsCardHovered] = useState(false);
  const { t } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const trackDoubleClickBehavior = usePlayerStore(
    (state) => state.trackDoubleClickBehavior,
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const isPlayingMix = usePlayerStore(
    (s) => s.playbackContext === `playlist:${mix.id}` || (s.playbackContext === mix.title && mix.tracks.some((tr) => tr.id === s.currentTrack?.id)),
  );
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

  const subtitleText =
    (mix.clusterArtists && mix.clusterArtists.length > 0
      ? mix.clusterArtists.join(", ")
      : mix.description) || "";

  const mixLabel = t("home.mix_label") || "Mix";

  return (
    <div
      className="group flex-shrink-0 w-[min(220px,64vw)] cursor-pointer select-none"
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onMouseEnter={() => setIsCardHovered(true)}
      onMouseLeave={() => setIsCardHovered(false)}
    >
      <div
        className={`relative aspect-[1.08] w-full overflow-hidden rounded-[14px] bg-border-alpha-14 transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-[0_18px_40px_rgba(0,0,0,0.28)] ${
          isPlayingMix ? "ring-2 ring-accent-primary ring-offset-2 ring-offset-bg-primary" : ""
        }`}
      >
        <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-4 pt-3.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/80">
          <span>{mixLabel} {mix.mixIndex ?? ""}</span>
          <span className="rounded-full bg-black/20 px-2 py-1 text-[10px] tracking-[0.08em] text-white/65">{mix.trackCount} tracks</span>
        </div>
        {mix.mixIndex ? (
          <MixCover index={mix.mixIndex} covers={mix.mosaic ?? []} label={mixLabel} showBadge={false} />
        ) : mix.coverUrl && (
          <CoverImage
            src={mix.coverUrl}
            alt={mix.title}
            fill
            sizes="175px"
            className={`object-cover transition-all duration-300 group-hover:brightness-[1.15] ${
              imageLoaded ? "opacity-100" : "opacity-0"
            }`}
            onLoad={() => setImageLoaded(true)}
          />
        )}
        <div className={`absolute inset-0 z-20 flex items-center justify-center transition-opacity duration-200 ${isCardHovered ? "opacity-100" : "opacity-0"}`}>
          <button
            type="button"
            aria-label={`${t("artist.play")} ${mix.title}`}
            onClick={(e) => { e.stopPropagation(); handlePlay(); }}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-white/90 text-black shadow-[0_8px_24px_rgba(0,0,0,0.3)] backdrop-blur-sm transition-transform hover:scale-105 active:scale-95"
          >
            <PlayFill size={25} />
          </button>
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 p-4 pt-16 text-white">
          <div className="truncate text-[17px] font-bold leading-tight tracking-[-0.02em]" title={mix.title}>{mix.title}</div>
          <div className="mt-1 truncate text-[11px] text-white/65" title={subtitleText}>{subtitleText || mix.description}</div>
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

function DailyMixesSection({ mixes, headingMarginTop = "mt-[22px]" }: DailyMixesSectionProps) {
  const { t } = useTranslation();
  if (mixes.length === 0) return null;

  return (
    <div className="flex flex-col">
      <div className={`${headingMarginTop} px-8 flex items-center justify-between`}>
        <div className="flex items-center gap-2.5">
          <div className="flex items-center shrink-0">
            <SparklesFill className="w-5 h-5 text-amber-400" />
          </div>
          <h2
            className="text-text-primary text-[21px] font-semibold m-0 leading-tight tracking-tight"
            style={{ fontFamily: "var(--font-inter), sans-serif" }}
          >
            {t("home.dailyMixes") || "Daily Mixes"}
          </h2>
        </div>
      </div>

      {/* room above and below so the playing mix's ring isn't clipped by the scroller */}
      <ScrollableRow className="flex gap-[16px] pl-8 pr-8 mt-[7px] overflow-x-auto pt-[8px] pb-[12px]">
        {mixes.map((mix, index) => (
          <DailyMixCard key={`daily-mix-${mix.id}-${index}`} mix={mix} />
        ))}
      </ScrollableRow>
    </div>
  );
}

export default memo(DailyMixesSection);

