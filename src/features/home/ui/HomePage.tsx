import { useMemo, useState, useEffect } from "react";
import { warmTrackTags } from "@/features/library/services/trackTags";
import LikedCover from "@/features/library/ui/LikedCover";
import ScrollBlurEdge from "@/shared/ui/ScrollBlurEdge";
import { useNavigate } from "react-router-dom";
import PopularTracksSection from "./PopularTracksSection";
import DailyMixesSection from "./DailyMixesSection";
import TrendsSection from "./TrendsSection";
import HomePageSkeleton from "./HomePageSkeleton";
import MyVibeHero from "./MyVibeHero";
import type { Track } from "@/shared/types/track";
import {
  usePopular,
  usePopularTracksOnly,
  usePopularTracksAllTime,
} from "../hooks/usePopularTracks";
import { useRecentlyPlayed } from "../hooks/useRecentlyPlayed";
import { useDailyMixes } from "../hooks/useDailyMixes";
import { useLikedTracks } from "@/features/library/hooks/useLikedTracks";
import { playerEngine } from "@/features/player";
import SongCard from "@/features/player/ui/SongCard";
import SongCardWithMenu from "@/features/player/ui/SongCardWithMenu";
import { useTranslation } from "@/languages";
import { useIsContentTransparent } from "@/features/settings/store/customizationStore";
import {
  FireFill,
  TrophyFill,
  TimeFill,
  AlbumFill,
  PlaylistFill,
  HeartFill,
  FlashCircleFill,
  HistoryLine,
  RightLine,
} from "@mingcute/react";
import CoverImage from "@/features/covers/ui/CoverImage";

