import { useNavigate } from "react-router-dom";
import { ArrowLeftLine } from "@mingcute/react";
import { useTranslation } from "@/languages";
import { playerEngine } from "@/features/player";
import SongCardWithMenu from "@/features/player/ui/SongCardWithMenu";
import type { Track } from "@/shared/types/track";
import { useRecentlyPlayed } from "../hooks/useRecentlyPlayed";

/** everything played lately, newest first */
export default function RecentPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data, isLoading } = useRecentlyPlayed(100);
  const tracks: Track[] = (data ?? []).flatMap((e) => (e.type === "track" ? [e.item as Track] : []));
  const title = t("home.recent") && t("home.recent") !== "home.recent" ? t("home.recent") : "Recently played";

  return (
    <div data-page-scroller className="h-full w-full overflow-y-auto pb-[32px]" style={{ fontFamily: "var(--font-inter), sans-serif" }}>
      <div className="px-[32px] pt-[52px]">
        <button
          type="button"
          onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/"))}
          className="mb-[14px] inline-flex h-[32px] items-center gap-[6px] rounded-md border-0 bg-bg-panel/85 px-[10px] text-[13px] font-[500] text-text-primary cursor-pointer"
        >
          <ArrowLeftLine size={16} />
          {t("common.back")}
        </button>
        <h1 className="m-0 text-[26px] font-bold tracking-tight text-text-primary">{title}</h1>
        <p className="m-0 mt-[4px] text-[13px] text-text-tertiary">{tracks.length ? t("common.tracks", { count: tracks.length }) : isLoading ? "…" : ""}</p>
      </div>
      <div className="mt-[16px] flex flex-col gap-[2px] px-[24px]">
        {tracks.map((track, index) => (
          <SongCardWithMenu
            key={`${track.id}-${index}`}
            id={track.id}
            title={track.title}
            artists={track.artists}
            coverUrl={track.coverUrl ?? ""}
            durationMs={track.durationMs}
            explicit={track.explicit}
            onPlay={() => void playerEngine.playTrack(track, tracks, "recent", null, index)}
            searchType="track"
          />
        ))}
      </div>
    </div>
  );
}
