import ShareButton from "@/shared/ui/ShareButton";
import { SwipeToQueue } from "@/shared/ui/SwipeToDelete";
import { useIsMobile } from "@/shared/hooks/useIsMobile";
import { useSearchParams } from "react-router-dom";
import ScrollBlurEdge from "@/shared/ui/ScrollBlurEdge";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, memo, Suspense } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import PlaylistPageSkeleton from "./PlaylistPageSkeleton";
import { useToast, ReorderDropPlaceholder, FloatingDragCard, EntitySidebar, SIDEBAR_TITLE_CLASS, SIDEBAR_SUBTITLE_CLASS } from "@/shared/ui";
import {
  AddLine,
  PlayFill,
  HeartFill,
  PlaylistFill,
  PlaylistLine,
  CheckLine,
  PicLine,
  GridLine,
  MenuLine,
} from "@mingcute/react";
import { AnimatePresence, motion } from "framer-motion";
import { LuPencil, LuTrash2, LuText, LuShuffle, LuExternalLink } from "react-icons/lu";
import { FaSpotify } from "react-icons/fa";
import DropdownMenu from "@/shared/ui/DropdownMenu";
import { useLongPress } from "@/shared/hooks/useLongPress";
import SegmentedTabs from "@/shared/ui/SegmentedTabs";
import TrackGridCard from "@/features/player/ui/TrackGridCard";
import { getImportedPlaylistMeta } from "../services/import/importedPlaylistMeta";
import { addYandexPlaylistToLikes } from "../services/import/sources/yandexMusic/yandexMusicImport";
import { canSyncCoverMarker, readCoverMarker, readPlaylistSource, stripCoverMarker, withCoverMarker, withDescriptionText } from "../services/playlistCoverMarker";
import { getCustomPlaylistCover, getPlaylistCover, hasCustomPlaylistCover, imageFileToCover, setPlaylistCover } from "../services/playlistCovers";
import { diag } from "@/shared/platform/diag";
import Button from "@/shared/ui/Button";
import SongCardWithMenu from "@/features/player/ui/SongCardWithMenu";
import CoverImage from "@/features/covers/ui/CoverImage";
import { useModalStore } from "../store/modalStore";
import {
  usePlaylist,
  useLikedTracksProgressively,
  useReorderPlaylistTracks,
} from "../hooks";
import { useListReorder } from "@/shared/hooks";
import { playerEngine, usePlayerStore } from "@/features/player";
import type { Track } from "@/shared/types";
import { useTranslation } from "@/languages";
import { api } from "@/shared/api";
import type { Track as TrackSnapshot } from "@/shared/contracts";
import { useIsContentTransparent } from "@/features/settings/store/customizationStore";
import { useLocalTracks } from "@/features/local/hooks/useLocalTracks";
import { isLocalPlaylistItemId, withLocalAvailability } from "@/features/local/localPlaylistTracks";
import { TRACK_TAGS, useTrackTags, type TrackTag } from "../services/trackTags";
import LikedCover from "./LikedCover";
import {
  useTrackSearch,
  TrackSearchButton,
  TrackSearchField,
  TrackSearchEmpty,
} from "./TrackSearch";

interface TrackItemProps {
  track: Track;
  playlistId?: string;
  playlistTitle: string;
  playbackContext: string;
  playlistCoverUrl: string;
  allTracks: Track[];
  style?: React.CSSProperties;
  showReorderHandle?: boolean;
  hideMenuTrigger?: boolean;
  onGrabStart?: (e: React.PointerEvent<HTMLDivElement>) => void;
  highlight?: string;
  isCurrent?: boolean;
  showLikedDate?: boolean;
  showLikedDateInMenu?: boolean;
  onSelectTrack?: (id: string) => void;
}