export default function HomePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const hasCustomBg = useIsContentTransparent();
  const { data: likedData, isLoading: likedLoading } = useLikedTracks();

  const { data: popularItems, isLoading: popularLoading } = usePopular(100);
  const { data: popularTracksOnly, isLoading: tracksLoading } =
    usePopularTracksOnly(20);
  const { data: popularTracksAllTime, isLoading: allTimeLoading } =
    usePopularTracksAllTime(20);
  const { data: recentlyPlayed, isLoading: recentLoading } =
    useRecentlyPlayed(20);
  const { data: dailyMixes } = useDailyMixes();

  const isDataLoading =
    tracksLoading ||
    allTimeLoading ||
    popularLoading ||
    recentLoading ||
    likedLoading;

  const popularAlbums =
    popularItems?.filter((it) => it.type === "album") ?? [];
  const popularPlaylists =
    popularItems?.filter((it) => it.type === "playlist") ?? [];

  // Ambient time-of-day colored glow
  const glowClass = useMemo(() => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) {
      return "from-amber-500/20 via-orange-500/10 to-transparent";
    } else if (hour >= 12 && hour < 17) {
      return "from-amber-400/20 via-sky-500/10 to-transparent";
    } else if (hour >= 17 && hour < 22) {
      return "from-rose-500/20 via-purple-500/10 to-transparent";
    }
    return "from-indigo-600/25 via-violet-600/15 to-transparent";
  }, []);

  // Quick mix items: up to 5 recently played items (tracks or albums)
  const quickRecentItems = useMemo(() => {
    return (recentlyPlayed || []).slice(0, 5);
  }, [recentlyPlayed]);

  const hasEnoughQuickData = quickRecentItems.length >= 5;

  // seeds for "My Vibe"
  const vibeRecent = useMemo(
    () => (recentlyPlayed || []).flatMap((e) => (e.type === "track" ? [e.item] : [])),
    [recentlyPlayed],
  );
  const vibeTrending = useMemo(
    () =>
      [...(popularTracksOnly || []), ...(popularTracksAllTime || [])].flatMap((e) =>
        e.type === "track" ? [e.item] : [],
      ),
    [popularTracksOnly, popularTracksAllTime],
  );

  const isReady = !isDataLoading;
  const [skeletonExited, setSkeletonExited] = useState(() => !isDataLoading);

  useEffect(() => {
    if (isReady && !skeletonExited) {
      const timer = setTimeout(() => {
        setSkeletonExited(true);
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [isReady, skeletonExited]);

  const quickCardClass = hasCustomBg
    ? "apple-glass-action"
    : "bg-bg-elevated hover:bg-[#dedee3] dark:hover:bg-border-alpha-14 transition-colors duration-150 ease-out";

  // liked songs get their tags (genre, pace) in the background from the start
  useEffect(() => {
    if (likedData?.tracks?.length) warmTrackTags(likedData.tracks);
  }, [likedData?.tracks]);

  // desktop: "My Vibe" can fill the whole page (arrow next to its settings)
  const [vibeExpanded, setVibeExpanded] = useState(false);

  return (
    <div data-page-scroller className={`relative h-full min-w-0 w-full overflow-x-hidden bg-transparent ${vibeExpanded ? "overflow-y-hidden" : "overflow-y-auto"}`}>
      <ScrollBlurEdge height={72} />

      <div
        data-window-drag
        className="sticky top-0 z-20 h-[32px] w-full shrink-0 select-none pointer-events-auto"
        style={{ marginBottom: "-32px" }}
        aria-hidden="true"
      />
      <div className={vibeExpanded ? "relative z-1 h-full min-w-0" : "relative z-1 min-w-0"}>
        <MyVibeHero
          liked={likedData?.tracks}
          recent={vibeRecent}
          trending={vibeTrending}
          expanded={vibeExpanded}
          onToggleExpanded={() => setVibeExpanded((v) => !v)}
        />
      </div>

      {/* expanded: only the vibe is on screen */}
      {!vibeExpanded && (

      <div className="relative z-1 grid min-w-0 grid-cols-1 items-start w-full">
        {/* Real Content Layer */}
        {isReady && (
          <div className="col-start-1 row-start-1 w-full pb-[16px]">
            {/* two shortcuts: liked songs and history. A tile, the name with a
                chevron, one line under it, and the latest track's cover */}
            <div className="mt-[18px] mb-[12px] grid grid-cols-1 gap-x-[10px] gap-y-[8px] px-8 min-[460px]:grid-cols-2 md:gap-x-[8px] md:gap-y-[2px]">
              {(
                [
                  {
                    key: "liked",
                    onClick: () => navigate("/library/playlist?id=likes"),
                    tile: (
                      <span className="relative inline-flex h-[44px] w-[44px] shrink-0 overflow-hidden rounded-[10px] md:h-[52px] md:w-[52px]">
                        <LikedCover heartRatio={0.5} />
                      </span>
                    ),
                    title: t("library.liked_songs"),
                    sub: `${likedData.total} ${likedData.total === 1 ? t("library.song") : t("library.songs")}`,
                    thumbs: likedData.tracks
                      .filter((tr) => Boolean(tr.coverUrl))
                      .slice(0, 3)
                      .map((tr) => tr.coverUrl!),
                  },
                  {
                    key: "history",
                    onClick: () => navigate("/recent"),
                    tile: (
                      <span className="inline-flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-[10px] bg-white/[0.08] text-text-primary md:h-[52px] md:w-[52px]">
                        <HistoryLine size={22} />
                      </span>
                    ),
                    title: t("home.history"),
                    sub:
                      [...new Set(vibeRecent.map((tr) => tr.artists.split(",")[0]?.trim()).filter(Boolean))].slice(0, 3).join(", ") ||
                      t("home.jumpBackIn"),
                    thumbs: vibeRecent
                      .filter((tr) => Boolean(tr.coverUrl))
                      .slice(0, 3)
                      .map((tr) => tr.coverUrl!),
                  },
                ] as const
              ).map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={item.onClick}
                  className="group flex h-[64px] min-w-0 items-center gap-[12px] rounded-xl border-0 bg-white/[0.05] px-[8px] text-left cursor-pointer transition-colors hover:bg-white/[0.05] active:bg-white/[0.08] md:h-[72px] md:gap-[14px] md:px-[10px]"
                >
                  {item.tile}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-[2px] text-[15px] font-[650] text-text-primary">
                      <span className="truncate">{item.title}</span>
                      <RightLine size={16} className="shrink-0 text-text-tertiary" />
                    </span>
                    <span className="block truncate text-[12.5px] text-text-tertiary">{item.sub}</span>
                  </span>
                  {item.thumbs.length > 0 && (
                    <span className="flex h-[48px] shrink-0 items-center justify-end md:h-[52px]">
                      {item.thumbs.map((thumb, index) => {
                        const size = 44;
                        return (
                          <span
                            key={`${item.key}-thumb-${index}`}
                            className="relative shrink-0 overflow-hidden rounded-md border-2 border-[#1a1a1a] shadow-[0_2px_8px_rgba(0,0,0,0.2)] md:border-2"
                            style={{
                              width: `${size}px`,
                              height: `${size}px`,
                              marginLeft: index === 0 ? 0 : -30,
                              zIndex: item.thumbs.length - index,
                              opacity: Math.max(0.52, 1 - index * 0.2),
                            }}
                          >
                            <CoverImage src={thumb} alt="" fill sizes="44px" className="object-cover" />
                          </span>
                        );
                      })}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Daily Mixes (Made For You) */}
            {dailyMixes && dailyMixes.length > 0 && (
              <DailyMixesSection
                mixes={dailyMixes}
                headingMarginTop="mt-[8px]"
              />
            )}

          {/* Trending: top 50 for Russia / worldwide */}
          <TrendsSection />

          {/* Listening Right Now (Trending Chart) */}
          {popularTracksOnly && popularTracksOnly.length > 0 && (
            <PopularTracksSection
              title={t("home.whatEveryonesOn")}
              icon={<FireFill className="w-5 h-5 text-amber-500" />}
              items={popularTracksOnly}
              headingMarginTop="mt-[22px]"
            />
          )}

          {/* Jump Back In (History) */}
          {recentlyPlayed && recentlyPlayed.length > 0 && (
            <PopularTracksSection
              title={t("home.jumpBackIn")}
              icon={<TimeFill className="w-5 h-5 text-sky-400" />}
              items={recentlyPlayed}
              headingMarginTop="mt-[22px]"
            />
          )}

          {/* Most Listened of All Time */}
          {popularTracksAllTime && popularTracksAllTime.length > 0 && (
            <PopularTracksSection
              title={t("home.mostListened")}
              icon={<TrophyFill className="w-5 h-5 text-yellow-500" />}
              items={popularTracksAllTime}
              headingMarginTop="mt-[22px]"
            />
          )}

          {/* Top Albums */}
          {popularAlbums && popularAlbums.length > 0 && (
            <PopularTracksSection
              title={t("home.popularAlbums")}
              icon={<AlbumFill className="w-5 h-5 text-emerald-400" />}
              items={popularAlbums}
              headingMarginTop="mt-[22px]"
            />
          )}

          {/* Popular Playlists */}
          {popularPlaylists && popularPlaylists.length > 0 && (
            <PopularTracksSection
              title={t("home.popularPlaylists")}
              icon={<PlaylistFill className="w-5 h-5 text-rose-400" />}
              items={popularPlaylists}
              headingMarginTop="mt-[22px]"
            />
          )}
        </div>
      )}

      {/* Direct Crossfade Skeleton Layer */}
      {!vibeExpanded && !skeletonExited && (
        <div
          className={`col-start-1 row-start-1 w-full z-10 transition-opacity duration-300 ease-out ${
            isReady ? "opacity-0 pointer-events-none" : "opacity-100 pointer-events-auto"
          }`}
          onTransitionEnd={() => setSkeletonExited(true)}
        >
          <HomePageSkeleton glowClass={glowClass} showQuickGrid={hasEnoughQuickData} />
        </div>
      )}
      </div>
      )}
    </div>
  );
}
