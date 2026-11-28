import ShareButton from "@/shared/ui/ShareButton";
import SectionExpandButton from "@/shared/ui/SectionExpandButton";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useState, Suspense, useRef, useMemo } from "react";
import {
  PlayFill,
  AddLine,
  NewFolderLine,
  FolderCheckFill,
} from "@mingcute/react";
import Button from "@/shared/ui/Button";
import SongCardWithMenu from "@/features/player/ui/SongCardWithMenu";
import { useArtistAvatar } from "../hooks/useArtistAvatar";
import { findArtistTracks, useYourArtistTrackCount } from "../hooks/useYourArtistTrackCount";
import { useLikedTracks } from "@/features/library/hooks/useLikedTracks";
import AlbumCard from "@/features/collection/ui/AlbumCard";
import ReleaseCard from "@/features/collection/ui/ReleaseCard";
import CoverImage from "@/features/covers/ui/CoverImage";
import { playerEngine } from "@/features/player";
import { AnimatePresence, motion } from "framer-motion";
import type { Track } from "@/shared/types";
import { useToast, StickyHeader } from "@/shared/ui";
import { useTranslation } from "@/languages";
import { useModalStore } from "@/features/library";
import { api, mediaUrl, toMaxQualityAvatarUrl, toClientTrack, type ApiTrack } from "@/shared/api";
import { useExternalItems } from "@/features/library/hooks";
import ArtistProfileModal from "./ArtistProfileModal";
import { PinFill, PinLine } from "@mingcute/react";
import { usePinsStore } from "@/features/navigation/store/pinsStore";
import ArtistPageSkeleton from "./ArtistPageSkeleton";
import ArtistReleaseShelf from "./ArtistReleaseShelf";
import ArtistSavedTracks, { ArtistSavedTracksShelf } from "./ArtistSavedTracks";
import { useIsContentTransparent } from "@/features/settings/store/customizationStore";
import { artistHref } from "@/shared/media/artistIdentity";
import { parseMonthlyListenersCount } from "@/shared/media/innertube/monthlyListeners";

interface ArtistAlbumViewModel {
  id: string;
  title: string;
  coverUrl: string;
  releaseDate?: string;
  totalTracks?: number;
  explicit?: boolean;
}

interface ArtistReleaseViewModel extends ArtistAlbumViewModel {
  releaseType: "single" | "ep";
}

import { useArtist } from "../hooks/useArtist";

