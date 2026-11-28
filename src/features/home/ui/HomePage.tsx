import { useMemo, useState, useEffect } from "react";
import { warmTrackTags } from "@/features/library/services/trackTags";
import LikedCover from "@/features/library/ui/LikedCover";
import { useNavigate } from "react-router-dom";
import PopularTracksSection from "./PopularTracksSection";
import DailyMixesSection from "./DailyMixesSection";
import CountryMixesSection from "./CountryMixesSection";
import TrendsSection from "./TrendsSection";
import MyVibeHero from "./MyVibeHero";
import {
  usePopular,
  usePopularTracksOnly,
  usePopularTracksAllTime,
} from "../hooks/usePopularTracks";
import { useRecentlyPlayed } from "../hooks/useRecentlyPlayed";
import { useDailyMixes } from "../hooks/useDailyMixes";
import { useNewReleases } from "../hooks/useNewReleases";
import { useLikedTracks } from "@/features/library/hooks/useLikedTracks";
import { useTranslation } from "@/languages";
import { useIsContentTransparent } from "@/features/settings/store/customizationStore";
import {
  FireFill,
  TrophyFill,
  AlbumFill,
  PlaylistFill,
  HistoryLine,
  RightLine,
} from "@mingcute/react";
import CoverImage from "@/features/covers/ui/CoverImage";

export default function HomePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const hasCustomBg = useIsContentTransparent();
  const { data: likedData, isLoading: likedLoading } = useLikedTracks();

  const { data: popularItems } = usePopular(100);
  const { data: popularTracksOnly } =
    usePopularTracksOnly(20);
  const { data: popularTracksAllTime } =
    usePopularTracksAllTime(20);
  const { data: recentlyPlayed } =
    useRecentlyPlayed(20);
  const { data: dailyMixes } = useDailyMixes();
  const { items: newReleases, isLoading: releasesLoading, hasError: releasesError } = useNewReleases(likedData.tracks, likedLoading);

  const popularAlbums =
    popularItems?.filter((it) => it.type === "album") ?? [];
  const popularPlaylists =
    popularItems?.filter((it) => it.type === "playlist") ?? [];

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

  // liked songs get their tags (genre, pace) in the background from the start
  useEffect(() => {
    if (!likedData?.tracks?.length) return;
    const timer = setTimeout(() => warmTrackTags(likedData.tracks), 1800);
    return () => clearTimeout(timer);
  }, [likedData?.tracks]);

  // desktop: "My Vibe" can fill the whole page (arrow next to its settings)
  const [vibeExpanded, setVibeExpanded] = useState(false);

  return (
    <div data-page-scroller data-lane-home className={`relative h-full min-w-0 w-full overflow-x-hidden bg-transparent ${vibeExpanded ? "overflow-y-hidden" : "overflow-y-auto"}`}>

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
                    sub: likedLoading
                      ? `${t("common.loading")} · ${t("common.songs", { count: likedData.total })}`
                      : `${likedData.total} ${likedData.total === 1 ? t("library.song") : t("library.songs")}`,
                    thumbs: likedData.tracks
                      .filter((tr) => Boolean(tr.coverUrl))
                      .slice(0, 3)
                      .map((tr) => tr.coverUrl!),
                  },
                  {
                    key: "history",
                    onClick: () => navigate("/recent"),
                    tile: (
                      <span className="inline-flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-[10px] bg-bg-toolbox-active text-text-primary md:h-[52px] md:w-[52px]">
                        <HistoryLine size={22} />
                      </span>
                    ),
                    title: t("home.history"),
                    sub:
                       [...new Set(vibeRecent.map((tr) => tr.artists.split(",")[0]?.trim()).filter(Boolean))].slice(0, 3).join(", "),
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
                    className="group flex h-[64px] min-w-0 items-center gap-[12px] rounded-[18px] border-0 bg-bg-elevated px-[8px] text-left text-text-primary cursor-pointer transition-colors hover:bg-bg-panel active:bg-border-secondary md:h-[72px] md:gap-[14px] md:px-[10px]"
                >
                  {item.tile}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-[2px] text-[15px] font-[650] text-text-primary">
                      <span className="truncate">{item.title}</span>
                      <RightLine size={16} className="shrink-0 text-text-tertiary" />
                    </span>
                    <span className="block truncate text-[12.5px] text-text-tertiary">{item.sub}</span>
                    {item.key === "liked" && likedLoading && (
                      <span className="mt-[3px] block h-[2px] w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10" aria-label={t("common.loading")}>
                        <span className="block h-full w-1/3 animate-pulse rounded-full bg-current text-text-secondary" />
                      </span>
                    )}
                  </span>
                  {item.thumbs.length > 0 && (
                    <span className="flex shrink-0 items-center justify-end">
                      {item.thumbs.map((thumb, index) => (
                        <span
                          key={`${item.key}-thumb-${index}`}
                          className="relative h-[44px] w-[44px] shrink-0 overflow-hidden rounded-[10px] bg-bg-elevated ring-2 ring-bg-elevated group-hover:ring-bg-panel group-active:ring-border-secondary not-first:-ml-[30px] md:h-[52px] md:w-[52px] md:not-first:-ml-[34px]"
                          style={{ zIndex: item.thumbs.length - index }}
                        >
                          <CoverImage src={thumb} alt="" fill sizes="(min-width: 768px) 52px, 44px" className="object-cover" />
                        </span>
                      ))}
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

          <CountryMixesSection />

          {/* Trending: Russia / worldwide */}
          <TrendsSection />

          <PopularTracksSection
            title={t("home.newReleases")}
            icon={<AlbumFill className="w-5 h-5 text-sky-400" />}
            items={newReleases}
            emptyMessage={releasesLoading
              ? t("common.loading")
              : releasesError ? t("home.newReleasesError") : t("home.newReleasesEmpty")}
          />

          {/* Listening Right Now (Trending Chart) */}
          {popularTracksOnly && popularTracksOnly.length > 0 && (
            <PopularTracksSection
              title={t("home.whatEveryonesOn")}
              icon={<FireFill className="w-5 h-5 text-amber-500" />}
              items={popularTracksOnly}
              showTrackStats
              headingMarginTop="mt-[22px]"
            />
          )}

          {/* Most Listened of All Time */}
          {popularTracksAllTime && popularTracksAllTime.length > 0 && (
            <PopularTracksSection
              title={t("home.mostListened")}
              icon={<TrophyFill className="w-5 h-5 text-yellow-500" />}
              items={popularTracksAllTime}
              showTrackStats
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



      </div>
      )}
    </div>
  );
}
