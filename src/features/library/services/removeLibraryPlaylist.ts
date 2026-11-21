import { api } from "@/shared/api";
import { evictPlaylistFromCache } from "../hooks/usePlaylists";
import { beginPlaylistRemoval, playlistLibraryOwner } from "./playlistRemovals";

async function removeSavedReference(id: string) {
  try { await api.removeCollection("playlists", id); }
  catch (error) {
    // A lost DELETE reply is successful only when a fresh read confirms removal.
    const absent = await api.listSavedCollections("playlists")
      .then(response => !response.items.some(entry => {
        const item = entry as { playlist?: { id?: string }; id?: string };
        return (item.playlist?.id ?? item.id) === id;
      })).catch(() => false);
    if (!absent) throw error;
  }
}

export async function removeLibraryPlaylist(id: string, isOwned?: boolean): Promise<void> {
  const owner = playlistLibraryOwner();
  const owned = isOwned ?? (await api.listPlaylists()).items.some(playlist => playlist.id === id);
  if (owner !== playlistLibraryOwner()) throw new Error("Account changed");
  const removal = beginPlaylistRemoval(id, owned);
  try {
    if (owned) {
      try { await api.deletePlaylist(id); }
      catch (error) {
        const absent = await api.listPlaylists()
          .then(response => !response.items.some(playlist => playlist.id === id)).catch(() => false);
        if (!absent) throw error;
      }
    }
    if (owner !== playlistLibraryOwner()) throw new Error("Account changed");
    await removeSavedReference(id);
    if (owner !== playlistLibraryOwner()) throw new Error("Account changed");
    removal.commit();
    evictPlaylistFromCache(id);
  } catch (error) {
    removal.rollback();
    throw error;
  }
}