function stripMarkdown(text: string): string {
  return text
    .replace(/(Дискография)(Официальный)/g, "$1\n\n$2")
    .replace(/(сайт|ВКонтакте|канал|#\d|TikTok)(Официальный|Сообщество|Страница|Телеграм|YouTube|TikTok|Twitch)/g, "$1, $2")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/^•\s*/gm, "")
    .trim();
}

function ArtistFallback({ id, name }: { id: string | null; name: string | null }) {
  const { t } = useTranslation();
  const { data, isLoading } = useLikedTracks();
  const tracks = findArtistTracks(data.tracks, { id, name });
  const [isScrolled, setIsScrolled] = useState(false);
  if (isLoading && (id || name) && !tracks.length) return <ArtistPageSkeleton />;
  if (!tracks.length) {
    return (
      <div className="flex h-full w-full items-center justify-center text-text-secondary">
        {t("artist.artist_not_found")}
      </div>
    );
  }
  const title = name || tracks[0].artists;
  return (
    <div
      className="relative h-full w-full overflow-y-auto pb-[32px]"
      data-page-scroller
      onScroll={(event) => {
        const next = event.currentTarget.scrollTop > 40;
        setIsScrolled((prev) => (prev === next ? prev : next));
      }}
    >
      <StickyHeader
        isScrolled={isScrolled}
        desktopBackdrop
        backButtonSurface
        frostedBackButton
        plainMetadata
        title={title}
      />

      <div className="relative w-full min-h-[260px] flex flex-col justify-end overflow-hidden">
        <div
          className="absolute inset-0 z-0 bg-bg-elevated"
          style={{
            maskImage: "linear-gradient(to bottom, black 0%, black 35%, transparent 100%)",
            WebkitMaskImage: "linear-gradient(to bottom, black 0%, black 35%, transparent 100%)",
          }}
        />
        <div className="relative z-10 px-[32px] pb-[20px] pt-[96px]">
          <h1
            className="m-0 text-[38px] md:text-[48px] font-[700] tracking-[-0.03em] leading-[1.05] text-text-primary"
            style={{ fontFamily: "var(--font-inter), sans-serif" }}
          >
            {title}
          </h1>
          <p
            className="m-0 mt-[6px] text-[14px] text-text-secondary font-[400]"
            style={{ fontFamily: "var(--font-inter), sans-serif" }}
          >
            {t("artist.your_tracks", { count: tracks.length })}
          </p>
        </div>
      </div>

      <div className="relative z-10 px-[32px] pt-[8px]">
        <ArtistSavedTracksShelf tracks={tracks} name={title} />
      </div>
    </div>
  );
}

function ArtistContent() {
  const { t, locale } = useTranslation();
  const navigate = useNavigate();
  const hasCustomBg = useIsContentTransparent();
  const actionButtonVariant = hasCustomBg ? "glass-action" : "outline";
  const actionButtonClass = `!h-[38px] !w-[38px] !p-0 shrink-0 flex items-center justify-center transition-colors ${
    hasCustomBg ? "" : "text-text-secondary hover:text-text-primary !bg-bg-panel/40 backdrop-blur-sm"
  }`;
  const [searchParams] = useSearchParams();
  const requestedId = searchParams.get("id");
  const requestedName = searchParams.get("name");
  const { data, loading } = useArtist(requestedId, requestedName, searchParams.get("track"));
  const playableTracks = useMemo(() => data?.tracks.filter(track => !track.catalogUnavailable) ?? [], [data?.tracks]);
  const id = data?.id ?? requestedId;
  const pinned = usePinsStore((st) => Boolean(id && st.pins.some((p) => p.kind === "artist" && p.id === id)));

  const artistImage = useArtistAvatar(data ? id ?? undefined : undefined, data?.title, data?.coverUrl ?? undefined);
  const [showAllTracks, setShowAllTracks] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [loadingMore] = useState(false);
  const [hasMore] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const tracksSectionRef = useRef<HTMLElement>(null);

  const decodedId = id ?? "";
  const { data: savedArtists } = useExternalItems("artist");
  const inLibrary = savedArtists.some((artist) => artist.id === decodedId);

  const handlePlayAll = () => {
    if (!data || playableTracks.length === 0) return;
    const [first] = playableTracks;
    playerEngine.clearQueue();
    playerEngine.playTrack(first, playableTracks, data.title, data.coverUrl);
  };

  const { toast } = useToast();

  const handleAddToQueue = () => {
    if (!data || playableTracks.length === 0) return;
    playableTracks.forEach((track) => playerEngine.addToQueue(track));
    toast(t("artist.added_to_queue"), "info", {
      description: data.title || undefined,
    });
  };

  const handleSaveToLibrary = () => {
    if (!data || !id) return;
    const decoded = id;
    if (inLibrary) {
      useModalStore.getState().openRemoveFromLibrary({
        id: decoded,
        title: data.title,
        coverUrl: data.coverUrl,
        type: "artist",
      });
    } else {
      useModalStore.getState().openAddToLibrary({
        id: decoded,
        title: data.title,
        coverUrl: data.coverUrl,
        type: "artist",
      });
    }
  };

  if (!loading && !data) {
    return <ArtistFallback id={requestedId} name={requestedName} />;
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-transparent">

      <div
        ref={scrollRef}
        onScroll={(e) => {
          const container = e.currentTarget;
          let nextScrolled = false;
          if (tracksSectionRef.current) {
            const relativeTrackTop =
              tracksSectionRef.current.getBoundingClientRect().top -
              container.getBoundingClientRect().top;
            nextScrolled = relativeTrackTop <= 56;
          } else {
            nextScrolled = container.scrollTop > 260;
          }
          setIsScrolled((prev) => (prev === nextScrolled ? prev : nextScrolled));
        }}
        data-page-scroller
        className="relative h-full w-full overflow-y-auto pb-[32px]"
      >
        <StickyHeader
          isScrolled={isScrolled}
          desktopBackdrop
          backButtonSurface
          frostedBackButton
          plainMetadata
          title={data?.title}
          thumbnail={
            artistImage ? (
              <div className="relative h-[24px] w-[24px] shrink-0 overflow-hidden rounded-full bg-white/10">
                <CoverImage
                  src={artistImage!}
                  alt={data?.title ?? ""}
                  fill
                  sizes="24px"
                  className="object-cover"
                  draggable={false}
                />
              </div>
            ) : (
              <div className="flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-full bg-white/10 text-white/70 text-[11px] font-bold">
                {data?.title ? data.title.charAt(0) : ""}
              </div>
            )
          }
        />

        <div className="relative z-1 grid grid-cols-1 items-start w-full">
          {data && (
            <div className="col-start-1 row-start-1 w-full pb-[32px]">
              <div className="relative w-full min-h-[340px] md:min-h-[380px] flex flex-col justify-between overflow-hidden">
                {artistImage ? (
                  <div
                    className="absolute inset-0 z-0 overflow-hidden pointer-events-none"
                    style={{
                      maskImage:
                        "linear-gradient(to bottom, black 0%, black 35%, transparent 100%)",
                      WebkitMaskImage:
                        "linear-gradient(to bottom, black 0%, black 35%, transparent 100%)",
                    }}
                  >
                    <CoverImage
                      src={artistImage!}
                      alt={data.title}
                      fill
                      sizes="100vw"
                      className="object-cover object-center"
                      draggable={false}
                    />
                  </div>
                ) : (
                  <div
                    className="absolute inset-0 z-0 bg-bg-elevated"
                    style={{
                      maskImage:
                        "linear-gradient(to bottom, black 0%, black 35%, transparent 100%)",
                      WebkitMaskImage:
                        "linear-gradient(to bottom, black 0%, black 35%, transparent 100%)",
                    }}
                  />
                )}


                {/* drag strip starts right of the Back button: on Linux a later drag box would swallow its clicks */}
                <div className="relative z-10 ml-[150px] pt-[56px]" data-window-drag />

              <div className="relative z-10 px-[32px] pb-[20px] flex flex-col md:flex-row items-start md:items-end justify-between gap-[24px]">
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-[8px] md:gap-[10px]">
                    <h1
                      className="m-0 text-[38px] md:text-[48px] font-[700] tracking-[-0.03em] leading-[1.05] text-text-primary"
                      style={{
                        fontFamily: "var(--font-inter), sans-serif",
                      }}
                    >
                      {data.title}
                    </h1>
                    {data.verified ? (
                      <svg
                        viewBox="0 0 24 24"
                        className="h-[24px] w-[24px] md:h-[32px] md:w-[32px] shrink-0 translate-y-[2px] md:translate-y-[3px] text-[#1d9bf0]"
                        fill="currentColor"
                        aria-label={t("artist.verified")}
                      >
                        <path d="M10.007 2.10377C8.60544 1.65006 7.08181 2.28116 6.41156 3.59306L5.60578 5.17023C5.51004 5.35763 5.35763 5.51004 5.17023 5.60578L3.59306 6.41156C2.28116 7.08181 1.65006 8.60544 2.10377 10.007L2.64923 11.692C2.71404 11.8922 2.71404 12.1078 2.64923 12.308L2.10377 13.993C1.65006 15.3946 2.28116 16.9182 3.59306 17.5885L5.17023 18.3942C5.35763 18.49 5.51004 18.6424 5.60578 18.8298L6.41156 20.407C7.08181 21.7189 8.60544 22.35 10.007 21.8963L11.692 21.3508C11.8922 21.286 12.1078 21.286 12.308 21.3508L13.993 21.8963C15.3946 22.35 16.9182 21.7189 17.5885 20.407L18.3942 18.8298C18.49 18.6424 18.6424 18.49 18.8298 18.3942L20.407 17.5885C21.7189 16.9182 22.35 15.3946 21.8963 13.993L21.3508 12.308C21.286 12.1078 21.286 11.8922 21.3508 11.692L21.8963 10.007C22.35 8.60544 21.7189 7.08181 20.407 6.41156L18.8298 5.60578C18.6424 5.51004 18.49 5.35763 18.3942 5.17023L17.5885 3.59306C16.9182 2.28116 15.3946 1.65006 13.993 2.10377L12.308 2.64923C12.1078 2.71403 11.8922 2.71404 11.692 2.64923L10.007 2.10377Z" />
                        <path
                          d="M6.75977 11.7573L8.17399 10.343L11.0024 13.1715L16.6593 7.51465L18.0735 8.92886L11.0024 15.9999L6.75977 11.7573Z"
                          fill="#ffffff"
                        />
                      </svg>
                    ) : null}
                  </div>

                  {data.monthlyListeners ? (
                    <p
                      className="m-0 mt-[6px] text-[14px] text-text-secondary font-[400]"
                      style={{ fontFamily: "var(--font-inter), sans-serif" }}
                    >
                      {(() => {
                        const count = parseMonthlyListenersCount(data.monthlyListeners);
                        return count === undefined ? data.monthlyListeners : t("artist.monthly_audience", {
                          count: Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 2 }).format(count),
                        });
                      })()}
                    </p>
                  ) : data.followers ? (
                    <p
                      className="m-0 mt-[6px] text-[14px] text-text-secondary font-[400]"
                      style={{ fontFamily: "var(--font-inter), sans-serif" }}
                    >
                      {Intl.NumberFormat(locale, { notation: "compact" }).format(
                        data.followers,
                      )}{" "}
                      {t("artist.followers")}
                    </p>
                  ) : null}

                  <YourArtistTracks id={id} name={data.title} />

                  <div className="mt-[16px] flex items-center gap-[8px]">
                    <Button
                      variant={hasCustomBg ? "glass-primary" : "primary"}
                      onClick={handlePlayAll}
                      disabled={!playableTracks.length}
                      className="!h-[38px] !text-[13px] !font-[500] px-[20px] flex items-center gap-[6px]"
                    >
                      <PlayFill size={15} />
                      <span>{t("artist.play")}</span>
                    </Button>

                    <Button
                      variant={actionButtonVariant}
                      onClick={handleAddToQueue}
                      disabled={!playableTracks.length}
                      className={actionButtonClass}
                      title={t("artist.add_to_queue")}
                    >
                      <AddLine size={18} />
                    </Button>

                    <Button
                      variant={actionButtonVariant}
                      onClick={handleSaveToLibrary}
                      className={actionButtonClass}
                      title={
                        inLibrary
                          ? t("artist.remove_from_library")
                          : t("artist.save_to_library")
                      }
                    >
                      <AnimatePresence mode="wait">
                        {inLibrary ? (
                          <motion.span
                            key="saved"
                            initial={{ scale: 0.5, rotate: -20 }}
                            animate={{ scale: 1, rotate: 0 }}
                            exit={{ scale: 0.5, rotate: 20 }}
                            className="flex"
                          >
                            <FolderCheckFill size={18} />
                          </motion.span>
                        ) : (
                          <motion.span
                            key="unsaved"
                            initial={{ scale: 0.5, rotate: -20 }}
                            animate={{ scale: 1, rotate: 0 }}
                            exit={{ scale: 0.5, rotate: 20 }}
                            className="flex"
                          >
                            <NewFolderLine size={18} />
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </Button>

                    <Button
                      variant={actionButtonVariant}
                      onClick={() =>
                        id &&
                        usePinsStore.getState().toggle({
                          kind: "artist",
                          id,
                          title: data.title,
                          imageUrl: data.coverUrl || undefined,
                           href: artistHref(id, data.title),
                        })
                      }
                      className={actionButtonClass}
                      title={pinned ? (t("common.sidebar.unpin") || "Unpin from menu") : (t("common.sidebar.pin") || "Pin to menu")}
                    >
                      {pinned ? <PinFill size={18} /> : <PinLine size={18} />}
                    </Button>
                    {id && (
                      <ShareButton
                        type="artist"
                        entityId={decodedId}
                        snapshot={{ title: data.title, coverUrl: data.coverUrl ?? undefined }}
                        variant={actionButtonVariant}
                        className={actionButtonClass}
                      />
                    )}

                  </div>
                </div>

                {data.description && (
                  <div
                    className={`w-full md:w-[340px] lg:w-[380px] shrink-0 rounded-md p-[16px] flex flex-col gap-[6px] border-0 !border-none ${
                      hasCustomBg
                        ? "apple-glass-pill !border-none text-text-primary"
                        : "bg-bg-panel/85 backdrop-blur-xl text-text-primary border-0 !border-none"
                    }`}
                  >
                    <span
                      className="text-[15px] font-[600] tracking-[-0.01em] text-text-primary"
                      style={{ fontFamily: "var(--font-inter), sans-serif" }}
                    >
                      {t("artist.about_artist")}
                    </span>
                    <p
                      className="m-0 text-[13px] leading-[1.5] text-text-secondary font-[400] select-text line-clamp-3"
                      style={{ fontFamily: "var(--font-inter), sans-serif" }}
                    >
                      {stripMarkdown(data.description)}
                    </p>
                    {data.description.length > 120 && (
                      <SectionExpandButton label={t("artist.show_all")} onClick={() => setIsProfileModalOpen(true)} />
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="relative z-10 px-[32px] pt-[24px]">
              <div className="flex flex-col gap-[40px]">
                <section id="artist-tracks-section" ref={tracksSectionRef}>
                  <div className="flex items-center justify-between mb-[16px]">
                    <h2
                      className="text-[22px] font-[500] text-text-primary m-0"
                      style={{ fontFamily: "var(--font-inter), sans-serif" }}
                    >
                      {t("artist.popular_songs")}
                    </h2>
                  </div>
                  <div className="flex flex-col -mt-[14px] -mx-[8px]">
                    {data.tracks.slice(0, 5).map((track) => (
                      <SongCardWithMenu
                        key={track.id}
                        id={track.catalogUnavailable ? undefined : track.id}
                        title={track.title}
                        artists={track.artists}
                        artistId={track.artistId}
                        artistList={track.artistList}
                        coverUrl={track.coverUrl || data.coverUrl}
                        duration={
                          track.durationMs
                            ? `${Math.floor(track.durationMs / 60000)}:${Math.floor(
                                (track.durationMs % 60000) / 1000,
                              )
                                .toString()
                                .padStart(2, "0")}`
                            : undefined
                        }
                        durationMs={track.durationMs}
                        explicit={track.explicit}
                        unavailableNote={track.catalogUnavailable ? t("player.track_unavailable_title") : undefined}
                        hideMenuTrigger={track.catalogUnavailable}
                        onPlay={track.catalogUnavailable ? undefined : () =>
                          playerEngine.playTrack(
                            track,
                            playableTracks,
                            data.title,
                            data.coverUrl,
                          )
                        }
                      />
                    ))}

                    <AnimatePresence initial={false}>
                      {showAllTracks && (
                        <motion.div
                          key="expanded-tracks"
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.28, ease: [0.25, 1, 0.5, 1] }}
                          className="overflow-hidden flex flex-col"
                        >
                          {data.tracks.slice(5).map((track) => (
                            <SongCardWithMenu
                              key={track.id}
                              id={track.catalogUnavailable ? undefined : track.id}
                              title={track.title}
                              artists={track.artists}
                              artistId={track.artistId}
                              artistList={track.artistList}
                              coverUrl={track.coverUrl || data.coverUrl}
                              duration={
                                track.durationMs
                                  ? `${Math.floor(track.durationMs / 60000)}:${Math.floor(
                                      (track.durationMs % 60000) / 1000,
                                    )
                                      .toString()
                                      .padStart(2, "0")}`
                                  : undefined
                              }
                              durationMs={track.durationMs}
                              explicit={track.explicit}
                              unavailableNote={track.catalogUnavailable ? t("player.track_unavailable_title") : undefined}
                              hideMenuTrigger={track.catalogUnavailable}
                              onPlay={track.catalogUnavailable ? undefined : () =>
                                playerEngine.playTrack(track, playableTracks, data.title, data.coverUrl)
                              }
                            />
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {data.tracks.length === 0 && (
                      <p className="text-text-secondary px-[8px] py-[14px]">
                        {t("artist.no_popular_songs")}
                      </p>
                    )}
                  </div>
                  {data.tracks.length > 5 && <SectionExpandButton label={t(showAllTracks ? "artist.show_less" : "artist.show_all")}
                    expanded={showAllTracks} controls="artist-tracks-section" onClick={() => setShowAllTracks(value => !value)} />}
                </section>

                {data.albums.length > 0 && (
                  <ArtistReleaseShelf label={t("artist.albums")} items={data.albums}
                    renderCard={(album) => (
                        <AlbumCard
                          id={album.id}
                          title={album.title}
                          coverUrl={album.coverUrl}
                          year={album.releaseDate}
                          explicit={album.explicit}
                          trackCount={album.totalTracks}
                        />
                    )} />
                )}

                {data.singles.length > 0 && (
                  <ArtistReleaseShelf label={t("artist.singles")} items={data.singles}
                    renderCard={(single) => (
                        <ReleaseCard
                          id={single.id}
                          title={single.title}
                          coverUrl={single.coverUrl}
                          releaseType={single.releaseType}
                          artistName={data.title}
                          year={single.releaseDate}
                          explicit={single.explicit}
                        />
                    )} />
                )}
                <ArtistSavedTracks id={id} name={data.title} coverUrl={data.coverUrl} />
              </div>
            </div>
          </div>
        )}

         {!data && <ArtistPageSkeleton />}
      </div>
      </div>

      {data && (
        <ArtistProfileModal
          open={isProfileModalOpen}
          onClose={() => setIsProfileModalOpen(false)}
          name={data.title}
          verified={data.verified}
          geniusImageUrl={data.geniusImageUrl}
          fallbackImageUrl={data.coverUrl}
          geniusUsername={data.geniusUsername}
          geniusAka={data.geniusAka}
          bio={data.description}
        />
      )}
    </div>
  );
}

export default function ArtistPage() {
  const [searchParams] = useSearchParams();
  return (
    <Suspense fallback={<ArtistPageSkeleton />}>
      <ArtistContent key={searchParams.toString()} />
    </Suspense>
  );
}

/** how many of this artist's songs you have in your liked songs */
function YourArtistTracks({ id, name }: { id: string | null; name: string }) {
  const { t } = useTranslation();
  const { count, isLoading } = useYourArtistTrackCount({ id, name });
  if (isLoading || count === 0) return null;
  return (
    <p className="m-0 mt-[4px] text-[13px] text-text-tertiary font-[400]" style={{ fontFamily: "var(--font-inter), sans-serif" }}>
      {t("artist.your_tracks", { count })}
    </p>
  );
}
