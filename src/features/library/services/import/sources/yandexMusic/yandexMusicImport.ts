import { api, getAuthSession, toClientTrack } from "@/shared/api";
import { trackPendingWrite } from "@/shared/api/pendingWrites";
import type { ImportedTrack, Track } from "@/shared/contracts";
import { isRateLimit, normalizeWords } from "@/shared/media/matching";
import { loadLikedTracks } from "../../../../hooks/useLikedTracks";
import { notifyLibraryChanged } from "../../../../hooks/usePlaylists";
import { importedPlaylistDescription, readPlaylistSource } from "../../../playlistCoverMarker";
import { matchWithRetry } from "../../manager/clientImportManager";
import { appendImportedPlaylistTracks, finalizeImportedPlaylist } from "../../manager/finalizeImport";
import { delay } from "../../shared/http";
import { loadYandexLikedTracks } from "./yandexMusicSource";

type ImportErrorCode = "lane_sign_in" | "account_changed" | "busy" | "matching_unavailable";

export class YandexImportError extends Error {
  constructor(readonly code: ImportErrorCode) {
    super(code);
  }
}

export type YandexImportProgress = { phase: "loading" | "matching" | "saving"; done: number; total: number };
export type YandexLikesResult = { added: number; failed: number };

export interface YandexImportResult {
  playlistId?: string;
  added: number;
  skipped: number;
  likes?: YandexLikesResult;
  likesUnavailable?: boolean;
}

type TrackMetadata = Pick<ImportedTrack, "title" | "artists" | "durationMs">;
const CONCURRENCY = 2;
const SAME_RECORDING_TOLERANCE_MS = 2_000;

function accountKey() {
  const session = getAuthSession();
  return session?.user?.id ? `${session.authBackend ?? "legacy"}:${session.user.id}` : "";
}

function requireAccount(): string {
  const owner = accountKey();
  if (!owner) throw new YandexImportError("lane_sign_in");
  return owner;
}

function checkAccount(owner: string) {
  if (accountKey() !== owner) throw new YandexImportError("account_changed");
}

function recordingKey(title: string, artists: string[]): string {
  const normalize = (value: string) => normalizeWords(value.toLowerCase().replace(/ё/g, "е"));
  const names = [...new Set(artists.map(normalize).filter(Boolean))].sort();
  const normalizedTitle = normalize(title);
  return normalizedTitle && names.length ? JSON.stringify([normalizedTitle, names]) : "";
}

function canonicalSnapshot(track: Track): Track {
  if (!track || (Array.isArray(track.artists) && track.artists.every((artist) => typeof artist?.name === "string"))) return track;
  const client = toClientTrack(track);
  return {
    ...track,
    title: client.title,
    artists: (client.artistList ?? []).map((artist) => ({ id: artist.id || "unknown", name: artist.name })),
    durationMs: client.durationMs,
    ...(client.coverUrl ? { cover: { url: client.coverUrl, width: 480, height: 480 } } : {}),
  };
}

class TrackIndex {
  private ids = new Set<string>();
  private recordings = new Map<string, Track[]>();

  constructor(tracks: Track[] = []) {
    for (const track of tracks) this.add(track);
  }

  add(track: Track) {
    if (!track?.id || this.ids.has(track.id)) return;
    this.ids.add(track.id);
    const key = recordingKey(track.title, track.artists.map((artist) => artist.name));
    if (!key) return;
    const entries = this.recordings.get(key);
    if (entries) entries.push(track);
    else this.recordings.set(key, [track]);
  }

  matchingTrack({ title, artists, durationMs }: TrackMetadata): Track | undefined {
    if (!durationMs || durationMs <= 0) return;
    const entries = this.recordings.get(recordingKey(title, artists));
    return entries?.find((entry) => entry.durationMs > 0 && Math.abs(entry.durationMs - durationMs) <= SAME_RECORDING_TOLERANCE_MS);
  }

  has(track: Track): boolean {
    return this.ids.has(track.id) || Boolean(this.matchingTrack({
      ...track, artists: track.artists.map((artist) => artist.name),
    }));
  }
}

async function forEachTrack<T>(tracks: T[], work: (track: T, index: number) => Promise<void>) {
  let cursor = 0;
  let failed = false;
  let failure: unknown;
  const worker = async () => {
    while (!failed && cursor < tracks.length) {
      const index = cursor++;
      try {
        await work(tracks[index], index);
      } catch (error) {
        failed = true;
        failure = error;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, tracks.length) }, worker));
  if (failed) throw failure;
}

async function getLikedTracks(owner: string, signal?: AbortSignal): Promise<Track[]> {
  const tracks: Track[] = [];
  const cursors = new Set<string>();
  let cursor: string | undefined;
  do {
    signal?.throwIfAborted();
    checkAccount(owner);
    const page = await api.listLikedTracks(100, cursor);
    for (const { track } of page.items) tracks.push(canonicalSnapshot(track));
    cursor = page.nextCursor ?? undefined;
    if (cursor) {
      if (cursors.has(cursor)) throw new Error("Repeated likes cursor");
      cursors.add(cursor);
    }
  } while (cursor);
  return tracks;
}

