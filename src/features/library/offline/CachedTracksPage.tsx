import { useEffect } from "react";
import { SwipeToQueue } from "@/shared/ui/SwipeToDelete";
import { useIsMobile } from "@/shared/hooks/useIsMobile";
import { DeleteLine } from "@mingcute/react";
import { useTranslation } from "@/languages";
import { useToast } from "@/shared/ui";
import SongCardWithMenu from "@/features/player/ui/SongCardWithMenu";
import TrackCollectionHeader from "../ui/TrackCollectionHeader";
import { shuffle } from "@/shared/utils/shuffle";
import { playerEngine } from "@/features/player/engine/playerEngine";
import { usePlayerStore } from "@/features/player/store/playerStore";
import { audioCache } from "@/shared/storage/audioCache";
import { useOfflineLibraryStore } from "./offlineLibraryStore";
import { TrackSearchField, useTrackSearch } from "../ui/TrackSearch";

export default function CachedTracksPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const { cached, loaded, refresh } = useOfflineLibraryStore();
  const current = usePlayerStore(state => state.currentTrack?.id);
  const search = useTrackSearch(cached, "cache:tracks");
  useEffect(() => { void refresh().catch(() => toast(t("settings.cache.local_cache.error"), "error")); }, [refresh, t, toast]);
  const tracks = search.matches?.map((match) => match.track) ?? cached;
  return <div className="h-full overflow-y-auto px-4 sm:px-8 pt-5 pb-24" data-page-scroller
    style={isMobile ? { paddingTop: "calc(var(--lane-safe-top, 0px) + 12px)", paddingBottom: "calc(var(--lane-dock-h, 120px) + 24px)" } : undefined}>
    <TrackCollectionHeader title={t("library.cached_songs")} kind="cache" count={cached.length}
      onPlay={() => { if (cached[0]) void playerEngine.playTrack(cached[0], cached, "cache:tracks"); }}
      onQueue={() => cached.forEach(track => playerEngine.addToQueue(track))}
      onShuffle={() => { const list = shuffle(cached); if (list[0]) void playerEngine.playTrack(list[0], list, "cache:tracks"); }}
      onSearch={search.toggle} searchOpen={search.isOpen} />
    <div id="cached-track-search" className={search.isOpen ? "mb-[16px]" : undefined}>
      <TrackSearchField search={search} totalCount={cached.length} placeholder={t("common.search")}
        closeOnBlur={false} className="!h-[44px] !w-full !rounded-[12px] [&_input]:text-[16px]"
        onSubmit={() => { if (tracks[0]) void playerEngine.playTrack(tracks[0], cached, "cache:tracks"); }} />
    </div>
    {loaded && cached.length > 0 && tracks.length === 0 && <p className="py-[24px] text-center text-text-tertiary">{t("common.no_results")}</p>}
    {!loaded ? <p className="text-text-tertiary">…</p> : cached.length === 0 ? <p className="py-12 text-center text-text-tertiary">{t("library.cached_empty")}</p> : <div className="rounded-[14px] bg-black/[0.03] dark:bg-white/[0.04] px-[8px] py-[8px]">{tracks.map(track => {
      const card = <SongCardWithMenu key={track.id} showLikeButton searchType="track" durationMs={track.durationMs}
        id={track.id} title={track.title} artists={track.artists} artistId={track.artistId} artistList={track.artistList}
        coverUrl={track.coverUrl} albumTitle={track.album?.title} highlight={search.activeQuery} isCurrent={current === track.id}
        duration={`${Math.floor(track.durationMs / 60000)}:${String(Math.floor(track.durationMs / 1000) % 60).padStart(2, "0")}`}
        onPlay={() => playerEngine.playTrack(track, cached, "cache:tracks")}
        extraMenuItems={[{ id: "remove-cache", icon: <DeleteLine size={15} />, label: t("settings.storage.remove"), onClick: () => {
          void audioCache.deleteAudio(track.id).then(refresh).catch(() => toast(t("settings.cache.local_cache.error"), "error"));
        } }]} />;
      const addToQueue = () => {
        playerEngine.addToQueue(track);
        toast(t("common.added_to_queue"), "checkmark", { description: track.title });
      };
      return isMobile
        ? <SwipeToQueue key={track.id} label={t("common.add_to_queue")} onAddToQueue={addToQueue}>{card}</SwipeToQueue>
        : <div key={track.id}>{card}</div>;
    })}</div>}
  </div>;
}
