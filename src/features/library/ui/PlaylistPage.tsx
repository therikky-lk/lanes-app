import { useIsMobile } from "@/shared/hooks/useIsMobile";
import { useNavigate, useSearchParams } from "react-router-dom";
import ScrollBlurEdge from "@/shared/ui/ScrollBlurEdge";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, memo, Suspense } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import PlaylistPageSkeleton from "./PlaylistPageSkeleton";
import { useToast, ReorderDropPlaceholder, FloatingDragCard, EntitySidebar, SIDEBAR_TITLE_CLASS, SIDEBAR_SUBTITLE_CLASS } from "@/shared/ui";
import {
  AddLine,
  PlayFill,
  More2Line,
  HeartFill,
  PlaylistFill,
  PlaylistLine,
  MusicLine,
  CheckLine,
  ArrowLeftLine,
  Search2Line,
  PicLine,
  GridLine,
  MenuLine,
} from "@mingcute/react";
import { AnimatePresence, motion } from "framer-motion";
import { LuPencil, LuTrash2, LuText, LuShuffle, LuExternalLink } from "react-icons/lu";
import { FaSpotify } from "react-icons/fa";
import SegmentedTabs from "@/shared/ui/SegmentedTabs";
import TrackGridCard from "@/features/player/ui/TrackGridCard";
import { getImportedPlaylistMeta } from "../services/import/importedPlaylistMeta";
import { readCoverMarker, stripCoverMarker, withCoverMarker } from "../services/playlistCoverMarker";
import { getPlaylistCover, hasCustomPlaylistCover, imageFileToCover, setPlaylistCover } from "../services/playlistCovers";
import Button from "@/shared/ui/Button";
import DropdownMenu from "@/shared/ui/DropdownMenu";
import SongCardWithMenu from "@/features/player/ui/SongCardWithMenu";
import CoverImage from "@/features/covers/ui/CoverImage";
import { useModalStore } from "../store/modalStore";
import {
  usePlaylist,
  useLikedTracks,
  useReorderPlaylistTracks,
} from "../hooks";
import { useListReorder } from "@/shared/hooks";
import { playerEngine, usePlayerStore } from "@/features/player";
import type { Track } from "@/shared/types";
import { useTranslation } from "@/languages";
import { api } from "@/shared/api";
import { useIsContentTransparent } from "@/features/settings/store/customizationStore";
import { useLocalTracks } from "@/features/local/hooks/useLocalTracks";
import { isLocalPlaylistItemId, withLocalAvailability } from "@/features/local/localPlaylistTracks";
import { useTrackTags, type TrackTag } from "../services/trackTags";
import LikedCover from "./LikedCover";
import {
  useTrackSearch,
  useTrackSearchButtonLabel,
  TrackSearchField,
  TrackSearchEmpty,
} from "./TrackSearch";

interface TrackItemProps {
  track: Track;
  playlistId?: string;
  playlistTitle: string;
  playlistCoverUrl: string;
  allTracks: Track[];
  style?: React.CSSProperties;
  showReorderHandle?: boolean;
  onGrabStart?: (e: React.PointerEvent<HTMLDivElement>) => void;
  highlight?: string;
  isCurrent?: boolean;
}

function albumTitleOf(track: Track): string {
  const album = (track as { album?: unknown }).album;
  if (typeof album === "string") return album;
  if (album && typeof album === "object" && "title" in album) return String((album as { title?: string }).title ?? "");
  return "";
}

const TrackItem = memo(function TrackItem({
  track,
  playlistId,
  playlistTitle,
  playlistCoverUrl,
  allTracks,
  style,
  showReorderHandle,
  onGrabStart,
  highlight,
  isCurrent,
}: TrackItemProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const handlePlay = useCallback(() => {
    if (typeof window !== "undefined" && window.__linerWasDragging) return;
    if (track.onlyOnDevice) {
      toast(t("local.only_on_device_toast", { device: track.onlyOnDevice }), "info", { description: track.title });
      return;
    }
    const context = playlistId ? `playlist:${playlistId}` : playlistTitle;
    playerEngine.playTrack(
      track,
      allTracks,
      context,
      playlistCoverUrl,
    );
  }, [track, allTracks, playlistId, playlistTitle, playlistCoverUrl, toast, t]);

  return (
    <div style={style} data-reorder-item>
      <SongCardWithMenu
        id={track.id}
        title={track.title}
        artists={track.artists}
        artistId={track.artistId}
        artistList={track.artistList}
        coverUrl={track.coverUrl || playlistCoverUrl}
        playlistId={playlistId}
        playlistItemId={track.playlistItemId}
        playlistTitle={playlistTitle}
        showReorderHandle={showReorderHandle}
        onGrabStart={onGrabStart}
        highlight={highlight}
        isCurrent={isCurrent}
        albumTitle={albumTitleOf(track)}
        duration={
          track.durationMs
            ? `${Math.floor(track.durationMs / 60000)}:${String(
                Math.floor((track.durationMs % 60000) / 1000),
              ).padStart(2, "0")}`
            : undefined
        }
        durationMs={track.durationMs}
        explicit={track.explicit}
        onPlay={handlePlay}
        unavailableNote={
          track.onlyOnDevice ? t("local.only_on_device", { device: track.onlyOnDevice }) : undefined
        }
      />
    </div>
  );
});

