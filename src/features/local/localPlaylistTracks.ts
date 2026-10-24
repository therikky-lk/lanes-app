import type { Track as ApiTrack } from "@/shared/contracts";
import type { Track } from "@/shared/types";
import { registerLocalTrackSnapshotResolver } from "@/shared/api/localTrackSnapshots";
import { getLocalTrack, isLocalTrackId, type LocalTrackRecord } from "@/shared/media/local/localTracks";
import { useConnectStore } from "@/features/connect/connectService";

// A file from "My tracks" can be added to any playlist. The audio stays on the
// device it was uploaded on; the playlist (on the server) only keeps a
// snapshot that says which device that is. Other devices show the row greyed
// out: "only on <device>".

/** the snapshot's album marks the device the file lives on */
export const DEVICE_ALBUM_PREFIX = "lane-device:";

function deviceOf(track: { album?: { id?: string; title?: string } }): string | undefined {
  const album = track.album;
  if (!album?.id?.startsWith(DEVICE_ALBUM_PREFIX)) return undefined;
  return album.title || undefined;
}

export async function buildLocalTrackSnapshot(trackId: string): Promise<ApiTrack | undefined> {
  if (!isLocalTrackId(trackId)) return undefined;
  const record = await getLocalTrack(trackId);
  if (!record) return undefined;
  const me = useConnectStore.getState().me;
  return {
    id: record.id,
    title: record.title,
    artists: record.artists
      ? record.artists
          .split(/\s*,\s*/)
          .filter(Boolean)
          .map((name) => ({ id: "", name }))
      : [],
    durationMs: record.durationMs,
    // no cover: the artwork stays on the device with the file
    album: { id: `${DEVICE_ALBUM_PREFIX}${me.id}`, title: me.name },
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

export function initLocalPlaylistTracks(): void {
  registerLocalTrackSnapshotResolver(buildLocalTrackSnapshot);
}
