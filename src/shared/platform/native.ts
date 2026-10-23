import { diag } from "./diag";
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

/** User-Agent of the YouTube client that produced the current stream URL */
let streamUserAgent: string | undefined;
export function setStreamUserAgent(ua: string | undefined): void {
  streamUserAgent = ua;
}

const UA_OVERRIDE = "x-liner-user-agent";

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
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
}

let laneHttp: { request(options: { url: string; method: string; headers: Record<string, string>; body?: string }): Promise<NativeHttpResponse> } | null = null;
async function getLaneHttp() {
  if (!laneHttp) {
    const { registerPlugin } = await import("@capacitor/core");
    laneHttp = registerPlugin("LaneHttp");
  }
  return laneHttp;
}

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
async function nativeHttpFetch(url: string, method: string, headers: Headers, body: string | undefined, signal?: AbortSignal | null): Promise<Response> {
  if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
  const plain: Record<string, string> = {};
  headers.forEach((value, key) => {
    plain[key] = value;
  });
  const http = (await getLaneHttp())!;
  const short = url.replace(/^https:\/\//, "").slice(0, 70);
  let res: NativeHttpResponse;
  try {
    res = await http.request({ url, method, headers: plain, body });
  } catch (error) {
    diag(`HTTP ${method} ${short} failed: ${error instanceof Error ? error.message : String(error)}`);
    throw new TypeError(`Network error (${error instanceof Error ? error.message : String(error)})`);
  }
  if (res.status >= 400) diag(`HTTP ${method} ${short} -> ${res.status}`);
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
    if (!isYoutube && !isVideo) return original(input, init);

    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    if (init?.headers) new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    const override = headers.get(UA_OVERRIDE);
    if (override) {
      headers.delete(UA_OVERRIDE);
      headers.set("User-Agent", override);
    } else if (isVideo && streamUserAgent && !headers.has("User-Agent")) {
      headers.set("User-Agent", streamUserAgent);
    }
    const origin = host === "www.youtube.com" ? "https://www.youtube.com" : "https://music.youtube.com";
    headers.set("Origin", origin);
    headers.set("Referer", `${origin}/`);
    if (!headers.has("User-Agent")) headers.set("User-Agent", navigator.userAgent);
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    return (async () => {
      let body = await bodyToBase64(init?.body);
      if (body === undefined && input instanceof Request && method !== "GET" && method !== "HEAD") {
        const buf = await input.clone().arrayBuffer();
        if (buf.byteLength) body = bytesToBase64(new Uint8Array(buf));
      }
      return nativeHttpFetch(url, method, headers, body, init?.signal ?? (input instanceof Request ? input.signal : undefined));
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
  const ua = streamUserAgent ?? (typeof navigator !== "undefined" ? navigator.userAgent : undefined);
  if (ua) headers["User-Agent"] = ua;
  return headers;
}
