import { api, ApiError } from "@/shared/api";
import type { Track } from "@/shared/contracts";

const FALLBACK_CONCURRENCY = 4;

export interface FinalizedPlaylist {
  playlistId: string;
  saved: number;
}

function uniqueTracks(tracks: Track[]): Track[] {
  return [...new Map(tracks.filter((track) => Boolean(track?.id)).map((track) => [track.id, track] as const)).values()];
}

async function addOneByOne(playlistId: string, tracks: Track[]): Promise<number> {
  let saved = 0;
  let cursor = 0;
  let failed = 0;
  const worker = async () => {
    while (cursor < tracks.length) {
      const track = tracks[cursor++];
      try {
        await api.addPlaylistTrack(playlistId, track.id, track);
        saved += 1;
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) saved += 1;
        else failed += 1;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(FALLBACK_CONCURRENCY, tracks.length) }, worker));
  if (failed > 0) {
    throw new Error(`Could not save ${failed} of ${tracks.length} playlist tracks.`);
  }
  return saved;
}

// a single request with a thousand tracks can hit the server's body limit or
// time out, losing the whole import at the very end: send it in chunks
const SAVE_CHUNK = 100;

async function addChunk(playlistId: string, tracks: Track[]): Promise<number> {
  for (let attempt = 0; ; attempt++) {
    let result: Awaited<ReturnType<typeof api.addPlaylistTrackSnapshots>>;
    try {
      result = await api.addPlaylistTrackSnapshots(playlistId, tracks);
    } catch (error) {
      if (error instanceof ApiError && (error.status === 404 || error.status === 405 || error.status === 413)) {
        return addOneByOne(playlistId, tracks);
      }
      const status = (error as { status?: number })?.status;
      const retryable = status === undefined || status === 0 || status === 408 || status === 429 || status >= 500;
      if (!retryable || attempt >= 3) throw error;
      await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt));
      continue;
    }

    const reportedAdded = Number.isFinite(result.added)
      ? Math.max(0, Math.min(tracks.length, result.added))
      : 0;
    if (reportedAdded >= tracks.length && (result.rejected ?? 0) <= 0) return reportedAdded;

    const returnedIds = new Set(
      (result.items ?? [])
        .map((item) => item.track?.id)
        .filter((id): id is string => typeof id === "string" && tracks.some((track) => track.id === id)),
    );
    // If the server gave a count but omitted some item snapshots, account
    // for the accepted prefix before retrying unconfirmed tracks individually.
    for (const track of tracks.slice(0, reportedAdded)) returnedIds.add(track.id);
    const missing = tracks.filter((track) => !returnedIds.has(track.id));
    const recovered = await addOneByOne(playlistId, missing);
    if (recovered < missing.length) {
      throw new Error(`Could not save ${missing.length - recovered} of ${tracks.length} playlist tracks.`);
    }
    const confirmed = tracks.filter((track) => returnedIds.has(track.id)).length;
    return confirmed + recovered;
  }
}

async function addTracks(playlistId: string, tracks: Track[]): Promise<number> {
  let saved = 0;
  for (let i = 0; i < tracks.length; i += SAVE_CHUNK) {
    saved += await addChunk(playlistId, tracks.slice(i, i + SAVE_CHUNK));
  }
  return saved;
}

export function appendImportedPlaylistTracks(playlistId: string, tracks: Track[]): Promise<number> {
  return addTracks(playlistId, uniqueTracks(tracks));
}

export async function finalizeImportedPlaylist(
  title: string,
  description: string | undefined,
  tracks: Track[],
): Promise<FinalizedPlaylist> {
  const playlist = await api.createPlaylist({
    title: title.trim().slice(0, 200) || "Imported playlist",
    ...(description?.trim() ? { description: description.trim().slice(0, 2000) } : {}),
  });
  const unique = uniqueTracks(tracks);
  try {
    const saved = unique.length > 0 ? await addTracks(playlist.id, unique) : 0;
    if (saved !== unique.length) {
      throw new Error(`Only ${saved} of ${unique.length} playlist tracks were saved.`);
    }
    return { playlistId: playlist.id, saved };
  } catch (error) {
    await api.deletePlaylist(playlist.id).catch(() => undefined);
    throw error;
  }
}
