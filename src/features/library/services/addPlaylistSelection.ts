import { api, ApiError } from "@/shared/api";
import { trackPendingWrite } from "@/shared/api/pendingWrites";
import type { Track } from "@/shared/contracts";
import { isLocalTrackId } from "@/shared/media/local/localTracks";
import { buildLocalPlaylistEntry, localEntrySnapshot } from "@/features/local/localPlaylistTracks";
import { readLocalEntries } from "./playlistCoverMarker";
import { notifyLibraryChanged } from "../hooks/usePlaylists";
import { appendImportedPlaylistTracks } from "./import/manager/finalizeImport";

export async function addPlaylistSelection(playlistId: string, tracks: Track[]): Promise<number> {
  return trackPendingWrite((async () => {
    const { items, playlist } = await api.getUserPlaylist(playlistId);
    const ids = new Set(items.map(({ track }) => track.id));
    for (const entry of readLocalEntries(playlist.description)) ids.add(entry.id);
    const missing: Track[] = [];
    for (const track of tracks) {
      if (ids.has(track.id)) continue;
      ids.add(track.id);
      if (!isLocalTrackId(track.id)) {
        missing.push(track);
        continue;
      }
      const entry = await buildLocalPlaylistEntry(track.id);
      if (!entry) throw new ApiError(404, "Local track was not found.");
      missing.push(localEntrySnapshot(entry));
    }
    if (!missing.length) return 0;
    try {
      return await appendImportedPlaylistTracks(playlistId, missing);
    } finally {
      notifyLibraryChanged();
    }
  })());
}
