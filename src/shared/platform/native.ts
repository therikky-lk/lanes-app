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

    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
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
    return original(input, { ...init, headers });
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
  if (streamUserAgent) headers["User-Agent"] = streamUserAgent;
  return headers;
}
