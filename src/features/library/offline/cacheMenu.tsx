import { LuCircleArrowDown, LuLoaderCircle } from "react-icons/lu";
import type { DropdownMenuItem } from "@/shared/ui/DropdownMenu";
import { showToast } from "@/shared/ui/Toast";
import { useTranslation } from "@/languages";
import type { Track } from "@/shared/types";
import { api, toClientTrack } from "@/shared/api";
import { fetchYoutubeAccountPlaylist, isAccountPlaylistId } from "@/shared/media/youtube";
import { useOfflineLibraryStore } from "./offlineLibraryStore";
import { canCacheTrack, saveTrackToCache, savePlaylistToCache, useManualCacheStore } from "./manualCache";

async function loadPlaylist(id: string, owned: boolean): Promise<Track[]> {
  if (owned) return (await api.getUserPlaylist(id)).items.map(item => toClientTrack(item.track));
  if (isAccountPlaylistId(id)) {
    const playlist = await fetchYoutubeAccountPlaylist(id);
    if (playlist?.tracks.length) return playlist.tracks.map(toClientTrack);
  }
  return (await api.getPlaylist(id)).tracks.map(toClientTrack);
}

export function useCacheTrackMenuItem(track: Track | undefined): DropdownMenuItem | null {
  const { t } = useTranslation();
  const cached = useOfflineLibraryStore(state => !!track && state.cachedTrackIds.has(track.id));
  const pending = useManualCacheStore(state => !!track && state.pending.has(track.id));
  if (!track || !canCacheTrack(track)) return null;
  return {
    id: "cache-track", label: t(pending ? "common.cache_saving" : cached ? "common.cache_saved" : "common.cache_track"),
    icon: pending ? <LuLoaderCircle size={15} className="animate-spin" /> : <LuCircleArrowDown size={15} className={cached ? "text-green-500" : undefined} />,
    disabled: cached || pending,
    onClick: async () => {
      showToast(t("common.cache_saving"), "info");
      try { await saveTrackToCache(track); showToast(t("common.cache_saved"), "success"); }
      catch (error) { if (!(error instanceof DOMException && error.name === "AbortError")) showToast(t("common.cache_failed"), "error"); }
    },
  };
}

export function useCachePlaylistMenuItem(id: string | undefined, tracks?: Track[], owned = false): DropdownMenuItem | null {
  const { t } = useTranslation();
  const key = `${owned ? "owned" : "catalog"}:${id}`;
  const pending = useManualCacheStore(state => state.playlists.has(key));
  if (!id) return null;
  return {
    id: "cache-playlist", label: t(pending ? "common.cache_saving" : "common.cache_playlist"), disabled: pending || (tracks !== undefined && !tracks.some(canCacheTrack)),
    icon: pending ? <LuLoaderCircle size={15} className="animate-spin" /> : <LuCircleArrowDown size={15} />,
    onClick: async () => {
      showToast(t("common.cache_saving"), "info");
      try {
        const result = await savePlaylistToCache(key, async () => tracks ?? await loadPlaylist(id, owned));
        showToast(t("common.cache_playlist_result", result), result.saved === result.total ? "success" : "info");
      } catch (error) { if (!(error instanceof DOMException && error.name === "AbortError")) showToast(t("common.cache_failed"), "error"); }
    },
  };
}
