import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeftLine, DeleteLine, PlayFill } from "@mingcute/react";
import { useTranslation } from "@/languages";
import { useToast } from "@/shared/ui";
import Button from "@/shared/ui/Button";
import SongCard from "@/features/player/ui/SongCard";
import { playerEngine } from "@/features/player/engine/playerEngine";
import { usePlayerStore } from "@/features/player/store/playerStore";
import { audioCache } from "@/shared/storage/audioCache";
import { useOfflineLibraryStore } from "./offlineLibraryStore";
import OfflineCover from "../ui/OfflineCover";

export default function CachedTracksPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { cached, loaded, refresh } = useOfflineLibraryStore();
  const current = usePlayerStore(state => state.currentTrack?.id);
  const [query, setQuery] = useState("");
  useEffect(() => { void refresh().catch(() => toast(t("settings.cache.local_cache.error"), "error")); }, [refresh, t, toast]);
  const totalSeconds = Math.floor(cached.reduce((sum, track) => sum + track.durationMs, 0) / 1000);
  const tracks = cached.filter(track => `${track.title} ${track.artists}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <div className="h-full overflow-y-auto px-4 sm:px-8 pt-5 pb-24" data-page-scroller>
    <Button variant="secondary" onClick={() => navigate("/library")}><ArrowLeftLine size={16} />{t("common.back")}</Button>
    <header className="flex flex-wrap items-end gap-6 my-6">
      <div className="relative w-[144px] h-[144px] overflow-hidden rounded-xl"><OfflineCover kind="cache" /></div>
      <div><h1 className="m-0 text-[28px] font-semibold text-text-primary">{t("library.cached_songs")}</h1>
        <div className="my-3 flex flex-wrap gap-1 text-[12px] text-text-tertiary">
          <span className="rounded-[8px] bg-black/5 dark:bg-white/[0.07] px-2 py-1 tabular-nums">{t("common.songs", { count: cached.length })}</span>
          <span className="rounded-[8px] bg-black/5 dark:bg-white/[0.07] px-2 py-1 tabular-nums">{Math.floor(totalSeconds / 60)}:{String(totalSeconds % 60).padStart(2, "0")}</span>
        </div>
        <Button variant="primary" disabled={!tracks.length} onClick={() => playerEngine.playTrack(tracks[0], tracks, "cache:tracks")}><PlayFill size={16} />{t("common.play_all")}</Button>
      </div>
    </header>
    <input type="search" value={query} onChange={event => setQuery(event.target.value)} aria-label={t("common.search")} placeholder={t("common.search")}
      className="mb-4 w-full rounded-xl border-0 bg-black/5 dark:bg-white/5 p-3 text-[13px] text-text-primary" />
    {!loaded ? <p className="text-text-tertiary">…</p> : cached.length === 0 ? <p className="py-12 text-center text-text-tertiary">{t("library.cached_empty")}</p> : tracks.map(track => <SongCard key={track.id}
      id={track.id} title={track.title} artists={track.artists} artistId={track.artistId} artistList={track.artistList}
      coverUrl={track.coverUrl} albumTitle={track.album?.title} highlight={query} isCurrent={current === track.id}
      duration={`${Math.floor(track.durationMs / 60000)}:${String(Math.floor(track.durationMs / 1000) % 60).padStart(2, "0")}`}
      onPlay={() => playerEngine.playTrack(track, tracks, "cache:tracks")}
      menuItems={[{ id: "remove-cache", icon: <DeleteLine size={15} />, label: t("settings.storage.remove"), onClick: () => {
        void audioCache.deleteAudio(track.id).then(refresh).catch(() => toast(t("settings.cache.local_cache.error"), "error"));
      } }]} />)}
  </div>;
}
