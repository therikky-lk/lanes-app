import { PlaybackRateLimitError } from "@/shared/media/playbackRateLimit";
import { getAuthSession } from "@/shared/api/auth-session";
import { resolveDirectAudioStream, toVideoId, type InnertubeProfile } from "@/shared/media/innertube";
import { prefersAccountPlayback, isYoutubeSignedIn, TV_ACCOUNT_PROFILE, PLAYBACK_PROFILES } from "@/shared/media/youtube";
import { resolveSoundCloudStream, toSoundCloudTrackId } from "@/shared/media/soundcloud";
import { resolveLinerStream } from "@/shared/media/liner/linerPlayback";
import { isAbortError } from "@/shared/utils/abort";
import { log } from "@/shared/utils/logger";
import { isNativeApp } from "@/shared/platform/native";
import { diag } from "@/shared/platform/diag";
import {
  fromInnertubeStream,
  fromLinerStream,
  fromSoundCloudStream,
  type PlayableTrack,
  type PlaybackStream,
} from "./playbackStream";
import { findYoutubeStandIn } from "./youtubeStandIn";
import { findSoundCloudStandIn } from "./soundcloudStandIn";
import { getLocalTrack, isLocalTrackId } from "@/shared/media/local/localTracks";
import { audiusStreamUrl, isAudiusId } from "@/shared/media/audius";
import type { AudioQuality } from "../store/playerStore";

export type { BufferedPlaybackStream, PlayableTrack, PlaybackStream, UrlPlaybackStream } from "./playbackStream";

function audioOptions(quality: AudioQuality) {
  return {
    preferredCodec: quality === "low" || quality === "standard" ? ("aac" as const) : ("opus" as const),
    preferHighest: quality === "lossless",
  };
}

async function resolveYoutubeStandIn(track: PlayableTrack, signal?: AbortSignal, quality: AudioQuality = "high"): Promise<PlaybackStream> {
  const videoId = await findYoutubeStandIn(track, signal);
  if (!videoId) throw new Error("No matching YouTube track found");
  log("cyan", "playback", `playing youtube stand-in ${videoId} for "${track.title}"`);
  return fromInnertubeStream(await resolveDirectAudioStream(videoId, { signal, ...audioOptions(quality) }));
}

async function resolveSoundCloud(track: PlayableTrack, signal?: AbortSignal): Promise<PlaybackStream> {
  try {
    return fromSoundCloudStream(await resolveSoundCloudStream(track.id, { signal }));
  } catch (soundCloudError) {
    if (soundCloudError instanceof PlaybackRateLimitError || isAbortError(soundCloudError, signal)) throw soundCloudError;
    log("yellow", "playback", `soundcloud resolution failed, searching youtube: ${String(soundCloudError)}`);
    try {
      return await resolveYoutubeStandIn(track, signal);
    } catch (standInError) {
      if (isAbortError(standInError, signal)) throw standInError;
      throw soundCloudError;
    }
  }
}

/** YouTube failed (region lock, blocked network): try the same song on SoundCloud */
async function withSoundCloudFallback(
  track: PlayableTrack,
  primary: () => Promise<PlaybackStream>,
  signal?: AbortSignal,
): Promise<PlaybackStream> {
  try {
    return await primary();
  } catch (youtubeError) {
    if (youtubeError instanceof PlaybackRateLimitError || isAbortError(youtubeError, signal)) throw youtubeError;
    try {
      const scId = await findSoundCloudStandIn(track, signal);
      if (scId) {
        log("cyan", "playback", `youtube failed, playing soundcloud stand-in ${scId} for "${track.title}"`);
        return fromSoundCloudStream(await resolveSoundCloudStream(scId, { signal }));
      }
    } catch (scError) {
      if (isAbortError(scError, signal)) throw scError;
      log("yellow", "playback", `soundcloud fallback failed: ${String(scError)}`);
    }
    throw youtubeError;
  }
}

