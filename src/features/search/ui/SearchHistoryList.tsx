import { memo, useRef } from "react";
import { Search3Line } from "@mingcute/react";
import SwipeToDelete from "@/shared/ui/SwipeToDelete";
import SongCardWithMenu from "@/features/player/ui/SongCardWithMenu";
import { useTranslation } from "@/languages";
import { useSearchHistoryStore } from "../store/searchHistoryStore";

export interface SearchHistoryListProps {
  fullHeight?: boolean;
  onSelectQuery: (query: string) => void;
  onPlayTrack: (track: any) => void;
  onNavigateItem: (item: any) => void;
  scrollRef?: React.RefObject<HTMLDivElement | null>;
  onScroll?: () => void;
  onOpenArtist?: (artist: { id: string; name: string }) => void;
  maskStyle?: React.CSSProperties;
}

export const SearchHistoryList = memo(function SearchHistoryList({
  fullHeight = false,
  onSelectQuery,
  onPlayTrack,
  onNavigateItem,
  scrollRef,
  onScroll,
  onOpenArtist,
  maskStyle,
}: SearchHistoryListProps) {
  const { t } = useTranslation();
  const internalRef = useRef<HTMLDivElement>(null);
  const containerRef = scrollRef ?? internalRef;

  const items = useSearchHistoryStore((state) => state.items);
  const clearHistory = useSearchHistoryStore((state) => state.clearHistory);
  const removeItem = useSearchHistoryStore((state) => state.removeItem);

  if (items.length === 0) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      onScroll={onScroll}
      className={`${fullHeight ? "h-full" : "max-h-[480px]"} overflow-y-auto overflow-x-hidden px-[14px] pt-[8px] pb-[14px]`}
      style={maskStyle}
    >
      <div className="flex items-center justify-between px-[6px] pt-[4px] pb-[10px]">
        <span className="text-[13px] font-medium text-text-secondary tracking-tight">
          {t("common.recent_searches")}
        </span>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={clearHistory}
          className="text-[12px] text-text-tertiary hover:text-text-primary transition-colors border-none bg-transparent cursor-pointer p-0 select-none"
        >
          {t("common.clear_recent")}
        </button>
      </div>

      <div className="flex flex-col gap-[6px]">
        {items.map((item) => {
          if (item.type === "query") {
            return (
              <SwipeToDelete key={item.id} label={t("common.remove")} onDelete={() => removeItem(item.id)}>
              <div
                onClick={() => onSelectQuery(item.title)}
                className="group flex items-center w-full min-w-0 rounded-[8px] hover:bg-border-alpha-14 cursor-pointer transition-colors select-none"
              >
                <div className="flex flex-1 items-center gap-[12px] min-w-0 pl-[12px] py-[9px]">
                  <span className="shrink-0 text-text-tertiary group-hover:text-text-primary transition-colors">
                    <Search3Line size={17} />
                  </span>
                  <span className="truncate text-[14.5px] font-[400] text-text-primary">
                    {item.title}
                  </span>
                </div>
              </div>
              </SwipeToDelete>
            );
          }

          const isArtist = item.type === "artist";
          const data = item.itemData ?? item;

          return (
            <SwipeToDelete key={item.id} label={t("common.remove")} onDelete={() => removeItem(item.id)}>
            <div className="group flex items-center w-full min-w-0">
              <div className="min-w-0 flex-1">
                <SongCardWithMenu
                id={item.id}
                title={item.title}
                artistId={data?.artistId ?? data?.artist_id}
                artistList={data?.artistList}
                artists={item.subtitle || ""}
                coverUrl={item.coverUrl || ""}
                explicit={item.explicit}
                imageShape={isArtist ? "circle" : "square"}
                duration={item.duration}
                durationMs={item.durationMs}
                searchType={item.type}
                totalTracks={data?.totalTracks ?? data?.total_tracks}
                onPlay={
                  item.type === "track"
                    ? () => onPlayTrack(data)
                    : () => onNavigateItem(data)
                }
                onNavigate={() => onNavigateItem(data)}
                onOpenArtist={onOpenArtist}
                showLikeButton={item.type === "track"}
              />
              </div>
            </div>
            </SwipeToDelete>
          );
        })}
      </div>
    </div>
  );
});

export default SearchHistoryList;