function YandexPlaylistLikesButton({ id, disabled }: { id: string; disabled: boolean }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const addToLikes = async () => {
    setBusy(true);
    try {
      const { added, failed } = await addYandexPlaylistToLikes(id);
      toast(t("settings.yandex_music.likes_complete", { added, failed }), failed ? "error" : "checkmark");
    } catch {
      toast(t("settings.yandex_music.likes_failed"), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button type="button" variant="secondary" size="sm" disabled={disabled || busy} onClick={() => void addToLikes()}>
      <HeartFill size={15} />
      {busy ? t("settings.yandex_music.progress_saving") : t("settings.yandex_music.add_to_likes")}
    </Button>
  );
}

function albumTitleOf(track: Track): string {
  const album = (track as { album?: unknown }).album;
  if (typeof album === "string") return album;
  if (album && typeof album === "object" && "title" in album) return String((album as { title?: string }).title ?? "");
  return "";
}

function formatLikedDate(value: Track["likedAt"]): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return undefined;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatLikedDateRelative(value: Track["likedAt"]): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return undefined;
  const seconds = (date.getTime() - Date.now()) / 1000;
  const absolute = Math.abs(seconds);
  const [unit, divisor]: [Intl.RelativeTimeFormatUnit, number] = absolute >= 365 * 86400
    ? ["year", 365 * 86400]
    : absolute >= 30 * 86400
      ? ["month", 30 * 86400]
      : absolute >= 7 * 86400
        ? ["week", 7 * 86400]
        : absolute >= 86400
          ? ["day", 86400]
          : absolute >= 3600
            ? ["hour", 3600]
            : absolute >= 60
              ? ["minute", 60]
              : ["second", 1];
  return new Intl.RelativeTimeFormat(navigator.language, { numeric: "auto" }).format(Math.round(seconds / divisor), unit);
}

function selectionSnapshot(track: Track): TrackSnapshot {
  return {
    id: track.id,
    title: track.title,
    artists: track.artistList?.map(({ id, name }) => ({ id: id ?? "", name }))
      ?? [{ id: track.artistId ?? "", name: track.artists }],
    durationMs: track.durationMs,
    ...(track.coverUrl ? { cover: { url: track.coverUrl, width: 480, height: 480 } } : {}),
    ...(track.album ? { album: track.album } : {}),
    ...(track.explicit !== undefined ? { explicit: track.explicit } : {}),
  };
}

const TrackItem = memo(function TrackItem({
  track,
  playlistId,
  playlistTitle,
  playbackContext,
  playlistCoverUrl,
  allTracks,
  style,
  showReorderHandle,
  hideMenuTrigger,
  onGrabStart,
  highlight,
  isCurrent,
  showLikedDate,
  showLikedDateInMenu,
  onSelectTrack,
}: TrackItemProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const { style: holdStyle, onTouchStart, onContextMenuCapture, ...hold } = useLongPress(
    () => onSelectTrack?.(track.id),
    Boolean(onSelectTrack),
  );
  const handlePlay = useCallback(() => {
    if (typeof window !== "undefined" && window.__linerWasDragging) return;
    if (track.onlyOnDevice) {
      toast(t("local.only_on_device_toast", { device: track.onlyOnDevice }), "info", { description: track.title });
      return;
    }
    playerEngine.playTrack(
      track,
      allTracks,
      playbackContext,
      playlistCoverUrl,
    );
  }, [track, allTracks, playbackContext, playlistCoverUrl, toast, t]);

  const addToQueue = useCallback(() => {
    if (track.onlyOnDevice) return;
    playerEngine.addToQueue(track);
    toast(t("common.added_to_queue"), "checkmark", {
      description: track.artists ? `${track.title} — ${track.artists}` : track.title,
    });
  }, [track, toast, t]);

  const card = (
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
        showLikeButton={Boolean(playlistId) && !hideMenuTrigger}
        hideMenuTrigger={hideMenuTrigger}
        showReorderHandle={showReorderHandle}
        onGrabStart={onGrabStart}
        highlight={highlight}
        isCurrent={isCurrent}
        albumTitle={albumTitleOf(track)}
        addedDate={showLikedDate ? formatLikedDate(track.likedAt) : undefined}
        addedDateTooltip={showLikedDate ? formatLikedDateRelative(track.likedAt) : undefined}
        addedDateLabel={showLikedDateInMenu ? formatLikedDate(track.likedAt) : undefined}
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
  );

  return (
    <div
      {...(onSelectTrack ? hold : undefined)}
      style={onSelectTrack ? { ...style, ...holdStyle } : style}
      data-reorder-item
      onTouchStart={onSelectTrack ? (event) => {
        if (!(event.target as Element).closest("button, a, [data-prevent-drag]")) onTouchStart(event);
      } : undefined}
      onContextMenuCapture={onSelectTrack ? (event) => {
        onContextMenuCapture(event);
        if (event.defaultPrevented) event.stopPropagation();
      } : undefined}
    >
      {isMobile && !track.onlyOnDevice ? (
        <SwipeToQueue label={t("common.add_to_queue")} onAddToQueue={addToQueue}>
          {card}
        </SwipeToQueue>
      ) : card}
    </div>
  );
});
function LibraryPlaylistContent() {
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
  const [isPlaylistEditMode, setIsPlaylistEditMode] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const selectionDrag = useRef<{ pointerId: number; index: number; checked: boolean } | null>(null);
  const selectionOpenedByHold = useRef(false);

  const stopSelecting = () => {
    selectionDrag.current = null;
    setSelectedIds(new Set());
    setSelecting(false);
  };
  const [showScrollToolbar, setShowScrollToolbar] = useState(false);
  const trackFiltersRef = useRef<HTMLDivElement>(null);
  const reorderTracks = useReorderPlaylistTracks();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const descriptionRef = useRef<HTMLParagraphElement>(null);

  const {
    data: playlistDetail,
    isLoading: playlistLoading,
    error: playlistError,
  } = usePlaylist(isLikesMode ? null : decodedId);

  const { data: likesData, isLoading: likesLoading } = useLikedTracksProgressively();

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
    setIsPlaylistEditMode(false);
    stopSelecting();
    setShowScrollToolbar(false);
  }, [decodedId]);

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
  const isFiltering = search.matches !== null;
  const visibleTracks = useMemo(
    () => search.matches ?? currentTracks.map((track, index) => ({ track, index })),
    [search.matches, currentTracks],
  );

  const canSelectTracks = useMemo(() => allTracks.some((track) => !track.onlyOnDevice), [allTracks]);
  const selectedTracks = useMemo(() => {
    if (!selectedIds.size) return [];
    return [...new Map(allTracks.filter((track) => selectedIds.has(track.id) && !track.onlyOnDevice).map((track) => [track.id, track])).values()];
  }, [allTracks, selectedIds]);

  const startSelectingTrack = useCallback((id: string) => {
    selectionOpenedByHold.current = true;
    setSelectedIds(new Set([id]));
    setSelecting(true);
  }, []);

  const setSelectionRange = (start: number, end: number, checked: boolean) => {
    const ids = visibleTracks.slice(Math.min(start, end), Math.max(start, end) + 1)
      .filter(({ track }) => !track.onlyOnDevice).map(({ track }) => track.id);
    setSelectedIds((previous) => {
      const next = new Set(previous);
      for (const id of ids) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };

  const moveSelection = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = selectionDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const row = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-selection-index]");
    if (!row || !event.currentTarget.contains(row)) return;
    const index = Number(row.dataset.selectionIndex);
    if (index === drag.index) return;
    setSelectionRange(drag.index, index, drag.checked);
    drag.index = index;
  };

  const endSelectionDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (selectionDrag.current?.pointerId === event.pointerId) selectionDrag.current = null;
  };

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

  const handlePlaylistScroll = useCallback((container: HTMLElement | null) => {
    if (isMobile) return;
    const filters = trackFiltersRef.current;
    // Keep the full playlist controls visible until the filter chips and the
    // track column labels have scrolled away. The compact toolbar then takes
    // over the top edge without sitting on top of the large playlist header.
    const toolbarThreshold = filters
      ? filters.offsetTop + filters.offsetHeight + 38
      : 64;
    setShowScrollToolbar((container?.scrollTop ?? 0) > toolbarThreshold);
    if (rafIdRef.current === null) targetScrollTopRef.current = null;
  }, [isMobile]);

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

  const savePlaylistCover = useCallback(async (playlistId: string, cover: string | null): Promise<boolean> => {
    // User playlists do not have a dedicated cover field in the API. Keep the
    // compact image in their synced description metadata instead.
    setPlaylistCover(playlistId, cover, { notify: false });
    window.dispatchEvent(new Event("library:changed"));
    diag(`[Lane][PlaylistCover] saved locally, syncing ${JSON.stringify({ playlistId, bytes: cover?.length ?? 0 })}`);
    try {
      const detail = await api.getUserPlaylist(playlistId);
      const nextDescription = withCoverMarker(detail.playlist.description, cover ?? undefined);
      if (!canSyncCoverMarker(detail.playlist.description, cover ?? undefined)) {
        diag(`[Lane][PlaylistCover] retained locally; server description is full ${JSON.stringify({ playlistId })}`);
        return true;
      }
      await api.updatePlaylist(playlistId, {
        description: nextDescription,
      });
      diag(`[Lane][PlaylistCover] server sync complete ${JSON.stringify({ playlistId })}`);
      return true;
    } catch (error) {
      diag(`[Lane][PlaylistCover] server sync failed ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }, []);

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

  const canEditOrder = !isLikesMode && Boolean(decodedId) && !isFiltering
    && currentTracks.some((track) => track.playlistItemId && !isLocalPlaylistItemId(track.playlistItemId));
  const startEditingOrder = () => {
    stopSelecting();
    setIsPlaylistEditMode(true);
  };
  const renderTrackEditButton = (size: 34 | 36) => {
    const className = size === 34 ? "!h-[34px] !w-[34px] shrink-0 !p-0" : "!h-[36px] !w-[36px] shrink-0 !p-0";
    if (isPlaylistEditMode) {
      return (
        <Button type="button" variant="outline" className={className} onClick={() => setIsPlaylistEditMode(false)}
          aria-label={t("playlist.save_order")} title={t("playlist.save_order")}>
          <CheckLine size={17} />
        </Button>
      );
    }
    if (!canSelectTracks && !canEditOrder) return null;
    return (
      <DropdownMenu
        align="end"
        trigger={<Button type="button" variant="outline" className={className} aria-label={t("playlist.select_tracks")} title={t("playlist.select_tracks")}><LuPencil size={15} /></Button>}
        items={[
          ...(canSelectTracks ? [{ id: "select-tracks", label: t("playlist.select_tracks"), onClick: () => setSelecting(true) }] : []),
          ...(!isLikesMode ? [{ id: "edit-order", label: t("playlist.edit_order"), disabled: !canEditOrder, onClick: startEditingOrder }] : []),
        ]}
      />
    );
  };

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

  const selectionToolbar = selecting && !isPlaylistEditMode && (
    <div
      className={`absolute z-[25] flex flex-wrap items-center gap-2 rounded-[14px] border border-border-primary bg-bg-overlay p-1.5 shadow-lg backdrop-blur-xl ${isMobile
        ? "inset-x-[14px]"
        : "bottom-3 left-1/2 w-max max-w-[calc(100%-24px)] -translate-x-1/2 justify-center"}`}
      style={isMobile ? { bottom: "calc(var(--lane-dock-h, 58px) + 8px)" } : undefined}
      data-no-window-drag
    >
      <span className={`px-2 text-[13px] tabular-nums text-text-secondary ${isMobile ? "mr-auto" : ""}`}>
        {t("common.tracks", { count: selectedTracks.length })}
      </span>
      <Button type="button" size="sm" variant="outline" onClick={stopSelecting}>{t("common.cancel")}</Button>
      <Button type="button" size="sm" disabled={!selectedTracks.length} onClick={() => {
        useModalStore.getState().openAddSelectionToPlaylist(selectedTracks.map(selectionSnapshot));
      }}>{t("common.add_to_playlist")}</Button>
    </div>
  );

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
      <AnimatePresence>
        {!isMobile && showScrollToolbar && viewData && (
          <motion.div
            key="playlist-scroll-toolbar"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="absolute inset-x-0 top-0 z-20 flex h-[56px] items-center gap-[8px] border-b border-border-primary bg-bg-overlay px-[14px] pr-[116px] shadow-sm backdrop-blur-xl md:pl-[32px] md:pr-[148px]"
            style={{ top: 0, height: 56 }}
            data-no-window-drag
          >
            <div className="relative flex h-[32px] w-[32px] shrink-0 items-center justify-center overflow-hidden rounded-[7px] bg-bg-elevated">
              {isLikesMode ? (
                <LikedCover heartRatio={0.4} />
              ) : viewData.coverUrl ? (
                <CoverImage src={viewData.coverUrl} alt="" fill sizes="32px" className="object-cover" unoptimized />
              ) : (
                <PlaylistFill size={16} className="text-text-secondary" />
              )}
            </div>
            <strong className="min-w-0 max-w-[min(36vw,420px)] truncate text-[15px] font-semibold text-text-primary">{viewData.title}</strong>
            <Button variant="primary" onClick={handlePlayAll} disabled={!currentTracks.length} aria-label={t("common.play_all")} className="!h-[34px] shrink-0 gap-[6px] !px-[10px] !text-[12px] max-sm:!w-[34px] max-sm:!p-0">
              <PlayFill size={15} /><span className="max-sm:hidden">{t("common.play_all")}</span>
            </Button>
            <Button variant="outline" onClick={handleAddToQueue} disabled={!currentTracks.length} aria-label={t("common.add_to_queue")} className="!h-[34px] shrink-0 gap-[5px] !px-[10px] !text-[12px] max-sm:!w-[34px] max-sm:!p-0">
              {addedToQueue ? <CheckLine size={16} /> : <AddLine size={16} />}
              <span className="hidden sm:inline">{t("common.add_to_queue")}</span>
            </Button>
            <Button variant="outline" onClick={handleShufflePlay} disabled={!currentTracks.length} aria-label={t("common.shuffle")} className="!h-[34px] !w-[34px] shrink-0 !p-0"><LuShuffle size={15} /></Button>
            {!isMobile && <SegmentedTabs iconOnly value={trackView} onChange={setTrackView} className="h-[34px] shrink-0" options={[
              { id: "list" as const, label: <MenuLine size={15} />, title: t("common.list") || "List" },
              { id: "grid" as const, label: <GridLine size={15} />, title: t("common.grid") || "Grid" },
            ]} />}
            {renderTrackEditButton(34)}
          </motion.div>
        )}
      </AnimatePresence>
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
            const synced = await savePlaylistCover(decodedId, await imageFileToCover(file));
            if (!synced) {
              diag(`[Lane][PlaylistCover] cover kept locally; retry scheduled`);
            }
          } catch (error) {
            diag(`[Lane][PlaylistCover] cover processing failed ${error instanceof Error ? error.message : String(error)}`);
            toast(t("playlist.cover_failed") || "Could not use this image", "error");
          }
        }}
      />
      <div className="relative z-1 grid grid-cols-1 w-full h-full min-h-0 overflow-hidden">
        {viewData && (
          <div
            className={`col-start-1 row-start-1 w-full h-full min-h-0 overflow-hidden transition-opacity duration-200 ease-out ${
              isReady ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}
          >
            <div
              ref={isMobile ? scrollRef : undefined}
              onScroll={isMobile ? event => handlePlaylistScroll(event.currentTarget) : undefined}
              className={
                isMobile
                  ? "relative z-10 flex flex-col gap-[4px] px-[14px] h-full w-full min-h-0 overflow-y-auto overflow-x-hidden box-border"
                  : "relative z-10 flex flex-col items-stretch px-[16px] h-full w-full min-h-0 box-border"
              }
            >
              <motion.div
                initial={false}
                animate={{
                  // Keep the 56px desktop titlebar lane reserved when the
                  // hero collapses, so the list never slides underneath the
                  // compact toolbar/window controls.
                  height: !isMobile && showScrollToolbar ? 56 : "auto",
                  opacity: !isMobile && showScrollToolbar ? 0 : 1,
                }}
                transition={{ duration: 0.22, ease: "easeInOut" }}
                className="w-full shrink-0 overflow-hidden"
                aria-hidden={!isMobile && showScrollToolbar}
                style={{ pointerEvents: !isMobile && showScrollToolbar ? "none" : "auto" }}
                data-no-window-drag
              >
              <div
                className={isMobile ? "shrink-0 w-full pt-[56px] pb-[8px]" : "w-full shrink-0 pt-[56px] pb-[4px]"}
                data-no-window-drag
              >
                <EntitySidebar
                  layout="hero"
                  stretchMobile
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
                            try {
                              // Keep the old description and cover if the complete edit exceeds the API limit.
                              const nextDescription = withDescriptionText(playlistDetail?.description, next);
                              if (nextDescription.length <= 2_000) {
                                void api.updatePlaylist(decodedId, { description: nextDescription }).then(() => window.dispatchEvent(new Event("library:changed")));
                              } else {
                                toast(t("playlist.cover_failed") || "Description is too long", "error");
                              }
                            } catch {
                              toast(t("playlist.cover_failed") || "Description is too long", "error");
                            }
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
                    <div className={`flex ${isLikesMode ? "flex-col items-start gap-[4px]" : "flex-row flex-wrap items-center gap-[6px]"}`}>
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
                      {decodedId && readPlaylistSource(playlistDetail?.description) === "yandex" && (
                        <YandexPlaylistLikesButton key={decodedId} id={decodedId} disabled={allTracks.length === 0} />
                      )}
                      {isLikesMode && (
                        <div
                          className={`inline-flex h-[26px] items-center rounded-md px-[8px] text-[12px] font-[400] select-none ${
                            hasCustomBg
                              ? "apple-glass-pill"
                              : "bg-bg-panel border border-border-primary/40 text-text-tertiary"
                          }`}
                        >
                          {viewData.tracks.length} {t("playlist.tracks")}
                        </div>
                      )}
                      <div
                        className={`inline-flex h-[26px] items-center gap-[6px] rounded-md px-[8px] text-[12px] font-[400] select-none ${
                          hasCustomBg
                            ? "apple-glass-pill"
                            : "bg-bg-panel border border-border-primary/40 text-text-tertiary"
                        }`}
                      >
                        <span>
                          {(() => {
                            const totalMs = viewData.tracks.reduce(
                              (acc, t) => acc + (t.durationMs || 0),
                              0,
                            );
                            const totalMins = Math.floor(totalMs / 60000);
                            const totalSecs = Math.floor((totalMs % 60000) / 1000);
                            const duration = totalMins > 60
                              ? `${Math.floor(totalMins / 60)} ${t("playlist.hr")} ${totalMins % 60} ${t("playlist.min")}`
                              : `${totalMins} ${t("playlist.min")} ${totalSecs} ${t("playlist.sec")}`;
                            return duration;
                          })()}
                        </span>
                      </div>
                    </div>
                  }
                  primaryAction={
                    <div className="flex w-full max-w-[640px] flex-row items-center gap-[8px] max-md:flex-col max-md:items-stretch">
                      <Button
                        variant={hasCustomBg ? "glass-primary" : "primary"}
                        onClick={handlePlayAll}
                        disabled={currentTracks.length === 0}
                        className="!h-[36px] w-auto shrink-0 !text-[13.5px] !font-[500] px-[20px] flex items-center justify-center gap-[6px] max-md:w-full"
                      >
                        <PlayFill size={16} />
                        <span>{t("common.play_all")}</span>
                      </Button>

                      <div className="flex min-w-0 items-center gap-[8px] max-md:w-full">
                        <Button
                          variant={hasCustomBg ? "glass-action" : "outline"}
                          onClick={handleAddToQueue}
                          disabled={currentTracks.length === 0}
                          className={`!h-[36px] min-w-0 md:flex-none !text-[13px] !font-[500] px-[12px] flex items-center justify-center gap-[6px] max-md:flex-1 ${
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

                        <TrackSearchButton search={search} glass={hasCustomBg} disabled={currentTracks.length === 0} />

                        {!isMobile && currentTracks.length > 0 && (
                          <SegmentedTabs
                            iconOnly
                            value={trackView}
                            onChange={setTrackView}
                            className="shrink-0"
                            options={[
                              { id: "list" as const, label: <MenuLine size={16} />, title: t("common.list") || "List" },
                              { id: "grid" as const, label: <GridLine size={16} />, title: t("common.grid") || "Grid" },
                            ]}
                          />
                        )}

                        {!isMobile && renderTrackEditButton(36)}

                        {!isLikesMode && decodedId && (isMobile && isPlaylistEditMode ? (
                          <Button variant="outline" onClick={() => setIsPlaylistEditMode(false)} aria-label={t("playlist.save_order")} title={t("playlist.save_order")} className="!h-[36px] !w-[36px] shrink-0 !p-0">
                            <CheckLine size={17} />
                          </Button>
                        ) : (
                          <ShareButton menu type="playlist" entityId={decodedId} snapshot={{ title: viewData.title, coverUrl: viewData.coverUrl }} className="!bg-border-alpha-14" extraMenuItems={[
                              ...(isMobile ? [{
                                id: "edit-order",
                                icon: <LuPencil size={15} />,
                                label: t("playlist.edit_order"),
                                disabled: !canEditOrder,
                                onClick: startEditingOrder,
                              }] : []),
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
                                      onClick: () => {
                                        if (!decodedId) return;
                                        void savePlaylistCover(decodedId, null).catch(() =>
                                          toast(t("playlist.cover_failed") || "Could not update this cover", "error"),
                                        );
                                      },
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
                          ]} />
                        ))}
                      </div>
                    </div>
                  }
                />
              </div>

              <div className={search.isOpen ? "w-full shrink-0 py-[8px]" : "shrink-0"}>
                <TrackSearchField search={search} totalCount={currentTracks.length}
                  placeholder={t("track_search.placeholder_playlist")} glass={hasCustomBg}
                  closeOnBlur={false} onSubmit={handleSearchSubmit}
                  className="!h-[44px] !w-full !rounded-[12px] [&_input]:text-[16px]" />
              </div>
              </motion.div>

              <div
                ref={isMobile ? undefined : scrollRef}
                data-no-window-drag
                onScroll={() => {
                  handlePlaylistScroll(scrollRef.current);
                }}
                className={`relative isolate ${
                  isMobile
                    ? `min-w-0 w-full flex-none rounded-[14px] px-[8px] pt-[16px] ${currentTracks.length > 0 && !isLikesMode ? "bg-black/[0.03] dark:bg-white/[0.04] backdrop-blur-xl" : "bg-transparent"}`
                    : `min-w-0 w-full flex-1 h-full min-h-0 overflow-y-auto overflow-x-hidden rounded-t-[14px] px-[8px] pt-[16px] pb-[24px] overscroll-contain ${currentTracks.length > 0 ? "bg-black/[0.03] dark:bg-white/[0.04] backdrop-blur-xl" : "bg-transparent"}`
                }`}
                style={{
                  willChange: "scroll-position",
                  marginTop: isMobile ? undefined : 8,
                  paddingBottom:
                    isMobile
                      ? `calc(var(--lane-dock-h, 120px) + ${selectionToolbar ? 104 : 48}px)`
                      : selectionToolbar ? 80 : 24,
                }}
              >
              {isMobile && isLikesMode && currentTracks.length > 0 && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 top-0 z-0 rounded-[14px] bg-black/[0.03] dark:bg-white/[0.04] backdrop-blur-xl"
                  style={{ bottom: "calc(var(--lane-dock-h, 120px) + 48px)" }}
                />
              )}
              <div className="relative z-[1]">
              <ScrollBlurEdge height={60} />
              {isLikesMode && allTracks.length > 0 && (
                <div
                  ref={trackFiltersRef}
                  className={`flex flex-nowrap snap-x snap-mandatory scroll-px-[8px] gap-[6px] overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden px-[8px] pt-[8px] ${isMobile ? "pb-[16px]" : "pb-[12px]"}`}
                  style={{ fontFamily: "var(--font-inter), sans-serif" }}
                >
                  {[null, ...TRACK_TAGS].map((tag) => {
                    const on = activeTag === tag;
                    const count = tag ? (trackTags.counts.get(tag) ?? 0) : allTracks.length;
                    return (
                      <button
                        key={tag ?? "all"}
                        type="button"
                        onClick={() => setActiveTag(tag)}
                        disabled={Boolean(tag && count === 0)}
                        aria-pressed={on}
                        className={`shrink-0 snap-start inline-flex h-[30px] items-center gap-[6px] rounded-[10px] border-0 px-[13px] text-[13px] font-[500] transition-colors duration-150 ${
                          on
                            ? "bg-text-primary text-bg-primary cursor-pointer"
                            : count === 0 && tag
                              ? "bg-border-alpha-14 text-text-tertiary opacity-55 cursor-not-allowed"
                              : "bg-border-alpha-14 text-text-secondary hover:bg-border-alpha-22 hover:text-text-primary cursor-pointer"
                        }`}
                      >
                        {tag ? t(`tags.${tag}`) : t("common.all")}
                        {tag && (
                          <span className={on ? "opacity-60" : "text-text-tertiary"}>
                            {count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
              {isLikesMode && !selecting && !isMobile && trackView === "list" && currentTracks.length > 0 && (
                <div
                  className="grid h-[38px] items-center px-[8px] text-[12px] text-text-tertiary md:grid-cols-[minmax(0,1fr)_minmax(120px,30%)_140px_76px]"
                  style={{ fontFamily: "var(--font-inter), sans-serif" }}
                >
                  <span className="min-w-0 pl-[72px]">{t("playlist.col_title") || "Title"}</span>
                  <span className="hidden min-w-0 pl-[16px] md:block">{t("playlist.col_album") || "Album"}</span>
                  <span className="hidden min-w-0 pl-[16px] md:block">{t("playlist.col_date_added") || "Date added"}</span>
                  <span aria-hidden="true" />
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
              ) : trackView === "grid" && !isMobile && !selecting && !isPlaylistEditMode ? (
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
                      showLikeButton={!isLikesMode}
                      onPlay={() =>
                        track.onlyOnDevice
                          ? toast(t("local.only_on_device_toast", { device: track.onlyOnDevice }), "info", {
                              description: track.title,
                            })
                          : playerEngine.playTrack(
                              track,
                              playableTracks,
                              decodedId ? `playlist:${decodedId}` : viewData.title,
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
                onTouchStartCapture={() => { selectionOpenedByHold.current = false; }}
                onClickCapture={(event) => {
                  if (!selectionOpenedByHold.current || event.detail === 0) return;
                  selectionOpenedByHold.current = false;
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onPointerMove={selecting ? moveSelection : undefined}
                onPointerUp={selecting ? endSelectionDrag : undefined}
                onPointerCancel={selecting ? endSelectionDrag : undefined}
                onLostPointerCapture={selecting ? endSelectionDrag : undefined}
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

                  if (selecting) {
                    const row = virtualRow.index;
                    const checked = selectedIds.has(track.id);
                    const disabled = Boolean(track.onlyOnDevice);
                    return (
                      <button
                        key={virtualRow.key}
                        type="button"
                        disabled={disabled}
                        aria-pressed={checked}
                        data-selection-index={row}
                        className="absolute left-0 top-0 flex w-full items-center gap-3 rounded-xl border-0 bg-transparent px-1 text-left text-text-primary hover:bg-border-alpha-14 disabled:opacity-45"
                        style={{ height: virtualRow.size, transform: `translateY(${virtualRow.start - listScrollMargin}px)` }}
                        onClick={(event) => {
                          if (event.detail !== 0 && (event.target as Element).closest("[data-selection-handle]")) return;
                          setSelectionRange(row, row, !checked);
                        }}
                      >
                        <span
                          data-selection-handle
                          className="grid h-full w-11 shrink-0 touch-none place-items-center"
                          onPointerDown={(event) => {
                            if (disabled || !event.isPrimary || event.button !== 0) return;
                            event.currentTarget.setPointerCapture(event.pointerId);
                            selectionDrag.current = { pointerId: event.pointerId, index: row, checked: !checked };
                            setSelectionRange(row, row, !checked);
                          }}
                        >
                          <span aria-hidden="true" className={`grid size-5 place-items-center rounded-md border ${checked ? "border-text-primary bg-text-primary text-bg-primary" : "border-text-tertiary"}`}>
                            {checked && <CheckLine size={15} />}
                          </span>
                        </span>
                        <span className="relative size-10 shrink-0 overflow-hidden rounded-md bg-bg-elevated">
                          <CoverImage src={track.coverUrl || viewData.coverUrl} alt="" fill sizes="40px" placeholder="empty" className="object-cover" />
                        </span>
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate text-[14px]">{track.title}</span>
                          <span className="truncate text-[13px] text-text-secondary">{track.artists}</span>
                        </span>
                      </button>
                    );
                  }

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
                      playbackContext={decodedId ? `playlist:${decodedId}` : viewData.title}
                      showLikedDate={isLikesMode}
                      showLikedDateInMenu={isLikesMode && isMobile}
                      playlistCoverUrl={viewData.coverUrl}
                      allTracks={playableTracks}
                      onSelectTrack={isMobile && !isPlaylistEditMode && !track.onlyOnDevice ? startSelectingTrack : undefined}
                      showReorderHandle={canReorder && isPlaylistEditMode}
                      hideMenuTrigger={isPlaylistEditMode}
                      highlight={search.activeQuery || undefined}
                      onGrabStart={
                        canReorder && isPlaylistEditMode && !isDragging
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
      {selectionToolbar}
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