function LibraryPlaylistContent() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const id = searchParams.get("id");
  const isLikesMode = id === "likes";
  const decodedId = id ? decodeURIComponent(id) : null;
  const scrollRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const { t } = useTranslation();
  const hasCustomBg = useIsContentTransparent();

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const reorderTracks = useReorderPlaylistTracks();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const descriptionRef = useRef<HTMLParagraphElement>(null);

  const {
    data: playlistDetail,
    isLoading: playlistLoading,
    error: playlistError,
  } = usePlaylist(isLikesMode ? null : decodedId);

  const { data: likesData, isLoading: likesLoading } = useLikedTracks(
    isLikesMode ? { limit: 1000, offset: 0 } : undefined,
  );

  const isLoading = isLikesMode ? likesLoading : playlistLoading;

  // where the playlist was imported from (kept on this device)
  const [importMeta, setImportMeta] = useState(() => getImportedPlaylistMeta(isLikesMode ? null : decodedId));
  useEffect(() => {
    const refresh = () => setImportMeta(getImportedPlaylistMeta(isLikesMode ? null : decodedId));
    refresh();
    window.addEventListener("library:changed", refresh);
    return () => window.removeEventListener("library:changed", refresh);
  }, [decodedId, isLikesMode]);
  const currentTrackId = usePlayerStore((st) => st.currentTrack?.id ?? null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [trackView, setTrackViewState] = useState<"list" | "grid">(() => {
    try {
      return localStorage.getItem("lane_tracks_view") === "grid" ? "grid" : "list";
    } catch {
      return "list";
    }
  });
  const setTrackView = useCallback((view: "list" | "grid") => {
    setTrackViewState(view);
    try {
      localStorage.setItem("lane_tracks_view", view);
    } catch {}
  }, []);

  const { records: localRecords } = useLocalTracks();

  // memoized: a fresh track array on every render made every row, the search
  // and the reorder hook redo their work, which froze big liked lists
  const viewData = useMemo(() => {
    if (isLikesMode) {
      if (!likesData) return null;
      // the user's own files liked on another device are greyed out here
      const tracks: Track[] = withLocalAvailability(
        (likesData.tracks ?? []).map((t) => ({ ...t, playCount: 0 })),
        localRecords,
      );
      return {
        title: t("playlist.liked_songs"),
        bio: "",
        countLabel: t("common.tracks", { count: tracks.length }),
        coverUrl: "",
        coverUrls: [] as string[],
        tracks,
        revision: 0,
      };
    }
    if (!playlistDetail) return null;
    const bio = stripCoverMarker(playlistDetail.description);
    return {
      title: playlistDetail.title || t("playlist.untitled_playlist"),
      bio,
      countLabel: t("common.tracks", { count: playlistDetail.trackCount }),
      coverUrl: playlistDetail.coverUrl || "",
      coverUrls:
        playlistDetail.coverUrls ??
        (playlistDetail.coverUrl ? [playlistDetail.coverUrl] : []),
      tracks: withLocalAvailability(playlistDetail.tracks, localRecords),
      revision: playlistDetail.revision,
    };
  }, [isLikesMode, likesData, playlistDetail, localRecords, t]);

  useEffect(() => {
    if (isEditingTitle && titleRef.current) {
      titleRef.current.focus();
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(titleRef.current);
      range.collapse(false);
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  }, [isEditingTitle]);

  useEffect(() => {
    if (isEditingDescription && descriptionRef.current) {
      descriptionRef.current.focus();
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(descriptionRef.current);
      range.collapse(false);
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  }, [isEditingDescription]);

  const trackListContainerRef = useRef<HTMLDivElement>(null);
  const [optimisticTracks, setOptimisticTracks] = useState<Track[] | null>(null);

  useEffect(() => {
    setOptimisticTracks(null);
  }, [viewData?.revision, decodedId]);

  const allTracks = useMemo(() => {
    return optimisticTracks ?? viewData?.tracks ?? [];
  }, [optimisticTracks, viewData?.tracks]);

  // liked songs: tags (fast, rap, pop…) narrow the list down
  const [activeTag, setActiveTag] = useState<TrackTag | null>(null);
  useEffect(() => setActiveTag(null), [decodedId]);
  const trackTags = useTrackTags(allTracks, isLikesMode);
  const currentTracks = useMemo(
    () => {
      if (!isLikesMode || !activeTag) return allTracks;
      return allTracks.filter((track) => trackTags.tagsOf(track.id).includes(activeTag));
    },
    [isLikesMode, activeTag, allTracks, trackTags],
  );

  // tracks from another device's files are shown but never queued here
  const playableTracks = useMemo(
    () => (currentTracks.some((track) => track.onlyOnDevice) ? currentTracks.filter((track) => !track.onlyOnDevice) : currentTracks),
    [currentTracks],
  );

  const search = useTrackSearch(currentTracks, id);
  const searchButtonLabel = useTrackSearchButtonLabel();
  const isFiltering = search.matches !== null;
  const visibleTracks = useMemo(
    () => search.matches ?? currentTracks.map((track, index) => ({ track, index })),
    [search.matches, currentTracks],
  );

  // the grid mounts tiles a screenful at a time: hundreds of tiles with a
  // menu each at once froze the page on big liked lists
  const GRID_PAGE = 60;
  const [gridLimit, setGridLimit] = useState(GRID_PAGE);
  useEffect(() => {
    setGridLimit(GRID_PAGE);
  }, [visibleTracks]);
  const gridObserverRef = useRef<IntersectionObserver | null>(null);
  const gridSentinelRef = useCallback((node: HTMLDivElement | null) => {
    gridObserverRef.current?.disconnect();
    if (!node) return;
    gridObserverRef.current = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setGridLimit((n) => n + GRID_PAGE);
      },
      { root: scrollRef.current, rootMargin: "800px 0px" },
    );
    gridObserverRef.current.observe(node);
  }, []);
  useEffect(() => () => gridObserverRef.current?.disconnect(), []);

  // results start at the top, not wherever the full list was scrolled to
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [search.activeQuery]);

  const handleSearchSubmit = useCallback(() => {
    const first = search.matches?.find((match) => !match.track.onlyOnDevice);
    if (!first || !viewData) return;
    const context = decodedId ? `playlist:${decodedId}` : viewData.title;
    playerEngine.playTrack(first.track, playableTracks, context, viewData.coverUrl);
  }, [search.matches, viewData, decodedId, playableTracks]);

  const handlePlayAll = useCallback(() => {
    if (!playableTracks.length || !viewData) return;
    const context = decodedId ? `playlist:${decodedId}` : viewData.title;
    playerEngine.clearQueue();
    playerEngine.playTrack(
      playableTracks[0],
      playableTracks,
      context,
      viewData.coverUrl,
    );
  }, [playableTracks, viewData, decodedId]);

  const handleShufflePlay = useCallback(() => {
    if (!playableTracks.length || !viewData) return;
    const context = decodedId ? `playlist:${decodedId}` : viewData.title;
    playerEngine.clearQueue();
    void playerEngine.playShuffled(
      playableTracks,
      context,
      viewData.coverUrl,
    );
  }, [playableTracks, viewData, decodedId]);

  const { toast } = useToast();
  const [addedToQueue, setAddedToQueue] = useState(false);

  const handleAddToQueue = useCallback(() => {
    if (!playableTracks.length || !viewData) return;
    for (const track of playableTracks) {
      playerEngine.addToQueue(track);
    }
    const playlistTitle = viewData.title || t("playlist.untitled_playlist");
    toast(t("playlist.added_to_queue"), "info", {
      description: playlistTitle,
    });
    setAddedToQueue(true);
    const timer = setTimeout(() => {
      setAddedToQueue(false);
    }, 1200);
    return () => clearTimeout(timer);
  }, [playableTracks, viewData, toast, t]);

  const handleReorderCommit = useCallback(
    (fromIndex: number, toIndex: number, movingTrack: Track) => {
      if (!decodedId || !viewData || isLikesMode) return;
      if (fromIndex === toIndex || !movingTrack.playlistItemId) return;

      const nextList = [...currentTracks];
      const [item] = nextList.splice(fromIndex, 1);
      nextList.splice(toIndex, 0, item);

      const nextItem = nextList[toIndex + 1];
      const beforeItemId = nextItem ? (nextItem.playlistItemId ?? null) : null;

      setOptimisticTracks(nextList);

      reorderTracks.mutate({
        playlistId: decodedId,
        itemId: movingTrack.playlistItemId,
        beforeItemId,
        revision: viewData.revision,
      });
    },
    [currentTracks, decodedId, isLikesMode, reorderTracks, viewData],
  );

  const {
    isDragging,
    dragIndex,
    dropIndex,
    draggedItem,
    pointerPos,
    grabOffset,
    itemWidth,
    handleCardGrab,
  } = useListReorder<Track>({
    items: currentTracks,
    scrollContainerRef: scrollRef,
    listContainerRef: trackListContainerRef,
    itemHeight: 64,
    onReorder: handleReorderCommit,
    edgeThreshold: 80,
    maxScrollSpeed: 22,
  });

  // phone layout: the whole page scrolls, so the list starts below the header
  const [listScrollMargin, setListScrollMargin] = useState(0);
  useLayoutEffect(() => {
    if (!isMobile) {
      setListScrollMargin(0);
      return;
    }
    const list = trackListContainerRef.current;
    const scroller = scrollRef.current;
    if (!list || !scroller) return;
    const margin = list.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
    setListScrollMargin((prev) => (Math.abs(prev - margin) > 0.5 ? margin : prev));
  });

  const rowVirtualizer = useVirtualizer({
    scrollMargin: listScrollMargin,
    count: visibleTracks.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 64,
    overscan: 25,
    getItemKey: (index) =>
      visibleTracks[index]?.track.playlistItemId ??
      visibleTracks[index]?.track.id ??
      index,
  });

  const handleBack = useCallback(() => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/library");
    }
  }, [navigate]);

  const targetScrollTopRef = useRef<number | null>(null);
  const rafIdRef = useRef<number | null>(null);

  const handleTopWheel = useCallback((e: React.WheelEvent) => {
    const container = scrollRef.current;
    if (!container) return;

    const maxScroll = container.scrollHeight - container.clientHeight;
    if (maxScroll <= 0) return;

    const current = targetScrollTopRef.current ?? container.scrollTop;
    const target = Math.max(0, Math.min(maxScroll, current + e.deltaY));
    targetScrollTopRef.current = target;

    if (rafIdRef.current === null) {
      const step = () => {
        if (!scrollRef.current || targetScrollTopRef.current === null) {
          rafIdRef.current = null;
          return;
        }
        const now = scrollRef.current.scrollTop;
        const diff = targetScrollTopRef.current - now;
        if (Math.abs(diff) < 0.5) {
          scrollRef.current.scrollTop = targetScrollTopRef.current;
          targetScrollTopRef.current = null;
          rafIdRef.current = null;
          return;
        }
        scrollRef.current.scrollTop = now + diff * 0.25;
        rafIdRef.current = requestAnimationFrame(step);
      };
      rafIdRef.current = requestAnimationFrame(step);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, []);

  const urlsToPreload = useMemo(() => {
    if (!viewData) return [];
    const urls = new Set<string>();
    if (viewData.coverUrl) urls.add(viewData.coverUrl);
    if (viewData.coverUrls) {
      for (const u of viewData.coverUrls) {
        if (u) urls.add(u);
      }
    }
    return Array.from(urls);
  }, [viewData]);

  const [imagesLoaded, setImagesLoaded] = useState(false);
  const [skeletonExited, setSkeletonExited] = useState(false);

  useEffect(() => {
    if (isLoading || !viewData) {
      setImagesLoaded(false);
      setSkeletonExited(false);
      return;
    }
    if (urlsToPreload.length === 0) {
      setImagesLoaded(true);
      return;
    }
    let active = true;
    let settled = false;
    const timer = setTimeout(() => {
      if (active && !settled) {
        settled = true;
        setImagesLoaded(true);
      }
    }, 150);

    const promises = urlsToPreload.map(
      (url) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.src = url;
          if (img.complete) {
            resolve();
            return;
          }
          img.onload = () => resolve();
          img.onerror = () => resolve();
        }),
    );

    Promise.all(promises).then(() => {
      if (active && !settled) {
        settled = true;
        clearTimeout(timer);
        setImagesLoaded(true);
      }
    });

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [isLoading, viewData, urlsToPreload]);

  const isReady = !isLoading && !!viewData && imagesLoaded;

  useEffect(() => {
    if (isReady && !skeletonExited) {
      const timer = setTimeout(() => {
        setSkeletonExited(true);
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [isReady, skeletonExited]);

  if (!isLoading && !viewData) {
    return (
      <div className="h-full w-full bg-transparent flex items-center justify-center">
        <span className="text-text-secondary">
          {isLikesMode
            ? t("playlist.likes_empty")
            : t("playlist.not_found")}
        </span>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-transparent">

      <div className="absolute top-0 left-0 right-0 h-[56px] z-10 flex flex-row items-stretch select-none pointer-events-none">
        <div
          data-window-drag
          onContextMenu={(e) => e.preventDefault()}
          className="w-[328px] shrink-0 h-full pointer-events-auto"
        />
        <div
          data-window-drag
          onContextMenu={(e) => e.preventDefault()}
          onWheel={handleTopWheel}
          className="flex-1 min-w-0 h-full pointer-events-auto"
        />
      </div>
      <input
        ref={coverInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file || !decodedId) return;
          try {
            setPlaylistCover(decodedId, await imageFileToCover(file));
          } catch {
            toast(t("playlist.cover_failed") || "Could not use this image", "error");
          }
        }}
      />
      <button
        type="button"
        onClick={handleBack}
        aria-label={t("common.back")}
        data-no-tooltip="true"
        data-no-window-drag
        className={`absolute top-[12px] left-[32px] z-20 group inline-flex h-[32px] shrink-0 items-center gap-[6px] rounded-md px-[10px] active:scale-[0.94] transition-all cursor-pointer select-none pointer-events-auto text-[13px] font-[500] border-0 !border-none ${
          hasCustomBg
            ? "apple-glass-pill !border-none"
            : "bg-bg-panel/85 backdrop-blur-xl text-text-primary hover:bg-bg-panel border-0 !border-none"
        }`}
        style={{ fontFamily: "var(--font-inter), sans-serif" }}
      >
        <ArrowLeftLine
          size={16}
          className="transition-transform duration-150 group-hover:-translate-x-0.5"
        />
        <span className="relative -left-[1.5px] top-[1px]">{t("common.back")}</span>
      </button>
      {/* track search sits centred in the page header */}
      {viewData && isReady && (
        <div
          className={
            isMobile
              ? // phones: under the Back button, full width, so it never covers it
                "absolute top-[52px] left-[12px] right-[12px] z-20 flex justify-center pointer-events-none"
              : "absolute top-[12px] left-0 right-0 z-20 flex justify-center pointer-events-none"
          }
        >
          <TrackSearchField
            className={isMobile ? "!w-full !h-[38px]" : ""}
            search={search}
            totalCount={currentTracks.length}
            placeholder={t("track_search.placeholder_playlist")}
            glass={hasCustomBg}
            onSubmit={handleSearchSubmit}
          />
        </div>
      )}
      <div className="relative z-1 grid grid-cols-1 w-full h-full min-h-0 overflow-hidden">
        {viewData && (
          <div
            className={`col-start-1 row-start-1 w-full h-full min-h-0 overflow-hidden transition-opacity duration-200 ease-out ${
              isReady ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}
          >
            <div
              ref={isMobile ? scrollRef : undefined}
              data-page-scroller={isMobile ? "with-back" : undefined}
              className={
                isMobile
                  ? "relative z-10 flex flex-col gap-[4px] px-[14px] h-full w-full min-h-0 overflow-y-auto overflow-x-hidden box-border"
                  : "relative z-10 flex flex-row items-stretch gap-[16px] pl-[32px] pr-[16px] h-full w-full min-h-0 box-border"
              }
            >
              <div
                className={isMobile ? "shrink-0 w-full max-w-[320px] self-center pt-[56px] pb-[8px]" : "shrink-0 w-[280px] self-start pt-[56px] pb-[24px]"}
                data-no-window-drag
              >
                <EntitySidebar
                coverClassName={
                  hasCustomBg && (viewData.coverUrls?.length ?? (viewData.coverUrl ? 1 : 0)) === 0
                    ? "apple-glass-static pointer-events-none"
                    : undefined
                }
                cover={(() => {
                    const customCover = getPlaylistCover(isLikesMode ? null : decodedId);
                    const urls = customCover
                      ? [customCover]
                      : viewData.coverUrls ??
                        (viewData.coverUrl ? [viewData.coverUrl] : []);
                    if (urls.length === 0) {
                      return isLikesMode ? (
                        <LikedCover />
                      ) : (
                        <PlaylistFill size={48} className={hasCustomBg ? "text-white" : "text-border-alpha-33"} />
                      );
                    }
                    if (urls.length === 1) {
                      return (
                        <CoverImage
                          src={urls[0]}
                          alt={viewData.title}
                          fill
                          sizes="280px"
                          className="object-cover"
                          draggable={false}
                          unoptimized
                        />
                      );
                    }
                    const cells = urls.slice(0, 4);
                    return (
                      <div className="absolute inset-0 grid grid-cols-2 gap-[1.5px] bg-border-alpha-8">
                        {cells.map((url, i) => {
                          const spanFull = cells.length === 3 && i === 0;
                          return (
                            <div
                              key={i}
                              className={`relative overflow-hidden${spanFull ? " row-span-2" : ""}`}
                            >
                              <CoverImage
                                src={url}
                                alt={`${viewData.title} cover ${i + 1}`}
                                fill
                                sizes="140px"
                                className="object-cover"
                                draggable={false}
                                unoptimized
                              />
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                title={
                  <h1
                    ref={titleRef}
                    className={`${SIDEBAR_TITLE_CLASS} ${
                      isLikesMode
                        ? ""
                        : "cursor-text outline-none transition-colors"
                    } ${isEditingTitle ? "bg-border-alpha-14 rounded-[4px] -ml-[4px] px-[4px]" : ""}`}
                      contentEditable={isLikesMode ? false : isEditingTitle}
                      suppressContentEditableWarning
                      onBlur={(e) => {
                        if (!isEditingTitle) return;
                        const title = e.currentTarget.textContent?.trim();
                        if (title && decodedId && title !== viewData.title) {
                          void api
                            .updatePlaylist(decodedId, { title })
                            .then(() =>
                              window.dispatchEvent(new Event("library:changed")),
                            );
                        }
                        setIsEditingTitle(false);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          e.currentTarget.blur();
                        }
                        if (e.key === "Escape") {
                          e.currentTarget.textContent = viewData.title;
                          e.currentTarget.blur();
                          setIsEditingTitle(false);
                        }
                      }}
                      onClick={() => {
                        if (!isLikesMode) setIsEditingTitle(true);
                      }}
                    >
                      {viewData.title}
                    </h1>
                  }
                  subtitle={
                    isLikesMode ? undefined : viewData.bio || isEditingDescription ? (
                      <p
                        ref={descriptionRef}
                        className={`${SIDEBAR_SUBTITLE_CLASS} cursor-text outline-none transition-colors empty:min-h-[21px] ${
                          isEditingDescription ? "bg-border-alpha-14 rounded-[4px] -ml-[4px] px-[4px]" : ""
                        }`}
                        contentEditable={isEditingDescription}
                        suppressContentEditableWarning
                        onBlur={(e) => {
                          if (!isEditingDescription) return;
                          const next = e.currentTarget.textContent?.trim() ?? "";
                          if (decodedId && next !== viewData.bio) {
                            void api
                              // keep the synced cover marker behind the edited text
                              .updatePlaylist(decodedId, { description: withCoverMarker(next, readCoverMarker(playlistDetail?.description)) })
                              .then(() =>
                                window.dispatchEvent(new Event("library:changed")),
                              );
                          }
                          setIsEditingDescription(false);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            e.currentTarget.blur();
                          }
                          if (e.key === "Escape") {
                            e.currentTarget.textContent = viewData.bio;
                            e.currentTarget.blur();
                            setIsEditingDescription(false);
                          }
                        }}
                        onClick={() => setIsEditingDescription(true)}
                      >
                        {viewData.bio}
                      </p>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setIsEditingDescription(true)}
                        className="cursor-pointer border-0 bg-transparent p-0 text-left text-[13px] font-[400] text-text-tertiary transition-colors hover:text-text-primary"
                        style={{ fontFamily: "var(--font-inter), sans-serif" }}
                      >
                        {t("common.add_description")}
                      </button>
                    )
                  }
                  meta={
                    <div className="flex items-center flex-wrap gap-[6px]">
                      {importMeta?.source === "spotify" && (
                        <button
                          type="button"
                          onClick={() => window.open(importMeta.sourceUrl, "_blank", "noopener,noreferrer")}
                          title={t("playlist.open_source") || "Open original"}
                          className={`inline-flex h-[26px] items-center gap-[6px] rounded-md px-[8px] text-[12px] font-[400] select-none cursor-pointer transition-colors ${
                            hasCustomBg
                              ? "apple-glass-pill"
                              : "bg-bg-panel border border-border-primary/40 text-text-tertiary hover:text-text-primary"
                          }`}
                        >
                          <FaSpotify size={12} className="shrink-0" />
                          <span>{importMeta.owner ? `Spotify · ${importMeta.owner}` : "Spotify"}</span>
                        </button>
                      )}
                      <div
                        className={`inline-flex h-[26px] items-center gap-[6px] rounded-md px-[8px] text-[12px] font-[400] select-none ${
                          hasCustomBg
                            ? "apple-glass-pill"
                            : "bg-bg-panel border border-border-primary/40 text-text-tertiary"
                        }`}
                      >
                        <MusicLine size={13} className={hasCustomBg ? "text-white shrink-0" : "text-text-tertiary shrink-0"} />
                        <span>{viewData.countLabel}</span>
                        <span
                          className={`w-[3px] h-[3px] rounded-full shrink-0 ${hasCustomBg ? "bg-white/50" : "bg-text-tertiary/40"}`}
                          aria-hidden
                        />
                        <span>
                          {(() => {
                            const totalMs = viewData.tracks.reduce(
                              (acc, t) => acc + (t.durationMs || 0),
                              0,
                            );
                            const totalMins = Math.floor(totalMs / 60000);
                            if (totalMins > 60) {
                              return `${Math.floor(totalMins / 60)} ${t("playlist.hr")} ${totalMins % 60} ${t("playlist.min")}`;
                            }
                            const totalSecs = Math.floor((totalMs % 60000) / 1000);
                            return `${totalMins} ${t("playlist.min")} ${totalSecs} ${t("playlist.sec")}`;
                          })()}
                        </span>
                      </div>
                    </div>
                  }
                  primaryAction={
                    <div className="flex flex-col gap-[8px] w-full">
                      <Button
                        variant={hasCustomBg ? "glass-primary" : "primary"}
                        onClick={handlePlayAll}
                        disabled={currentTracks.length === 0}
                        className="!h-[36px] w-full !text-[13.5px] !font-[500] px-[16px] flex items-center justify-center gap-[6px]"
                      >
                        <PlayFill size={16} />
                        <span>{t("common.play_all")}</span>
                      </Button>

                      <div className="flex items-center gap-[8px] w-full">
                        <Button
                          variant={hasCustomBg ? "glass-action" : "outline"}
                          onClick={handleAddToQueue}
                          disabled={currentTracks.length === 0}
                          className={`!h-[36px] flex-1 min-w-0 !text-[13px] !font-[500] px-[12px] flex items-center justify-center gap-[6px] ${
                            // optical centring: with three icon buttons beside it the label reads 1px right
                            !isLikesMode ? "[&>*]:-translate-x-px" : ""
                          }`}
                          title={t("common.add_to_queue")}
                        >
                          <AnimatePresence mode="wait">
                            {addedToQueue ? (
                              <motion.span
                                key="check"
                                initial={{ opacity: 0, scale: 0.5 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.5 }}
                                transition={{ duration: 0.08 }}
                                className="flex items-center justify-center text-emerald-400 shrink-0"
                              >
                                <CheckLine size={16} />
                              </motion.span>
                            ) : (
                              <motion.span
                                key="add"
                                initial={{ opacity: 0, scale: 0.5 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.5 }}
                                transition={{ duration: 0.08 }}
                                className="flex items-center justify-center shrink-0"
                              >
                                <AddLine size={16} />
                              </motion.span>
                            )}
                          </AnimatePresence>
                          <span className="truncate">{t("common.add_to_queue")}</span>
                        </Button>

                        <Button
                          variant={hasCustomBg ? "glass-action" : "outline"}
                          onClick={handleShufflePlay}
                          disabled={currentTracks.length === 0}
                          className="!h-[36px] !w-[36px] shrink-0 !p-0 flex items-center justify-center text-text-primary"
                          title={t("common.shuffle")}
                        >
                          <LuShuffle size={16} />
                        </Button>

                        <Button
                          variant={hasCustomBg ? "glass-action" : "outline"}
                          onClick={search.toggle}
                          // keep focus in the field so its blur-to-close doesn't fire first
                          onMouseDown={(e) => {
                            if (search.isOpen) e.preventDefault();
                          }}
                          disabled={currentTracks.length === 0}
                          className="!h-[36px] !w-[36px] shrink-0 !p-0 flex items-center justify-center text-text-primary"
                          title={searchButtonLabel}
                        >
                          <Search2Line size={16} />
                        </Button>

                        {!isLikesMode && (
                          <DropdownMenu
                            trigger={
                              <Button
                                variant={hasCustomBg ? "glass-action" : "outline"}
                                className="!h-[36px] !w-[36px] shrink-0 !p-0 flex items-center justify-center text-text-primary"
                                title={t("common.more")}
                              >
                                <More2Line size={18} />
                              </Button>
                            }
                            items={[
                              {
                                id: "rename",
                                icon: <LuPencil size={15} />,
                                label: t("common.rename"),
                                onClick: () => setIsEditingTitle(true),
                              },
                              {
                                id: "edit-description",
                                icon: <LuText size={15} />,
                                label: t("common.edit_description"),
                                onClick: () => setIsEditingDescription(true),
                              },
                              ...(importMeta?.sourceUrl
                                ? [
                                    {
                                      id: "open-source",
                                      icon: <LuExternalLink size={15} />,
                                      label: t("playlist.open_source") || "Open original",
                                      onClick: () => window.open(importMeta.sourceUrl, "_blank", "noopener,noreferrer"),
                                    },
                                  ]
                                : []),
                              {
                                id: "cover",
                                icon: <PicLine size={15} />,
                                label: t("playlist.change_cover") || "Change cover",
                                onClick: () => coverInputRef.current?.click(),
                              },
                              ...(hasCustomPlaylistCover(decodedId)
                                ? [
                                    {
                                      id: "cover-reset",
                                      icon: <PicLine size={15} />,
                                      label: t("playlist.reset_cover") || "Reset cover",
                                      onClick: () => decodedId && setPlaylistCover(decodedId, null),
                                    },
                                  ]
                                : []),
                              {
                                id: "delete",
                                icon: <LuTrash2 size={15} />,
                                label: t("common.delete"),
                                danger: true,
                                onClick: () => {
                                  if (!decodedId) return;
                                  useModalStore.getState().openRemoveFromLibrary({
                                    id: decodedId,
                                    title: viewData.title,
                                    coverUrl: viewData.coverUrl,
                                    type: "playlist",
                                    isOwned: true,
                                  });
                                },
                              },
                            ]}
                          />
                        )}
                      </div>
                    </div>
                  }
                />
              </div>

              <div
                ref={isMobile ? undefined : scrollRef}
                data-no-window-drag
                onScroll={() => {
                  if (rafIdRef.current === null) {
                    targetScrollTopRef.current = null;
                  }
                }}
                className={
                  isMobile
                    ? "min-w-0 w-full pb-[24px]"
                    : "min-w-0 flex-1 h-full min-h-0 overflow-y-auto overflow-x-hidden px-[8px] pt-[56px] pb-[24px] overscroll-contain"
                }
                style={{ willChange: "scroll-position" }}
              >
              <ScrollBlurEdge height={60} />
              {isLikesMode && trackTags.available.length > 0 && (
                <div
                  className={`flex gap-[6px] overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden pb-[10px] ${isMobile ? "px-0 pt-[4px]" : "px-[8px]"}`}
                  style={{ fontFamily: "var(--font-inter), sans-serif" }}
                >
                  {[null, ...trackTags.available].map((tag) => {
                    const on = activeTag === tag;
                    return (
                      <button
                        key={tag ?? "all"}
                        type="button"
                        onClick={() => setActiveTag(tag)}
                        className={`shrink-0 inline-flex h-[30px] items-center gap-[6px] rounded-full border-0 px-[13px] text-[13px] font-[500] cursor-pointer transition-colors ${
                          on ? "bg-text-primary text-bg-primary" : "bg-border-alpha-14 text-text-secondary hover:text-text-primary"
                        }`}
                      >
                        {tag ? t(`tags.${tag}`) : t("common.all")}
                        {tag && (
                          <span className={on ? "opacity-60" : "text-text-tertiary"}>
                            {trackTags.counts.get(tag)}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
              {currentTracks.length > 0 && !isMobile && (
                <div className="flex items-center justify-between gap-[12px] px-[8px] pb-[10px]">
                  <span className="text-[13px] text-text-tertiary" style={{ fontFamily: "var(--font-inter), sans-serif" }}>
                    {viewData.countLabel}
                  </span>
                  <SegmentedTabs
                    iconOnly
                    value={trackView}
                    onChange={setTrackView}
                    options={[
                      { id: "list" as const, label: <MenuLine size={16} />, title: t("common.list") || "List" },
                      { id: "grid" as const, label: <GridLine size={16} />, title: t("common.grid") || "Grid" },
                    ]}
                  />
                </div>
              )}
              {currentTracks.length === 0 ? (
                <div className="flex min-h-[50vh] flex-col items-center justify-center gap-[12px] text-center">
                  <PlaylistFill size={40} className="text-border-alpha-33" />
                  <div className="flex flex-col gap-[4px]">
                    <p
                      className="m-0 text-[15px] font-[500] text-text-primary"
                      style={{ fontFamily: "var(--font-inter), sans-serif" }}
                    >
                      {t("playlist.empty_title")}
                    </p>
                    <p
                      className="m-0 text-[13px] text-text-tertiary"
                      style={{ fontFamily: "var(--font-inter), sans-serif" }}
                    >
                      {t("playlist.empty_subtitle")}
                    </p>
                  </div>
                </div>
              ) : search.matches && search.matches.length === 0 ? (
                <TrackSearchEmpty query={search.activeQuery} onClear={() => search.setQuery("")} />
              ) : trackView === "grid" && !isMobile ? (
                <div
                  className="grid gap-x-[16px] gap-y-[18px] px-[8px] pb-[8px]"
                  style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}
                >
                  {visibleTracks.slice(0, gridLimit).map(({ track, index }) => (
                    <TrackGridCard
                      key={track.playlistItemId ?? `${track.id}-${index}`}
                      track={track}
                      coverFallback={viewData.coverUrl}
                      isCurrent={currentTrackId === track.id}
                      playlistId={isLikesMode ? undefined : (decodedId ?? undefined)}
                      playlistTitle={viewData.title}
                      onPlay={() =>
                        track.onlyOnDevice
                          ? toast(t("local.only_on_device_toast", { device: track.onlyOnDevice }), "info", {
                              description: track.title,
                            })
                          : playerEngine.playTrack(
                              track,
                              playableTracks,
                              decodedId && !isLikesMode ? `playlist:${decodedId}` : viewData.title,
                              viewData.coverUrl,
                            )
                      }
                    />
                  ))}
                  {gridLimit < visibleTracks.length && (
                    <div ref={gridSentinelRef} className="col-span-full h-[1px]" aria-hidden />
                  )}
                </div>
              ) : (
              <div
                ref={trackListContainerRef}
                className="relative"
                style={{
                  height: `${rowVirtualizer.getTotalSize()}px`,
                }}
              >
                {isDragging && dropIndex !== null && (
                  <div
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: "64px",
                      transform: `translateY(${dropIndex * 64}px)`,
                      transition: "transform 180ms cubic-bezier(0.2, 0, 0, 1)",
                      pointerEvents: "none",
                      zIndex: 0,
                    }}
                    className="px-0 py-[2px]"
                  >
                    <ReorderDropPlaceholder />
                  </div>
                )}

                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const entry = visibleTracks[virtualRow.index];
                  if (!entry) return null;
                  // original position; equals the row index whenever not filtering
                  const { track, index } = entry;

                  const isThisDragged = isDragging && index === dragIndex;

                  let shiftY = 0;
                  if (isDragging && dragIndex !== null && dropIndex !== null && index !== dragIndex) {
                    if (dragIndex < dropIndex) {
                      if (index > dragIndex && index <= dropIndex) shiftY = -64;
                    } else if (dragIndex > dropIndex) {
                      if (index >= dropIndex && index < dragIndex) shiftY = 64;
                    }
                  }

                  // reordering a filtered view would be ambiguous, so it waits for the full list
                  const canReorder = Boolean(
                    !isLikesMode &&
                      decodedId &&
                      track.playlistItemId &&
                      !isLocalPlaylistItemId(track.playlistItemId) &&
                      !isFiltering,
                  );

                  return (
                    <TrackItem
                      key={
                        track.playlistItemId ?? `${track.id}-${index}`
                      }
                      track={track}
                      isCurrent={currentTrackId === track.id}
                      playlistId={isLikesMode ? undefined : (decodedId ?? undefined)}
                      playlistTitle={viewData.title}
                      playlistCoverUrl={viewData.coverUrl}
                      allTracks={playableTracks}
                      showReorderHandle={canReorder}
                      highlight={search.activeQuery || undefined}
                      onGrabStart={
                        canReorder && !isDragging
                          ? (e) => handleCardGrab(index, track, e)
                          : undefined
                      }
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: `${virtualRow.size}px`,
                        transform: `translateY(${virtualRow.start - listScrollMargin + shiftY}px)`,
                        transition: isDragging
                          ? "transform 180ms cubic-bezier(0.2, 0, 0, 1)"
                          : undefined,
                        opacity: isThisDragged ? 0 : 1,
                        zIndex: 1,
                      }}
                    />
                  );
                })}
              </div>
              )}

              {isDragging && draggedItem && (
                <FloatingDragCard
                  x={pointerPos.x}
                  y={pointerPos.y}
                  offsetX={grabOffset.x}
                  offsetY={grabOffset.y}
                  width={itemWidth}
                >
                  <SongCardWithMenu
                    id={draggedItem.id}
                    title={draggedItem.title}
                    artists={draggedItem.artists}
                    artistId={draggedItem.artistId}
                    artistList={draggedItem.artistList}
                    coverUrl={draggedItem.coverUrl || viewData.coverUrl}
                    playlistId={isLikesMode ? undefined : (decodedId ?? undefined)}
                    playlistItemId={draggedItem.playlistItemId}
                    playlistTitle={viewData.title}
                    duration={
                      draggedItem.durationMs
                        ? `${Math.floor(draggedItem.durationMs / 60000)}:${String(
                            Math.floor((draggedItem.durationMs % 60000) / 1000),
                          ).padStart(2, "0")}`
                        : undefined
                    }
                    durationMs={draggedItem.durationMs}
                    explicit={draggedItem.explicit}
                    className="bg-transparent"
                  />
                </FloatingDragCard>
              )}
              </div>
              </div>
            </div>
        )}

        {!skeletonExited && (
          <div
            className={`col-start-1 row-start-1 w-full h-full z-10 transition-opacity duration-200 ease-out overflow-hidden pointer-events-none ${
              isReady ? "opacity-0" : "opacity-100"
            }`}
            onTransitionEnd={() => setSkeletonExited(true)}
          >
            <PlaylistPageSkeleton />
          </div>
        )}
      </div>
    </div>
  );
}

export default function LibraryPlaylistPage() {
  return (
    <Suspense fallback={<PlaylistPageSkeleton />}>
      <LibraryPlaylistContent />
    </Suspense>
  );
}
