import { useEffect, useState } from "react";
import { api, mediaUrl, toMaxQualityAvatarUrl } from "@/shared/api";
import type { LibraryItemViewModel } from "../types";
import { getPlaylistCover } from "../services/playlistCovers";
import { readCoverMarker } from "../services/playlistCoverMarker";

export type EntityType = "album" | "artist" | "playlist";

export function useExternalItems(type: EntityType) {
  const [data, setData] = useState<LibraryItemViewModel[]>([]);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const collectionType =
          type === "album" ? "albums" : type === "artist" ? "artists" : "playlists";
        const response = await api.listSavedCollections(collectionType);
        if (!active) return;
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
            imageUrl: cover,
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
        setData(items);
      } catch { if (active) setData([]); }
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
  return { data };
}
