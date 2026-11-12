const CORS_HEADERS = new Set([
  "access-control-allow-origin",
  "access-control-allow-headers",
  "access-control-allow-methods",
  "access-control-allow-credentials",
  "access-control-expose-headers",
  "access-control-max-age",
]);

const PREFLIGHT_STATUS_LINE = "HTTP/1.1 200 OK";
const OPEN_CORS_DOMAINS = [
  "tryliner.fun", "youtube.com", "googlevideo.com", "ytimg.com", "ggpht.com",
  "googleusercontent.com", "soundcloud.com", "sndcdn.com", "soundcloud.cloud",
  "spotify.com", "spotifycdn.com", "spotify.link", "scdn.co", "deezer.com",
  "dzcdn.net", "music.apple.com", "mzstatic.com", "genius.com",
  "r2.cloudflarestorage.com", "fonts.googleapis.com", "fonts.gstatic.com",
  "audius.co", "lrclib.net", "yandex.ru", "api.music.yandex.net", "ntfy.sh", "ntfy.envs.net",
  "marketingtools.apple.com", "lane-app.site", "yt.chocolatemoo53.com",
];
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function needsOpenCors(url: string, allowLoopback = false): boolean {
  let host: string;
  try { host = new URL(url).hostname; } catch { return false; }
  if (allowLoopback && LOOPBACK_HOSTS.has(host)) return true;
  return OPEN_CORS_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

export function keepsOwnCors(url: string, allowLoopback = false): boolean {
  let host: string;
  try { host = new URL(url).hostname; } catch { return false; }
  if (allowLoopback && LOOPBACK_HOSTS.has(host)) return true;
  return host === "tryliner.fun" || host.endsWith(".tryliner.fun");
}

export type ResponseHeaders = Record<string, string[]>;
export interface CorsResponse { responseHeaders: ResponseHeaders; statusLine?: string; }

function allowsCredentials(headers: ResponseHeaders | undefined): boolean {
  return Object.entries(headers ?? {}).some(([name, value]) =>
    name.toLowerCase() === "access-control-allow-credentials" &&
    value.some((entry) => entry.trim().toLowerCase() === "true"),
  );
}

export function withOpenCors(
  headers: ResponseHeaders | undefined,
  method: string,
  ownCors = false,
): CorsResponse {
  if (ownCors && headers && allowsCredentials(headers)) return { responseHeaders: headers };
  const responseHeaders: ResponseHeaders = {};
  for (const [name, value] of Object.entries(headers ?? {})) {
    if (!CORS_HEADERS.has(name.toLowerCase())) responseHeaders[name] = value;
  }
  responseHeaders["access-control-allow-origin"] = ["*"];
  responseHeaders["access-control-allow-headers"] = ["*, authorization"];
  responseHeaders["access-control-allow-methods"] = ["GET, HEAD, POST, OPTIONS"];
  return method === "OPTIONS"
    ? { responseHeaders, statusLine: PREFLIGHT_STATUS_LINE }
    : { responseHeaders };
}
