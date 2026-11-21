import { youtubePlaylistArtwork } from "@/shared/media/youtube/account/playlistArtwork";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { api, mediaUrl, toMaxQualityAvatarUrl } from "@/shared/api";
import type { LibraryItemViewModel } from "../types";
import { getPlaylistCover } from "../services/playlistCovers";
import { readCoverMarker } from "../services/playlistCoverMarker";
import {
  confirmPlaylistRemovals, isPlaylistRemoved, playlistLibraryOwner, playlistRemovalGeneration,
  playlistRemovalSnapshot, subscribePlaylistRemovals,
} from "../services/playlistRemovals";

export type EntityType = "album" | "artist" | "playlist";

export function useExternalItems(type: EntityType) {
  const [data, setData] = useState<LibraryItemViewModel[]>([]);
  const removalRevision = useSyncExternalStore(subscribePlaylistRemovals, playlistRemovalSnapshot, playlistRemovalSnapshot);
  const visibleData = useMemo(() => type === "playlist" ? data.filter(item => !isPlaylistRemoved(item.id)) : data, [data, type, removalRevision]);
  useEffect(() => {
    let active = true;
    let sequence = 0;
    const load = async () => {
      const current = ++sequence;
      const owner = playlistLibraryOwner();
      const generation = playlistRemovalGeneration();
      try {
        const collectionType =
          type === "album" ? "albums" : type === "artist" ? "artists" : "playlists";
        const response = await api.listSavedCollections(collectionType);
        if (!active || current !== sequence || owner !== playlistLibraryOwner()) return;
        const items = await Promise.all(response.items.map(async (entry: any) => {
          const value = entry[type];
          const rawCover = value.cover ? mediaUrl(value.cover.url) : "";
          let cover = type === "artist" ? toMaxQualityAvatarUrl(rawCover) : rawCover;
          if (!cover && type === "playlist") {
            cover = getPlaylistCover(value.id) || "";
            if (!cover) {
              try {
                const detail = await api.getUserPlaylist(value.id);
                cover = readCoverMarker(detail.playlist.description) || "";
              } catch {
                // Saved catalog playlists may not belong to the current user.
              }
            }
          }
          return {
            id: value.id,
            title: type === "artist" ? value.name : value.title,
            subtitle:
              type === "artist"
                ? "Artist"
                : type === "playlist"
                  ? (value.author || (value.trackCount ? `${value.trackCount} tracks` : "Playlist"))
                  : [value.year, value.trackCount ? `${value.trackCount} tracks` : undefined].filter(Boolean).join(" • "),
            imageUrl: type === "playlist" ? youtubePlaylistArtwork(value.id, cover) : cover,
            kind: type,
            href:
              type === "artist"
                ? `/artist?id=${encodeURIComponent(value.id)}`
                : type === "playlist"
                  ? `/collection?type=playlist&id=${encodeURIComponent(value.id)}`
                  : `/collection?type=album&id=${encodeURIComponent(value.id)}`,
            addedAt: entry.savedAt,
            trackCount: value.trackCount,
            isOwned: false,
          };
        }));
        if (!active || current !== sequence || owner !== playlistLibraryOwner() || generation !== playlistRemovalGeneration()) return;
        setData(items);
        if (type === "playlist") confirmPlaylistRemovals("saved", new Set(items.map(item => item.id)), generation, owner);
      } catch { if (active && current === sequence && owner === playlistLibraryOwner()) setData([]); }
    };
    void load();
    const refresh = () => void load();
    window.addEventListener("library:changed", refresh);
    window.addEventListener("auth:changed", refresh);
    return () => {
      active = false;
      window.removeEventListener("library:changed", refresh);
      window.removeEventListener("auth:changed", refresh);
    };
  }, [type]);
  return { data: visibleData };
}
