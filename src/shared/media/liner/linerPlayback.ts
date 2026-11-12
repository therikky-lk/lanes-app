import { diag } from "@/shared/platform/diag";
import { isNativeApp, nativeResponseTiming } from "@/shared/platform/native";
import { recordPlaybackRateLimit } from "@/shared/media/playbackRateLimit";
import { getAuthSession, getValidAccessToken } from "@/shared/api/auth-session";
import { getApiBaseUrlForAuthBackend } from "@/shared/api/baseUrl";
import { signApiRequest } from "@/shared/api/requestSigner";
import { syncServerTime } from "@/shared/api/serverTime";
import { isAbortError } from "@/shared/utils/abort";
import { log } from "@/shared/utils/logger";

export interface LinerAudioStream {
  url: string;
  expiresAt: string;
  mimeType: string;
  codec?: string;
  size: number;
}

const REQUEST_TIMEOUT_MS = 5_000;
const UNAVAILABLE_BACKOFF_MS = 10 * 60_000;

let pausedUntil = 0;
let consecutiveMisses = 0;
const missingTracks = new Map<string, number>();

function pause(ms: number, reason: string): void {
  pausedUntil = Math.max(pausedUntil, Date.now() + ms);
  log("yellow", "playback", `liner audio paused for ${Math.round(ms / 1000)}s: ${reason}`);
}

// presigned r2 url, or null so the caller falls back to youtube
export async function resolveLinerStream(videoId: string, signal?: AbortSignal): Promise<LinerAudioStream | null> {
  signal?.throwIfAborted();
  if (Date.now() < pausedUntil || Date.now() < (missingTracks.get(videoId) ?? 0) || !getAuthSession()?.accessToken) return null;
  const startedAt = performance.now();
  try {
    const token = await getValidAccessToken();
    if (!token || Date.now() < pausedUntil) return null;
    const path = `/v1/tracks/${encodeURIComponent(videoId)}/playback`;
    const requestBody = "{}";
    const tokenReadyAt = performance.now();
    const signedHeaders = await signApiRequest("POST", path, requestBody);
    const requestAt = performance.now();
    const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const res = await fetch(`${getApiBaseUrlForAuthBackend(getAuthSession()?.authBackend)}${path}`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...signedHeaders },
      body: requestBody,
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    const responseAt = performance.now();
    const dateHeader = res.headers.get("date");
    if (dateHeader) syncServerTime(dateHeader);
    if (res.status === 204) {
      pausedUntil = Date.now() + UNAVAILABLE_BACKOFF_MS;
      return null;
    }
    if (res.ok) {
      consecutiveMisses = 0;
      const stream = (await res.json()) as LinerAudioStream;
      if (isNativeApp()) {
        const server = (res.headers.get("server-timing") ?? "").split(",")
          .map(item => /^\s*([\w-]+)\s*;\s*dur=([\d.]+)/i.exec(item))
          .filter(match => match && Number.isFinite(Number(match[2])))
          .slice(0, 5).map(match => `${match![1]}:${match![2]}ms`).join(",");
        const native = nativeResponseTiming(res);
        const responseMs = Math.round(responseAt - requestAt);
        const transport = native
          ? `headers=${native.headersMs}ms body=${native.bodyMs}ms bridge+queue=${Math.max(0, responseMs - native.headersMs - native.bodyMs)}ms`
          : `response=${responseMs}ms`;
        diag(`server hit timings: token=${Math.round(tokenReadyAt - startedAt)}ms sign=${Math.round(requestAt - tokenReadyAt)}ms ${transport} urlParse=${Math.round(performance.now() - responseAt)}ms serverTiming=${server || "unavailable"}`);
      }
      return stream;
    }

    const body = (await res.json().catch(() => ({}))) as { code?: string; retryAfterSeconds?: number };
    if (res.status === 404 && body.code === "PLAYBACK_NOT_FOUND") {
      missingTracks.delete(videoId);
      missingTracks.set(videoId, Date.now() + UNAVAILABLE_BACKOFF_MS);
      if (missingTracks.size > 256) missingTracks.delete(missingTracks.keys().next().value!);
      // A sparse server catalog should not receive an ingest request for every
      // track in a background queue. Probe it again after a short cooldown.
      if (++consecutiveMisses >= 3) {
        consecutiveMisses = 0;
        pause(60_000, "tracks absent from server catalog");
      }
      return null;
    }
    if (res.status === 429) {
      const limited = recordPlaybackRateLimit(res, "liner", Math.max(1, body.retryAfterSeconds ?? 60) * 1000);
      pause(Math.max(0, limited.retryAt - Date.now()), "rate limited");
    }
    else if (res.status === 400 || res.status === 401 || res.status === 403 || res.status === 404 || res.status === 415 || res.status >= 500) pause(UNAVAILABLE_BACKOFF_MS, `api answered ${res.status}`);
    return null;
  } catch (error) {
    if (isAbortError(error, signal) && signal?.aborted) throw error;
    pause(30_000, "network failure");
    log("yellow", "playback", `liner audio lookup failed, using youtube: ${String(error)}`);
    return null;
  }
}

export function resetLinerPlaybackPause(): void {
  pausedUntil = 0;
  consecutiveMisses = 0;
  missingTracks.clear();
}
