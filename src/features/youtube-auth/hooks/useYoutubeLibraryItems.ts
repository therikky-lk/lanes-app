import { useEffect, useState } from "react";
import { fetchYoutubeAccountPlaylists, useYoutubePreferences } from "@/shared/media/youtube";
import { useYoutubeAccount } from "./useYoutubeAccount";
import type { LibraryItemViewModel } from "@/features/library/types";

export function useYoutubeLibraryItems() {
  const { signedIn, session } = useYoutubeAccount();
  const syncLibrary = useYoutubePreferences((state) => state.syncLibrary);
  const [items, setItems] = useState<LibraryItemViewModel[]>([]);

  useEffect(() => {
    if (!signedIn || !syncLibrary) {
      setItems([]);
      return;
    }
    const controller = new AbortController();
    fetchYoutubeAccountPlaylists(controller.signal)
      .then((playlists) => {
        if (controller.signal.aborted) return;
        const addedAt = new Date().toISOString();
        setItems(playlists.map((playlist) => ({
          id: playlist.id,
          title: playlist.title,
          subtitle: playlist.subtitle || "YouTube",
          imageUrl: playlist.thumbnailUrl || "",
          kind: "playlist",
          href: `/collection?type=playlist&id=${encodeURIComponent(playlist.id)}`,
          addedAt,
          isOwned: false,
          source: "youtube",
        })));
      })
      .catch(() => {
        if (!controller.signal.aborted) setItems([]);
      });
    return () => controller.abort();
  }, [session, signedIn, syncLibrary]);

  return items;
}
