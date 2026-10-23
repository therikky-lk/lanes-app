import { useMemo, useState, useEffect } from "react";
import ScrollBlurEdge from "@/shared/ui/ScrollBlurEdge";
import { useNavigate } from "react-router-dom";
import PopularTracksSection from "./PopularTracksSection";
import DailyMixesSection from "./DailyMixesSection";
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
} from "@mingcute/react";

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

  return (
    <div data-page-scroller className="relative h-full w-full overflow-y-auto overflow-x-hidden bg-transparent">
      <ScrollBlurEdge height={72} />

      <div
        data-window-drag
        className="sticky top-0 z-20 h-[32px] w-full shrink-0 select-none pointer-events-auto"
        style={{ marginBottom: "-32px" }}
        aria-hidden="true"
      />
      {!hasCustomBg && (
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute -top-8 -left-8 w-[380px] h-[200px] bg-gradient-to-br ${glowClass} blur-3xl opacity-60`}
        />
      )}

      <div className="relative z-1">
        <MyVibeHero liked={likedData?.tracks} recent={vibeRecent} trending={vibeTrending} />
      </div>

      <div className="relative z-1 grid grid-cols-1 items-start w-full">
        {/* Real Content Layer */}
        {isReady && (
          <div className="col-start-1 row-start-1 w-full pb-[16px]">
            {/* two big shortcuts: liked songs and recently played */}
            <div className="mt-[20px] px-8 grid grid-cols-2 gap-[10px]">
              <button
                type="button"
                onClick={() => navigate("/library/playlist?id=likes")}
                className="group relative flex h-[84px] items-center gap-[12px] overflow-hidden rounded-2xl border-0 px-[16px] text-left cursor-pointer transition-transform active:scale-[0.98]"
                style={{ background: "linear-gradient(135deg, rgba(255,59,92,0.30), rgba(255,59,92,0.08))" }}
              >
                <span className="inline-flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-xl bg-[#ff3b5c] text-white shadow-[0_6px_18px_rgba(255,59,92,0.35)]">
                  <HeartFill size={22} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-[600] text-text-primary">{t("library.liked_songs")}</span>
                  <span className="block truncate text-[12.5px] text-text-tertiary">
                    {likedData.total} {likedData.total === 1 ? t("library.song") : t("library.songs")}
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => navigate("/recent")}
                className="group relative flex h-[84px] items-center gap-[12px] overflow-hidden rounded-2xl border-0 px-[16px] text-left cursor-pointer transition-transform active:scale-[0.98]"
                style={{ background: "linear-gradient(135deg, rgba(56,189,248,0.28), rgba(56,189,248,0.07))" }}
              >
                <span className="inline-flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-xl bg-sky-500 text-white shadow-[0_6px_18px_rgba(56,189,248,0.35)]">
                  <TimeFill size={22} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-[600] text-text-primary">
                    {t("home.recent") && t("home.recent") !== "home.recent" ? t("home.recent") : "Recently played"}
                  </span>
                  <span className="block truncate text-[12.5px] text-text-tertiary">{t("home.jumpBackIn")}</span>
                </span>
              </button>
            </div>

            {/* Daily Mixes (Made For You) */}
            {dailyMixes && dailyMixes.length > 0 && (
              <DailyMixesSection
                mixes={dailyMixes}
                headingMarginTop="mt-[22px]"
              />
            )}

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
      {!skeletonExited && (
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
    </div>
  );
}
