import { rememberStreamUserAgent, setStreamUserAgent } from "@/shared/platform/native";
import { InnertubeError, postInnertube, type InnertubeProfile } from "./innertubeClient";
import { PLAYBACK_PROFILES } from "./playbackProfiles";
import { resetClientVisitorData } from "@/shared/api/visitorSession";
import { log } from "@/shared/utils/logger";
import { getWebPlayer, resetWebRemixSession, resolveWebRemixAudioStream } from "./webRemixAudio";
import { resolveInvidiousAudioStream } from "./invidiousFallback";
import { isBrowserRuntime } from "@/shared/platform/browser";
import { isNativeApp } from "@/shared/platform/native";
import { diag } from "@/shared/platform/diag";
import {
  extractAudioFormats,
  playabilityError,
  requiresBotCheck,
  selectBestAudioFormat,
  toResolvedStream,
  type ResolvedAudioStream,
} from "./innertubeAudioFormats";

export type { ResolvedAudioStream } from "./innertubeAudioFormats";

export { ANDROID_VR_PROFILE, PLAYBACK_PROFILES, TV_ACCOUNT_PROFILE, TV_PROFILE, VISIONOS_PROFILE } from "./playbackProfiles";

let lastWorkingProfile: InnertubeProfile | null = null;

export function resetPlaybackProfilePreference(): void {
  lastWorkingProfile = null;
  webRemixRetryAt = 0;
  webRemixFailures = 0;
}

function orderedProfiles(profiles: readonly InnertubeProfile[]): readonly InnertubeProfile[] {
  if (!lastWorkingProfile || !profiles.includes(lastWorkingProfile)) return profiles;
  return [lastWorkingProfile, ...profiles.filter((profile) => profile !== lastWorkingProfile)];
}

const PROBE_OFFSET = 1_048_576 + 4096;
const WEB_REMIX_COOLDOWN_MS = 5 * 60 * 1000;

const WEB_REMIX_ATTEMPTS = 2;
const WEB_REMIX_FAILURES_BEFORE_COOLDOWN = 3;

let webRemixRetryAt = 0;
let webRemixFailures = 0;
let lastWebRemixError = "";

/**
 * Other hosts that serve the same googlevideo URL. A stream is assigned to a
 * cache node inside the viewer's ISP first (the first entry of `mn`); when that
 * node is blocked or unreachable, YouTube's own player falls back to the next
 * `mn` node (usually on Google's network) and then to the redirector.
 */
export function streamHostCandidates(url: string): string[] {
  const out = [url];
  try {
    const parsed = new URL(url);
    const match = parsed.hostname.match(/^(rr\d+)---(sn-[a-z0-9-]+)\.googlevideo\.com$/i);
    const mirrors = (parsed.searchParams.get("mn") ?? "").split(",").map((m) => m.trim()).filter(Boolean);
    if (match) {
      const [, rr] = match;
      for (const node of mirrors) {
        const host = `${rr}---${node}.googlevideo.com`;
        if (host.toLowerCase() === parsed.hostname.toLowerCase()) continue;
        const alt = new URL(url);
        alt.hostname = host;
        alt.searchParams.set("fallback_count", String(out.length));
        out.push(alt.toString());
      }
    }
    if (parsed.hostname.endsWith(".googlevideo.com") && parsed.hostname !== "redirector.googlevideo.com") {
      const redirector = new URL(url);
      redirector.hostname = "redirector.googlevideo.com";
      out.push(redirector.toString());
    }
  } catch {}
  return out;
}

async function probeStream(url: string, contentLength: number | undefined, signal?: AbortSignal): Promise<void> {
  const probe = new URL(url);
  const offset = contentLength && contentLength > PROBE_OFFSET ? PROBE_OFFSET : 0;
  probe.searchParams.set("range", `${offset}-${offset}`);
  const response = await fetch(probe.toString(), { signal });
  await response.body?.cancel().catch(() => undefined);
  if (!response.ok) throw new InnertubeError(`stream url rejected with ${response.status}`, response.status);
}

/** checks the stream answers and returns the URL that did (maybe a fallback node) */
async function assertStreamReachable(url: string, contentLength: number | undefined, signal?: AbortSignal): Promise<string> {
  let lastError: unknown = null;
  for (const candidate of streamHostCandidates(url)) {
    try {
      await probeStream(candidate, contentLength, signal);
      return candidate;
    } catch (error) {
      if (signal?.aborted) throw error;
      lastError = error;
      // a 403 means the URL itself is refused: other nodes won't change that
      if (error instanceof InnertubeError && error.status === 403) throw error;
    }
  }
  throw lastError instanceof Error ? lastError : new InnertubeError("stream unreachable", 502);
}

