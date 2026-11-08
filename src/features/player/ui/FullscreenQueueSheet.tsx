import { useCallback, useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useShallow } from "zustand/react/shallow";
import { usePlayerStore } from "../store/playerStore";
import { playerEngine } from "../engine/playerEngine";
import SongCard from "./SongCard";
import { useTranslation } from "@/languages";
import { useListReorder } from "@/shared/hooks";
import { FloatingDragCard, ReorderDropPlaceholder } from "@/shared/ui";
import type { Track } from "@/shared/types";

const QUEUE_ROW_HEIGHT = 68;

export default function FullscreenQueueSheet() {
  const { t } = useTranslation();
  const player = usePlayerStore(useShallow(state => ({
    queue: state.queue,
    currentIndex: state.currentIndex,
    currentTrack: state.currentTrack,
    playbackContext: state.playbackContext,
    playbackContextCover: state.playbackContextCover,
  })));
  const scrollRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const nextStart = Math.max(0, player.currentIndex + 1);
  const upcoming = useMemo(() => player.queue.slice(nextStart), [player.queue, nextStart]);
  const virtualizer = useVirtualizer({
    count: upcoming.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => QUEUE_ROW_HEIGHT,
    overscan: 5,
  });
  const nowPlaying = player.queue[player.currentIndex] ?? player.currentTrack;
  const handleReorder = useCallback((fromIndex: number, toIndex: number) => {
    playerEngine.reorderQueue(nextStart + fromIndex, nextStart + toIndex);
  }, [nextStart]);
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
    items: upcoming,
    scrollContainerRef: scrollRef,
    listContainerRef: listRef,
    itemHeight: QUEUE_ROW_HEIGHT,
    onReorder: handleReorder,
    edgeThreshold: QUEUE_ROW_HEIGHT,
    maxScrollSpeed: 16,
  });

  return (
    <div className="flex min-h-0 flex-col gap-[14px] text-text-primary" onClick={event => event.stopPropagation()}>
      <div className="flex items-center gap-3">
        <h2 className="m-0 text-[16px] font-semibold">{t("player.queue")}</h2>
      </div>

      {nowPlaying && (
        <section className="min-w-0">
          <h3 className="mb-[7px] mt-0 px-[2px] text-[12px] font-semibold text-text-secondary">{t("player.now_playing")}</h3>
          <SongCard
            id={nowPlaying.id}
            title={nowPlaying.title}
            artists={nowPlaying.artists}
            artistId={nowPlaying.artistId}
            artistList={nowPlaying.artistList}
            explicit={nowPlaying.explicit}
            compact
            coverUrl={nowPlaying.coverUrl ?? ""}
            className="select-none rounded-[12px] bg-white/[0.07] p-[8px]"
            imageShape="square"
            isCurrent
            onContextMenu={event => { event.preventDefault(); event.stopPropagation(); }}
          />
        </section>
      )}

      <section className="flex min-h-0 flex-col">
        <h3 className="mb-[7px] mt-0 flex items-center justify-between px-[2px] text-[12px] font-semibold text-text-secondary">
          <span>{t("player.next_in_queue")}</span>
          {upcoming.length > 0 && <span className="font-normal tabular-nums text-text-tertiary">{upcoming.length}</span>}
        </h3>
        {upcoming.length === 0 ? (
          <p className="m-0 rounded-[12px] bg-white/[0.04] px-[12px] py-[14px] text-[13px] text-text-tertiary">{t("player.queue_empty")}</p>
        ) : (
          <div ref={scrollRef} className="max-h-[min(52dvh,520px)] min-h-[80px] overflow-y-auto overscroll-contain pr-[2px]">
            <div ref={listRef} className="relative w-full" style={{ height: virtualizer.getTotalSize(), willChange: isDragging ? "transform" : undefined }}>
              {isDragging && dropIndex !== null && (
                <div className="pointer-events-none absolute left-0 z-0 w-full" style={{ top: dropIndex * QUEUE_ROW_HEIGHT, height: QUEUE_ROW_HEIGHT }}>
                  <ReorderDropPlaceholder />
                </div>
              )}
              {virtualizer.getVirtualItems().map(row => {
                const item = upcoming[row.index];
                const queueIndex = nextStart + row.index;
                const isDragged = isDragging && row.index === dragIndex;
                let shiftY = 0;
                if (isDragging && dragIndex !== null && dropIndex !== null && row.index !== dragIndex) {
                  if (dragIndex < dropIndex && row.index > dragIndex && row.index <= dropIndex) shiftY = -QUEUE_ROW_HEIGHT;
                  else if (dragIndex > dropIndex && row.index >= dropIndex && row.index < dragIndex) shiftY = QUEUE_ROW_HEIGHT;
                }
                return (
                  <div
                    key={item.id}
                    data-index={row.index}
                    ref={virtualizer.measureElement}
                    className="absolute left-0 top-0 z-[1] w-full py-[2px]"
                    style={{
                      height: row.size,
                      transform: `translate3d(0, ${row.start + shiftY}px, 0)`,
                      transition: isDragging ? "transform 180ms cubic-bezier(0.2, 0, 0, 1)" : undefined,
                      opacity: isDragged ? 0 : 1,
                      willChange: isDragging ? "transform" : undefined,
                      backfaceVisibility: "hidden",
                    }}
                  >
                    <SongCard
                      id={item.id}
                      title={item.title}
                      artists={item.artists}
                      artistId={item.artistId}
                      artistList={item.artistList}
                      explicit={item.explicit}
                      compact
                      coverUrl={item.coverUrl ?? ""}
                      className="select-none rounded-[10px] bg-white/[0.035] p-[8px] transition-colors hover:bg-white/[0.07]"
                      imageShape="square"
                      showReorderHandle
                      onGrabStart={event => handleCardGrab(row.index, item, event)}
                      onContextMenu={event => { event.preventDefault(); event.stopPropagation(); }}
                      onPlay={() => {
                        if (typeof window !== "undefined" && window.__linerWasDragging) return;
                        void playerEngine.playTrack(item, player.queue, player.playbackContext, player.playbackContextCover, queueIndex, true);
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {isDragging && draggedItem && (
        <FloatingDragCard x={pointerPos.x} y={pointerPos.y} offsetX={grabOffset.x} offsetY={grabOffset.y} width={itemWidth}>
          <SongCard
            id={draggedItem.id}
            title={draggedItem.title}
            artists={draggedItem.artists}
            artistId={draggedItem.artistId}
            artistList={draggedItem.artistList}
            explicit={draggedItem.explicit}
            compact
            coverUrl={draggedItem.coverUrl ?? ""}
            className="select-none rounded-[10px] border border-white/10 bg-bg-elevated p-[8px] shadow-2xl"
            imageShape="square"
          />
        </FloatingDragCard>
      )}
    </div>
  );
}
