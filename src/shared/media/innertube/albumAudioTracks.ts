import type { Track } from "@/shared/contracts";
import { sameArtistName } from "@/shared/media/artistIdentity";
import { isVideoTrack } from "@/shared/media/isVideoTrack";
import { searchRaw } from "./innertubeSearch";

const key = (value: string) => value.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
const catalogKey = (value: string) => key(value).replace(/(?<![\p{L}\p{N}])а(?=\d+\b)/gu, "a");
const FEATURE_SUFFIX = /\s*\((?:feat\.?|ft\.?)\s+([^)]+)\)\s*$/iu;
const releaseKey = (value: string) => catalogKey(value).replace(FEATURE_SUFFIX, "");
const features = (value: string) => catalogKey(value).match(/\((?:feat\.?|ft\.?)\s+([^)]+)\)/iu)?.[1]
  .split(/\s*(?:,|&)\s*/).filter(Boolean) ?? [];

function sameRecordingCredit(left: string, right: string, verifiedRelease: boolean): boolean {
  return sameArtistName(left, right) ||
    (verifiedRelease && /^[aа]\d+$/iu.test(key(right)) && catalogKey(left) === catalogKey(right));
}

function useVerifiedMetadata(metadata: Track, recording: Track): Track {
  const artists = [...recording.artists];
  if (metadata.catalogUnavailable) {
    for (const credit of metadata.artists) {
      if (!credit.id.startsWith("apple-artist:")) continue;
      const index = artists.findIndex(artist => sameRecordingCredit(artist.name, credit.name, true));
      if (index >= 0) artists[index] = credit;
      else if (features(recording.title).includes(catalogKey(credit.name))) artists.push(credit);
    }
  }
  return { ...recording, artists, cover: metadata.cover ?? recording.cover, album: metadata.album ?? recording.album };
}

export function findAlbumAudioTrack(video: Track, candidates: Track[], durationTolerance?: number): Track | undefined {
  const fromMetadata = durationTolerance !== undefined;
  const matches = candidates.filter(track => {
    const sameAlbum = !!track.album && !!video.album &&
      ((!!track.album.id && track.album.id === video.album.id) ||
        (fromMetadata ? releaseKey(track.album.title) === releaseKey(video.album.title) : key(track.album.title) === key(video.album.title)));
    const sameCredit = track.artists.some(credit => video.artists.some(artist =>
      (credit.id && credit.id === artist.id) || sameRecordingCredit(credit.name, artist.name, fromMetadata && sameAlbum),
    ));
    const sameFeature = fromMetadata && sameAlbum && features(track.title).some(name => features(video.title).includes(name));
    return track.id !== video.id && !track.catalogUnavailable && !isVideoTrack(track) &&
    (track.musicVideoType === "MUSIC_VIDEO_TYPE_ATV" || track.musicVideoType === "MUSIC_VIDEO_TYPE_OFFICIAL_SOURCE_MUSIC") &&
    (fromMetadata ? catalogKey(track.title) === catalogKey(video.title) : key(track.title) === key(video.title)) &&
    (durationTolerance === undefined || (track.durationMs > 0 && Math.abs(track.durationMs - video.durationMs) <= durationTolerance)) &&
    (sameCredit || sameFeature) && (!video.album || sameAlbum);
  });
  const byId = new Map(matches.map(track => [track.id, track]));
  return byId.size === 1 ? byId.values().next().value : undefined;
}

/** Replace video entries with confirmed album audio, never with a guessed recording. */
export async function resolveAlbumAudioTracks(tracks: Track[], signal?: AbortSignal, keepUnavailable = false): Promise<Track[]> {
  const needsAudio = (track: Track) => track.catalogUnavailable || isVideoTrack(track);
  const audio = tracks.filter(track => !needsAudio(track));
  const results = [...tracks];
  const deadline = AbortSignal.timeout(6500);
  const lookupSignal = signal ? AbortSignal.any([signal, deadline]) : deadline;
  let cursor = 0;
  const work = async () => {
    while (cursor < tracks.length && !deadline.aborted) {
      signal?.throwIfAborted();
      const index = cursor++;
      const video = tracks[index];
      if (!needsAudio(video)) continue;
      const tolerance = video.catalogUnavailable ? 3000 : undefined;
      const local = findAlbumAudioTrack(video, audio, tolerance);
      if (local) {
        results[index] = useVerifiedMetadata(video, local);
        continue;
      }
      const feature = video.catalogUnavailable ? video.title.match(FEATURE_SUFFIX) : null;
      const query = [
        feature ? video.title.replace(FEATURE_SUFFIX, "") : video.title,
        feature?.[1] ?? video.artists[0]?.name,
        video.catalogUnavailable ? undefined : video.album?.title,
      ].filter(Boolean).join(" ");
      const candidates = await searchRaw(query, "track", lookupSignal).catch(() => []);
      signal?.throwIfAborted();
      const replacement = findAlbumAudioTrack(video, candidates.flatMap(item => item.type === "track" ? [item] : []), tolerance);
      if (replacement) results[index] = useVerifiedMetadata(video, replacement);
    }
  };
  const videoCount = tracks.length - audio.length;
  await Promise.all(Array.from({ length: Math.min(3, videoCount) }, work));
  const seen = new Set<string>();
  return results.flatMap(track => {
    if (seen.has(track.id)) return [];
    seen.add(track.id);
    if (!needsAudio(track)) return [track];
    if (!keepUnavailable) return [];
    if (track.catalogUnavailable) return [track];
    return [{ ...track, id: `unavailable:${track.id}`, durationMs: 0, musicVideoType: undefined, catalogUnavailable: true }];
  });
}
