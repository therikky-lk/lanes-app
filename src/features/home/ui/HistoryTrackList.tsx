import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import SongCardWithMenu from "@/features/player/ui/SongCardWithMenu";
import { playerEngine } from "@/features/player";
import type { Track } from "@/shared/types";

export default function HistoryTrackList({ tracks }: { tracks: Track[] }) {
  const scroll = useRef<HTMLDivElement>(null);
  const rows = useVirtualizer({ count: tracks.length, getScrollElement: () => scroll.current, estimateSize: () => 64, overscan: 3 });
  return <div ref={scroll} className="overflow-y-auto overscroll-contain" style={{ height: Math.min(480, tracks.length * 64) }}>
    <div className="relative" style={{ height: rows.getTotalSize() }}>
      {rows.getVirtualItems().map(row => {
        const track = tracks[row.index];
        return <div key={row.key} className="absolute inset-x-0 top-0" style={{ height: 64, transform: `translateY(${row.start}px)` }}>
          <SongCardWithMenu id={track.id} title={track.title} artists={track.artists} artistId={track.artistId} artistList={track.artistList}
            coverUrl={track.coverUrl ?? ""} durationMs={track.durationMs} explicit={track.explicit} showLikeButton searchType="track"
            onPlay={() => void playerEngine.playTrack(track, tracks, "recent", null, row.index)} />
        </div>;
      })}
    </div>
  </div>;
}