async function copyToLikes(owner: string, tracks: Track[], signal?: AbortSignal): Promise<YandexLikesResult> {
  const result = { added: 0, failed: 0 };
  const liked = new TrackIndex(await getLikedTracks(owner, signal));
  signal?.throwIfAborted();
  checkAccount(owner);
  const missing = tracks.filter((track) => {
    if (!track?.id || track.id.startsWith("local:") || liked.has(track)) return false;
    liked.add(track);
    return true;
  });

  let rateLimited = false;
  try {
    await forEachTrack(missing, async (track) => {
      for (let attempt = 0; !rateLimited; attempt++) {
        signal?.throwIfAborted();
        checkAccount(owner);
        try {
          await api.likeTrackSnapshot(track.id, track);
          result.added++;
          return;
        } catch (error) {
          if (!isRateLimit(error)) break;
          if (attempt >= 2) {
            rateLimited = true;
            break;
          }
          await delay(1_500 * 2 ** attempt, signal);
        }
      }
      result.failed++;
    });
    signal?.throwIfAborted();
    return result;
  } finally {
    if (result.added > 0 && accountKey() === owner) {
      void loadLikedTracks(true);
      notifyLibraryChanged();
    }
  }
}

export async function addYandexPlaylistToLikes(playlistId: string): Promise<YandexLikesResult> {
  const owner = requireAccount();
  const { playlist, items } = await api.getUserPlaylist(playlistId);
  if (readPlaylistSource(playlist.description) !== "yandex") throw new Error("Not a Yandex Music import");
  return trackPendingWrite(copyToLikes(owner, items.map(({ track }) => canonicalSnapshot(track))));
}

let importing = false;

export async function importYandexMusic(
  token: string,
  title: string,
  alsoLike: boolean,
  onProgress: (progress: YandexImportProgress) => void,
  signal?: AbortSignal,
): Promise<YandexImportResult> {
  signal?.throwIfAborted();
  if (importing) throw new YandexImportError("busy");
  const owner = requireAccount();
  importing = true;
  try {
    onProgress({ phase: "loading", done: 0, total: 0 });
    const { total, tracks } = await loadYandexLikedTracks(token, signal);
    signal?.throwIfAborted();
    checkAccount(owner);
    if (tracks.length === 0) return { added: 0, skipped: total };

    const { items: playlists } = await api.listPlaylists();
    signal?.throwIfAborted();
    const existing = playlists.find((playlist) => readPlaylistSource(playlist.description) === "yandex");
    const currentTracks = existing
      ? (await api.getUserPlaylist(existing.id)).items.map(({ track }) => canonicalSnapshot(track))
      : [];
    signal?.throwIfAborted();
    const current = new TrackIndex(currentTracks);
    const matches: (Track | undefined)[] = [];
    let done = 0;
    let lookupErrors = 0;
    onProgress({ phase: "matching", done, total: tracks.length });
    await forEachTrack(tracks, async (track, index) => {
      signal?.throwIfAborted();
      checkAccount(owner);
      const known = current.matchingTrack(track);
      if (known) {
        matches[index] = known;
      } else {
        try {
          const match = await matchWithRetry(track, signal);
          if (match.status === "approved") matches[index] = match.track;
          else if (match.reason === "catalog_lookup_failed") lookupErrors++;
        } catch (error) {
          if (signal?.aborted || isRateLimit(error)) throw error;
          lookupErrors++;
        }
      }
      signal?.throwIfAborted();
      onProgress({ phase: "matching", done: ++done, total: tracks.length });
    });
    signal?.throwIfAborted();
    checkAccount(owner);
    const matched = matches.filter((track): track is Track => Boolean(track));
    if (matched.length === 0 && lookupErrors > 0) throw new YandexImportError("matching_unavailable");
    const skipped = total - matched.length;
    if (matched.length === 0) return { playlistId: existing?.id, added: 0, skipped };

    // Read the current playlist again before appending. An edit made while
    // catalog matching was running should be reflected in the duplicate check.
    const latest = existing ? await api.getUserPlaylist(existing.id) : null;
    signal?.throwIfAborted();
    checkAccount(owner);
    const contents = new TrackIndex(latest?.items.map(({ track }) => canonicalSnapshot(track)));
    const missing = matched.filter((track) => {
      if (contents.has(track)) return false;
      contents.add(track);
      return true;
    });
    onProgress({ phase: "saving", done: 0, total: missing.length });
    let playlistId = existing?.id;
    let added = 0;
    try {
      if (!playlistId) {
        const saved = await trackPendingWrite(finalizeImportedPlaylist(title, importedPlaylistDescription("yandex"), missing, signal));
        playlistId = saved.playlistId;
        added = saved.saved;
      } else if (missing.length > 0) {
        added = await trackPendingWrite(appendImportedPlaylistTracks(playlistId, missing, signal));
      }
    } finally {
      if (accountKey() === owner) notifyLibraryChanged();
    }
    signal?.throwIfAborted();
    checkAccount(owner);
    if (!alsoLike) return { playlistId, added, skipped };

    try {
      const likes = await trackPendingWrite(copyToLikes(owner, matched, signal));
      return { playlistId, added, skipped, likes };
    } catch {
      signal?.throwIfAborted();
      return { playlistId, added, skipped, likesUnavailable: true };
    }
  } finally {
    importing = false;
  }
}