async function resolveViaWebRemix(
  videoId: string,
  options: ResolveAudioOptions,
  failures: string[],
): Promise<ResolvedAudioStream | null> {
  for (let attempt = 0; attempt < WEB_REMIX_ATTEMPTS; attempt += 1) {
    const attemptStartedAt = performance.now();
    try {
      const stream = await resolveWebRemixAudioStream(videoId, options);
      // the stream is tied to the client that asked for it: the WebView's own UA
      const ua = typeof navigator !== "undefined" ? navigator.userAgent : undefined;
      setStreamUserAgent(ua);
      // tied to this URL before the probe: another resolve running at the same
      // time may change the "latest" UA in between
      rememberStreamUserAgent(stream.url, ua);
      stream.url = await assertStreamReachable(stream.url, stream.contentLength, options.signal);
      rememberStreamUserAgent(stream.url, ua);
      webRemixFailures = 0;
      if (isNativeApp()) diag(`stream resolve: WEB_REMIX succeeded in ${Math.round(performance.now() - attemptStartedAt)}ms`);
      return stream;
    } catch (error) {
      if (options.signal?.aborted) throw error;
      resetWebRemixSession();
      const message = error instanceof Error ? error.message : String(error);
      lastWebRemixError = message;
      failures.push(`WEB_REMIX: ${message}`);
      log("yellow", "playback", `WEB_REMIX attempt ${attempt + 1} failed: ${message}`);
      if (isNativeApp()) diag(`stream resolve: WEB_REMIX attempt ${attempt + 1} failed in ${Math.round(performance.now() - attemptStartedAt)}ms (${message.slice(0, 90)})`);
      // A 4xx playability result (age gate, unavailable/private video, etc.)
      // is about this video, not a transient request failure. Repeating the
      // same WEB_REMIX request only adds latency before trying other clients.
      if (error instanceof InnertubeError && error.status >= 400 && error.status < 500) break;
    }
  }
  webRemixFailures += 1;
  if (webRemixFailures >= WEB_REMIX_FAILURES_BEFORE_COOLDOWN) {
    webRemixRetryAt = Date.now() + WEB_REMIX_COOLDOWN_MS;
    webRemixFailures = 0;
    log("yellow", "playback", "WEB_REMIX keeps failing, using app profiles for 5 min");
  }
  return null;
}

export interface ResolveAudioOptions {
  signal?: AbortSignal;
  preferredCodec?: "opus" | "aac";
  preferHighest?: boolean;
  profiles?: readonly InnertubeProfile[];
}

export function toVideoId(trackId: string): string | null {
  const videoId = trackId.replace(/^yt:/, "");
  return /^[a-zA-Z0-9_-]{11}$/.test(videoId) ? videoId : null;
}

async function resolveWithProfile(
  videoId: string,
  profile: InnertubeProfile,
  options: ResolveAudioOptions,
): Promise<ResolvedAudioStream> {
  const player = profile.requiresJsPlayer ? await getWebPlayer() : null;
  const request = () =>
    postInnertube("player", {
      videoId,
      contentCheckOk: true,
      racyCheckOk: true,
      ...(player ? { playbackContext: { contentPlaybackContext: { signatureTimestamp: player.signature_timestamp } } } : {}),
    }, { profile, signal: options.signal });
  let response = await request();
  if (requiresBotCheck(response)) {
    resetClientVisitorData();
    response = await request();
  }
  const unplayable = playabilityError(response);
  if (unplayable) throw new InnertubeError(unplayable, 403);
  const formats = extractAudioFormats(response).filter((format) => player || format.url);
  const best = selectBestAudioFormat(formats, options.preferredCodec, options.preferHighest);
  if (!best) throw new InnertubeError(`${profile.clientName} returned no direct audio formats.`, 502);
  const url = player
    ? await player.decipher(best.url || undefined, best.signatureCipher)
    : best.url;
  if (!url) throw new InnertubeError(`${profile.clientName} stream url could not be deciphered.`, 502);
  const stream = toResolvedStream({ ...best, url });
  // googlevideo checks the stream against the client that asked for it (Android app only)
  setStreamUserAgent(profile.userAgent);
  rememberStreamUserAgent(stream.url, profile.userAgent);
  stream.url = await assertStreamReachable(stream.url, stream.contentLength, options.signal);
  rememberStreamUserAgent(stream.url, profile.userAgent);
  return stream;
}

export async function resolveDirectAudioStream(
  trackId: string,
  options: ResolveAudioOptions = {},
): Promise<ResolvedAudioStream> {
  const videoId = toVideoId(trackId);
  if (!videoId) throw new InnertubeError(`Track ${trackId} is not a YouTube video.`, 400);
  if (isBrowserRuntime() && !options.profiles) {
    return resolveInvidiousAudioStream(videoId, options.signal, options);
  }
  const failures: string[] = [];
  if (!options.profiles && Date.now() >= webRemixRetryAt) {
    const stream = await resolveViaWebRemix(videoId, options, failures);
    if (stream) return stream;
  } else if (!options.profiles) {
    failures.push(`WEB_REMIX paused: ${lastWebRemixError}`);
  }
  // Explicit profile lists are ordered by the caller (for example, signed-in
  // YouTube TV first); only the default public list follows the last good client.
  for (const profile of options.profiles ?? orderedProfiles(PLAYBACK_PROFILES)) {
    const profileStartedAt = performance.now();
    try {
      const stream = await resolveWithProfile(videoId, profile, options);
      lastWorkingProfile = profile;
      if (isNativeApp()) diag(`stream resolve: ${profile.clientName} succeeded in ${Math.round(performance.now() - profileStartedAt)}ms`);
      return stream;
    } catch (error) {
      if (options.signal?.aborted) throw error;
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${profile.clientName}: ${message}`);
      if (isNativeApp()) diag(`stream resolve: ${profile.clientName} failed in ${Math.round(performance.now() - profileStartedAt)}ms (${message.slice(0, 90)})`);
    }
  }
  try {
    return await resolveInvidiousAudioStream(videoId, options.signal, options);
  } catch (error) {
    if (options.signal?.aborted) throw error;
    failures.push(`Invidious: ${error instanceof Error ? error.message : String(error)}`);
  }
  throw new InnertubeError(`Direct audio resolution failed (${failures.join("; ")}).`, 502);
}