async function resolveYoutubeTrack(track: PlayableTrack, videoId: string, signal?: AbortSignal, quality: AudioQuality = "high"): Promise<PlaybackStream> {
  signal?.throwIfAborted();
  const serverController = new AbortController();
  const directController = new AbortController();
  const serverSignal = signal ? AbortSignal.any([signal, serverController.signal]) : serverController.signal;
  const directSignal = signal ? AbortSignal.any([signal, directController.signal]) : directController.signal;
  const startedAt = performance.now();
  let directError: unknown;
  // Neither a slow catalog probe nor a missing server copy should delay YouTube.
  const server = resolveLinerStream(videoId, serverSignal).then(liner => {
    if (!liner) {
      if (isNativeApp()) diag(`stream source: server miss in ${Math.round(performance.now() - startedAt)}ms`);
      throw new Error("No server audio");
    }
    if (isNativeApp()) diag(`stream source: server hit in ${Math.round(performance.now() - startedAt)}ms`);
    return fromLinerStream(liner, track);
  });
  const directStartedAt = startedAt;
  const direct = withSoundCloudFallback(track, async () => {
    if (isYoutubeSignedIn() && prefersAccountPlayback()) {
      const profiles: readonly InnertubeProfile[] = [TV_ACCOUNT_PROFILE, ...PLAYBACK_PROFILES];
      try {
        return fromInnertubeStream(await resolveDirectAudioStream(videoId, { signal: directSignal, profiles, ...audioOptions(quality) }));
      } catch (error) {
        if (error instanceof PlaybackRateLimitError || isAbortError(error, directSignal)) throw error;
        log("yellow", "playback", `YouTube account playback failed, using public playback: ${String(error)}`);
      }
    }
    return fromInnertubeStream(await resolveDirectAudioStream(videoId, { signal: directSignal, ...audioOptions(quality) }));
  }, directSignal).then(stream => {
    if (isNativeApp()) diag(`stream source: direct resolved in ${Math.round(performance.now() - directStartedAt)}ms`);
    return stream;
  }).catch(error => {
    directError = error;
    if (isNativeApp() && !isAbortError(error, directSignal)) diag(`stream source: direct failed after ${Math.round(performance.now() - directStartedAt)}ms (${String(error).slice(0, 100)})`);
    throw error;
  });
  try {
    const stream = await Promise.any([server, direct]);
    signal?.throwIfAborted();
    return stream;
  } catch (error) {
    signal?.throwIfAborted();
    throw directError ?? error;
  } finally {
    serverController.abort();
    directController.abort();
  }
}

async function resolveStream(track: PlayableTrack, signal?: AbortSignal, quality: AudioQuality = "high"): Promise<PlaybackStream> {
  if (isLocalTrackId(track.id)) {
    // the user's own file: play the stored Blob, never look for a stand-in
    const record = await getLocalTrack(track.id);
    if (!record) throw new Error("This uploaded track is no longer on this device");
    return { blob: record.blob, mimeType: record.mimeType, codec: "", bitrate: 0, expiresAtMs: null, contentLength: record.size };
  }
  if (toSoundCloudTrackId(track.id)) return resolveSoundCloud(track, signal);
  if (isAudiusId(track.id)) {
    // the API answers with a redirect to the artist's mp3 on a content node
    log("cyan", "playback", `playing "${track.title}" from Audius`);
    return { url: audiusStreamUrl(track.id), mimeType: "audio/mpeg", codec: "mp3", bitrate: 320, expiresAtMs: null };
  }
  const videoId = toVideoId(track.id);
  if (videoId) return resolveYoutubeTrack(track, videoId, signal, quality);
  return withSoundCloudFallback(track, () => resolveYoutubeStandIn(track, signal, quality), signal);
}


// A manual Next and look-ahead can ask for the same stream at the same time.
// A caller may stop waiting without cancelling the lookup for the other one.
const resolvingStreams = new Map<string, Promise<PlaybackStream>>();

export async function resolvePlaybackStream(
  track: PlayableTrack,
  signal?: AbortSignal,
  quality: AudioQuality = "high",
): Promise<PlaybackStream> {
  signal?.throwIfAborted();
  const session = getAuthSession();
  const key = JSON.stringify([
    track.id, quality, session?.authBackend, session?.user?.id,
    isYoutubeSignedIn(), prefersAccountPlayback(),
  ]);
  let request = resolvingStreams.get(key);
  if (!request) {
    request = resolveStream(track, undefined, quality).finally(() => resolvingStreams.delete(key));
    resolvingStreams.set(key, request);
  }
  if (!signal) return request;
  let onAbort!: () => void;
  const cancelled = new Promise<never>((_, reject) => {
    onAbort = () => reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
  try {
    return await Promise.race([request, cancelled]);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}
