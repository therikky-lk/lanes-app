import { appApiUserAgent } from "@/shared/api/appIdentity";
import { registerPlugin } from "@capacitor/core";
import { diag } from "./diag";
import { getApiBaseUrl } from "@/shared/api/baseUrl";
import { signApiRequest } from "@/shared/api/requestSigner";
import { syncServerTime } from "@/shared/api/serverTime";
// Lane on Android runs the same renderer inside Capacitor. Things Electron's
// main process does for the desktop app (CORS-free networking, request header
// rewriting) are done here instead.

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
}

export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

export function nativePlatform(): string | null {
  if (!isNativeApp()) return null;
  return (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor?.getPlatform?.() ?? null;
}

/** User-Agent of the YouTube client that produced the latest stream URL */
let streamUserAgent: string | undefined;
export function setStreamUserAgent(ua: string | undefined): void {
  streamUserAgent = ua;
}

// googlevideo refuses a stream (403 at byte 0) fetched with another client's
// User-Agent than the one that asked for it. Streams for the native look-ahead
// are resolved many at a time, by different clients (WEB_REMIX, ANDROID_VR…),
// so one shared "latest UA" handed the native player the wrong one: each
// stream keeps its own.
const userAgentByUrl = new Map<string, string>();
const USER_AGENTS_KEPT = 64;

/** the stream's identity: byte ranges / request counters added later don't change it */
function streamKey(url: string): string {
  try {
    const parsed = new URL(url);
    for (const p of ["range", "rn", "rbuf"]) parsed.searchParams.delete(p);
    return parsed.toString();
  } catch {
    return url;
  }
}

export function rememberStreamUserAgent(url: string, ua: string | undefined): void {
  if (!url || !ua) return;
  const key = streamKey(url);
  userAgentByUrl.delete(key);
  userAgentByUrl.set(key, ua);
  while (userAgentByUrl.size > USER_AGENTS_KEPT) userAgentByUrl.delete(userAgentByUrl.keys().next().value!);
}

function userAgentFor(url: string): string | undefined {
  return userAgentByUrl.get(streamKey(url)) ?? streamUserAgent;
}

const UA_OVERRIDE = "x-liner-user-agent";

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

// Android WebView can leave ordinary fetch requests to the Lane services
// hanging for ~15 seconds even while the device is online. Route the app's
// own HTTP services through the same native client as YouTube. This keeps
// authenticated playlist requests and cover sync independent from WebView
// CORS/network quirks.
function isNativeServiceUrl(url: string): boolean {
  const host = hostOf(url);
  if (!host) return false;
  const serviceHosts = new Set([
    hostOf(getApiBaseUrl()),
    "covers.tryliner.fun",
    "link.tryliner.fun",
    "music.yandex.ru",
    "rss.marketingtools.apple.com",
    "ntfy.sh",
    "ntfy.envs.net",
  ]);
  return serviceHosts.has(host);
}

/**
 * Wraps window.fetch (already routed through Capacitor's native HTTP) so that
 * requests carry the headers Electron's webRequest hook would add on desktop:
 * the real User-Agent of the client profile and a music.youtube.com origin.
 */
interface NativeHttpResponse {
  status: number;
  url: string;
  headers: Record<string, string>;
  body: string;
  via?: string;
}

// a Capacitor plugin proxy answers every property, `then` included, so it must
// never be returned from an async function (await would call "then" natively
// and hang forever): keep it in a plain module constant
export const laneHttp = isNativeApp() ? registerPlugin<{
  request(options: { url: string; method: string; headers: Record<string, string>; body?: string; withCookies?: boolean; transport?: "auto" | "java" }): Promise<NativeHttpResponse>;
}>("LaneHttp") : null;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function bodyToBase64(body: BodyInit | null | undefined): Promise<string | undefined> {
  if (body == null) return undefined;
  if (typeof body === "string") return bytesToBase64(new TextEncoder().encode(body));
  return bytesToBase64(new Uint8Array(await new Response(body).arrayBuffer()));
}

/** YouTube traffic goes through LaneHttp (see LaneHttpPlugin.java) */
async function nativeHttpFetch(url: string, method: string, headers: Headers, body: string | undefined, signal?: AbortSignal | null, withCookies = false, transport: "auto" | "java" = "auto"): Promise<Response> {
  if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
  const plain: Record<string, string> = {};
  headers.forEach((value, key) => {
    plain[key] = value;
  });
  const http = laneHttp;
  if (!http) throw new TypeError("LaneHttp is available only in the native app");
  const short = url.replace(/^https:\/\//, "").slice(0, 70);
  let res: NativeHttpResponse;
  try {
    const started = performance.now();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let abortListener: (() => void) | undefined;
    const aborted = new Promise<never>((_, reject) => {
      if (!signal) return;
      abortListener = () => reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      signal.addEventListener("abort", abortListener, { once: true });
    });
    try {
      res = await Promise.race([
      http.request({ url, method, headers: plain, body, withCookies, transport }),
      new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error("timed out after 40s")), 40_000); }),
        aborted,
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
      if (signal && abortListener) signal.removeEventListener("abort", abortListener);
    }
    const took = performance.now() - started;
    if (took > 8000) diag(`HTTP ${method} ${short} slow: ${Math.round(took / 1000)}s`);
  } catch (error) {
    if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
    diag(`HTTP ${method} ${short} failed: ${error instanceof Error ? error.message : String(error)}`);
    throw new TypeError(`Network error (${error instanceof Error ? error.message : String(error)})`);
  }
  if (res.status >= 400) {
    let snippet = "";
    try {
      snippet = new TextDecoder().decode(base64ToBytes(res.body).subarray(0, 600)).replace(/\s+/g, " ").slice(0, 160);
    } catch {}
    diag(`HTTP ${method} ${short} -> ${res.status} [${res.via ?? "?"}] ${snippet}`);
  }
  if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
  const nullBody = res.status === 204 || res.status === 304 || method === "HEAD";
  const response = new Response(nullBody ? null : (base64ToBytes(res.body) as Uint8Array<ArrayBuffer>), {
    status: res.status,
    headers: Object.entries(res.headers).filter(([k]) => k !== "content-encoding" && k !== "content-length"),
  });
  Object.defineProperty(response, "url", { value: res.url });
  return response;
}

