import type { Track } from "@/shared/types";
import { getLocalTrack, isLocalTrackId, type LocalTrackRecord } from "@/shared/media/local/localTracks";
import type { LocalPlaylistEntry } from "@/features/library/services/playlistCoverMarker";

// A file from "My tracks" can be added to any playlist. The audio stays on the
// device it was uploaded on; the playlist only remembers (in its description,
// which every device gets from the server) the title and which device has it.
// Other devices show the row greyed out: "only on <device>".

/** a playlist row's album marks the device the file lives on */
export const DEVICE_ALBUM_PREFIX = "lane-device:";
/** playlist item ids of these rows (they aren't server items) */
export const LOCAL_ITEM_PREFIX = "lane-local:";

export function isLocalPlaylistItemId(itemId: string | null | undefined): boolean {
  return typeof itemId === "string" && itemId.startsWith(LOCAL_ITEM_PREFIX);
}

function deviceOf(track: { album?: { id?: string; title?: string } }): string | undefined {
  const album = track.album;
  if (!album?.id?.startsWith(DEVICE_ALBUM_PREFIX)) return undefined;
  return album.title || undefined;
}

export async function buildLocalPlaylistEntry(trackId: string): Promise<LocalPlaylistEntry | undefined> {
  if (!isLocalTrackId(trackId)) return undefined;
  const record = await getLocalTrack(trackId);
  if (!record) return undefined;
  // loaded on demand: the playlist code shouldn't pull Lane Connect in with it
  const { useConnectStore } = await import("@/features/connect/connectService");
  const me = useConnectStore.getState().me;
  return {
    id: record.id,
    title: record.title,
    artists: record.artists,
    durationMs: record.durationMs,
    deviceId: me.id,
    deviceName: me.name,
    addedAt: Date.now(),
  };
}

export function localEntryToTrack(entry: LocalPlaylistEntry): Track {
  return {
    id: entry.id,
    playlistItemId: `${LOCAL_ITEM_PREFIX}${entry.id}`,
    title: entry.title,
    artists: entry.artists,
    artistList: entry.artists
      ? entry.artists.split(/\s*,\s*/).filter(Boolean).map((name) => ({ id: "", name }))
      : [],
    coverUrl: "",
    durationMs: entry.durationMs,
    playCount: 0,
    album: { id: `${DEVICE_ALBUM_PREFIX}${entry.deviceId}`, title: entry.deviceName },
  };
}

/**
 * Playlist rows as this device sees them: our own files get their artwork
 * back, files from another device are marked with that device's name.
 */
export function withLocalAvailability(tracks: Track[], records: LocalTrackRecord[]): Track[] {
  if (!tracks.some((track) => isLocalTrackId(track.id))) return tracks;
  const byId = new Map(records.map((record) => [record.id, record]));
  return tracks.map((track) => {
    if (!isLocalTrackId(track.id)) return track;
    const record = byId.get(track.id);
    if (record) {
      return {
        ...track,
        coverUrl: record.coverDataUrl ?? track.coverUrl,
        album: record.album ? { id: "local", title: record.album } : undefined,
      };
    }
    return { ...track, album: undefined, onlyOnDevice: deviceOf(track) ?? "?" };
  });
}
