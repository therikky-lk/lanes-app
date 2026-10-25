import { api } from "@/shared/api";
import { isLocalTrackId, setLocalTrackLiked } from "@/shared/media/local/localTracks";
import {
  readLocalEntries,
  withLocalEntries,
  type LocalPlaylistEntry,
} from "@/features/library/services/playlistCoverMarker";
import { buildLocalPlaylistEntry } from "./localPlaylistTracks";

// Likes of the user's own files: the server's liked list only takes catalog
// tracks, so they're kept (title, artist, which device has the file) in a
// hidden playlist of the account. Every device reads it and shows those songs
// in Liked, greyed out where the file isn't.

/** the hidden playlist's title (starts with an invisible separator) */
export const LOCAL_LIKES_TITLE = "⁣lane:liked-files";

export function isLocalLikesPlaylist(playlist: { title?: string | null }): boolean {
  return playlist.title === LOCAL_LIKES_TITLE;
}

async function findPlaylist(create: boolean): Promise<{ id: string; description?: string | null } | null> {
  const { items } = await api.listPlaylists();
  const found = items.find(isLocalLikesPlaylist);
  if (found || !create) return found ?? null;
  return api.createPlaylist({ title: LOCAL_LIKES_TITLE, description: "", isPublic: false });
}

/** the user's own files liked on any of their devices */
export async function loadLocalLikes(): Promise<LocalPlaylistEntry[]> {
  try {
    const playlist = await findPlaylist(false);
    return playlist ? readLocalEntries(playlist.description) : [];
  } catch {
    return [];
  }
}

let queue: Promise<void> = Promise.resolve();

/** like / unlike one of the user's own files, here and for the other devices */
export function setLocalLike(trackId: string, liked: boolean): Promise<void> {
  if (!isLocalTrackId(trackId)) return Promise.resolve();
  const local = setLocalTrackLiked(trackId, liked).catch(() => undefined);
  // one change at a time: each one rewrites the whole list
  queue = queue
    .then(async () => {
      const entry = liked ? await buildLocalPlaylistEntry(trackId) : undefined;
      if (liked && !entry) return; // not a file of this device
      const playlist = await findPlaylist(liked);
      if (!playlist) return;
      const entries = readLocalEntries(playlist.description).filter((e) => e.id !== trackId);
      const next = liked && entry ? [entry, ...entries] : entries;
      await api.updatePlaylist(playlist.id, { description: withLocalEntries(playlist.description, next) });
      window.dispatchEvent(new Event("library:changed"));
      window.dispatchEvent(new Event("library:local-change"));
    })
    .catch(() => undefined);
  return Promise.all([local, queue]).then(() => undefined);
}