export function installNativeFetchHeaders(): void {
  if (!isNativeApp() || (window as unknown as { __laneFetchWrapped?: boolean }).__laneFetchWrapped) return;
  (window as unknown as { __laneFetchWrapped?: boolean }).__laneFetchWrapped = true;
  const original = window.fetch.bind(window);

  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const host = hostOf(url);
    const isYoutube = host.endsWith("youtube.com");
    const isVideo = host.endsWith("googlevideo.com");
    const isNativeService = isNativeServiceUrl(url);
    if (!isYoutube && !isVideo && !isNativeService) return original(input, init);

    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    if (init?.headers) new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    const isApi = host === hostOf(getApiBaseUrl());
    const isAuth = isApi && new URL(url).origin === new URL(getApiBaseUrl()).origin && new URL(url).pathname.startsWith("/v1/auth/");
    // The official API rejects a plain WebView identity before login/register.
    // Apply the same app identity to challenge, auth and subsequent API calls.
    if (isApi) {
      const userAgent = headers.get("User-Agent") || navigator.userAgent;
      headers.set("User-Agent", new URL(url).origin === "https://api.tryliner.fun"
        ? appApiUserAgent(userAgent)
        : userAgent);
    }
    if (isAuth) headers.set("Accept", "application/json");
    const override = headers.get(UA_OVERRIDE);
    if (override) {
      headers.delete(UA_OVERRIDE);
      headers.set("User-Agent", override);
    } else if (isVideo && !headers.has("User-Agent")) {
      const ua = userAgentFor(url);
      if (ua) headers.set("User-Agent", ua);
    }
    if (isYoutube || isVideo) {
      const origin = host === "www.youtube.com" ? "https://www.youtube.com" : "https://music.youtube.com";
      headers.set("Origin", origin);
      headers.set("Referer", `${origin}/`);
      if (!headers.has("User-Agent")) headers.set("User-Agent", navigator.userAgent);
    }
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    return (async () => {
      let body = await bodyToBase64(init?.body);
      if (body === undefined && input instanceof Request && method !== "GET" && method !== "HEAD") {
        const buf = await input.clone().arrayBuffer();
        if (buf.byteLength) body = bytesToBase64(new Uint8Array(buf));
      }
      const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
      const withCookies = isAuth || (init?.credentials ?? (input instanceof Request ? input.credentials : "same-origin")) === "include";
      const transport = isAuth ? "java" : "auto";
      const response = await nativeHttpFetch(
        url,
        method,
        headers,
        body,
        signal,
        withCookies,
        transport,
      );

      // Retry only a confirmed edge rejection, once, using the other native
      // transport. Never send credentials through WebView or a third-party proxy.
      const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
      const server = response.headers.get("server")?.toLowerCase() ?? "";
      const isCloudflareChallenge =
        isNativeService &&
        host === hostOf(getApiBaseUrl()) &&
        response.status === 403 &&
        contentType.includes("text/html") &&
        (server.includes("cloudflare") || response.headers.has("cf-ray"));

      if (isCloudflareChallenge) {
        const rayId = response.headers.get("cf-ray");
        diag(`API ${method} ${url.replace(/^https?:\/\//, "").slice(0, 70)} blocked by Cloudflare via native ${transport}; cf-ray=${rayId ?? "unavailable"}; retrying alternate native transport`);
        try {
          const serverDate = response.headers.get("date");
          if (serverDate) syncServerTime(serverDate);
          if (headers.has("x-liner-signature")) {
            const retryBody = body ? new TextDecoder().decode(base64ToBytes(body)) : null;
            const retrySignedHeaders = await signApiRequest(
              method,
              new URL(url).pathname,
              retryBody,
            );
            for (const [name, value] of Object.entries(retrySignedHeaders)) {
              if (value) headers.set(name, value);
            }
          }
          // Reuse the exact bytes that were signed, including for Request inputs.
          const retryResponse = await nativeHttpFetch(url, method, headers, body, signal, withCookies, transport === "java" ? "auto" : "java");
          diag(`Native API retry -> ${retryResponse.status}${retryResponse.headers.get("cf-ray") ? `; cf-ray=${retryResponse.headers.get("cf-ray")}` : ""}`);
          return retryResponse;
        } catch (error) {
          if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
          diag(`Native API retry failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      return response;
    })();
  };
}

/** request headers the native player sends for a stream URL */
export function streamHeadersFor(url: string): Record<string, string> {
  const host = hostOf(url);
  if (!host.endsWith("googlevideo.com") && !host.endsWith("youtube.com")) return {};
  const headers: Record<string, string> = {
    Origin: "https://music.youtube.com",
    Referer: "https://music.youtube.com/",
  };
  const ua = userAgentFor(url) ?? (typeof navigator !== "undefined" ? navigator.userAgent : undefined);
  if (ua) headers["User-Agent"] = ua;
  return headers;
}
