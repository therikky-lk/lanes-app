// Importing the user's own Liked Songs needs their Spotify login. The login
// lives outside the page (Electron: a separate session; Android: the app
// cookie store); requests that need it are sent by the native side.
import { registerPlugin } from "@capacitor/core";
import { isNativeApp } from "@/shared/platform/native";
import type { ClientImportedTrack } from "../../importTypes";
import { buildSpotifyTokenUrl } from "./spotifyAuth";

export const SPOTIFY_LIKED_URL = "https://open.spotify.com/collection/tracks";

interface NativeHttpResult {
  status: number;
  body: string;
}

const LaneSpotify = registerPlugin<{
  hasLogin(): Promise<{ value: boolean }>;
  login(): Promise<{ value: boolean }>;
  logout(): Promise<void>;
}>("LaneSpotify");

const LaneHttp = registerPlugin<{
  request(options: { url: string; method: string; headers: Record<string, string>; withCookies?: boolean }): Promise<NativeHttpResult>;
}>("LaneHttp");

export function spotifyAccountSupported(): boolean {
  return isNativeApp() || Boolean(window.linerElectron?.spotifyLogin);
}

export async function spotifyHasLogin(): Promise<boolean> {
  if (isNativeApp()) return (await LaneSpotify.hasLogin()).value;
  return (await window.linerElectron?.spotifyHasLogin?.()) ?? false;
}

export async function spotifyLogin(): Promise<boolean> {
  if (isNativeApp()) return (await LaneSpotify.login()).value;
  return (await window.linerElectron?.spotifyLogin?.()) ?? false;
}

export async function spotifyLogout(): Promise<void> {
  if (isNativeApp()) await LaneSpotify.logout();
  else await window.linerElectron?.spotifyLogout?.();
  cachedToken = null;
}

/** GET with the Spotify login cookies attached */
async function fetchWithLogin(url: string): Promise<{ status: number; text: string }> {
  if (isNativeApp()) {
    const res = await LaneHttp.request({ url, method: "GET", headers: { accept: "application/json" }, withCookies: true });
    const bin = atob(res.body);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { status: res.status, text: new TextDecoder().decode(bytes) };
  }
  const res = await window.linerElectron?.spotifyFetch?.({ url, headers: { accept: "application/json" } });
  if (!res) throw new Error("Spotify login isn't available here");
  return { status: res.status, text: res.body };
}

let cachedToken: { token: string; expiresAt: number } | null = null;

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    }, { once: true });
  });

/**
 * Spotify said "too many requests". `retryAfterMs` is how long it asked to
 * wait (when it said so). Callers that can wait (the transfer) wait exactly
 * that long and go on; asking again sooner only extends the block.
 */
export class SpotifyRateLimitError extends Error {
  readonly status = 429;
  constructor(
    what: string,
    readonly retryAfterMs: number | undefined,
  ) {
    super(
      retryAfterMs
        ? `${what}: Spotify is rate-limiting (429), asked to wait ${Math.ceil(retryAfterMs / 60_000)} min`
        : `${what}: Spotify is rate-limiting (429)`,
    );
    this.name = "SpotifyRateLimitError";
  }
}

/** short waits are taken here; a longer one is handed to the caller */
const INLINE_WAIT_LIMIT_MS = 30_000;

/** Spotify answers 429 when asked too fast: wait as told (or back off) and retry */
async function withRateLimit<T>(
  run: () => Promise<{ status: number; retryAfter?: string | null; value?: T }>,
  what: string,
  signal?: AbortSignal,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await run();
    if (res.status !== 429 && res.status < 500) {
      if (res.value === undefined) throw new Error(`${what} failed (${res.status})`);
      return res.value;
    }
    const told = Number(res.retryAfter);
    const toldMs = Number.isFinite(told) && told > 0 ? told * 1000 : undefined;
    if (res.status === 429) {
      // asked to wait long, or still blocked after a few tries: don't keep
      // knocking (every early request extends Spotify's block)
      if ((toldMs ?? 0) > INLINE_WAIT_LIMIT_MS || attempt >= 3) throw new SpotifyRateLimitError(what, toldMs);
    } else if (attempt >= 4) {
      throw new Error(`${what} failed (${res.status})`);
    }
    const wait = toldMs ?? Math.min(3000 * 2 ** attempt, INLINE_WAIT_LIMIT_MS);
    await sleep(wait + Math.random() * 500, signal);
  }
}

/** the signed-in user's web player token (for playlists only they can see) */
export function spotifyUserToken(signal?: AbortSignal): Promise<string> {
  return userToken(signal);
}

async function userToken(signal?: AbortSignal): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) return cachedToken.token;
  const text = await withRateLimit(
    async () => {
      const res = await fetchWithLogin(await buildSpotifyTokenUrl(signal));
      return { status: res.status, value: res.status === 200 ? res.text : undefined };
    },
    "Spotify sign-in token",
    signal,
  );
  const data = JSON.parse(text) as { accessToken?: string; isAnonymous?: boolean; accessTokenExpirationTimestampMs?: number };
  if (!data.accessToken || data.isAnonymous) throw new Error("Not signed in to Spotify");
  cachedToken = { token: data.accessToken, expiresAt: data.accessTokenExpirationTimestampMs ?? Date.now() + 3_000_000 };
  return data.accessToken;
}

interface SavedTrackItem {
  track?: {
    id?: string;
    name?: string;
    duration_ms?: number;
    is_local?: boolean;
    artists?: { id?: string; name?: string }[];
    album?: { id?: string; name?: string; images?: { url?: string }[] };
  } | null;
}

async function likedPage(offset: number, limit: number, signal?: AbortSignal): Promise<{ total: number; items: SavedTrackItem[] }> {
  const data = await withRateLimit(
    async () => {
      const token = await userToken(signal);
      const res = await fetch(`https://api.spotify.com/v1/me/tracks?limit=${limit}&offset=${offset}`, {
        headers: { authorization: `Bearer ${token}`, accept: "application/json" },
        signal,
      });
      if (res.status === 401) cachedToken = null;
      return {
        status: res.status,
        retryAfter: res.headers.get("retry-after"),
        value: res.ok ? ((await res.json()) as { total?: number; items?: SavedTrackItem[] }) : undefined,
      };
    },
    "Spotify Liked Songs request",
    signal,
  );
  return { total: data.total ?? 0, items: data.items ?? [] };
}

export async function spotifyLikedCount(signal?: AbortSignal): Promise<number> {
  return (await likedPage(0, 1, signal)).total;
}

function mapSavedTrack(item: SavedTrackItem, position: number): ClientImportedTrack | null {
  const t = item.track;
  if (!t?.name || t.is_local) return null;
  const artists = (t.artists ?? []).map((a) => a.name ?? "").filter(Boolean);
  return {
    sourceId: t.id ?? `${t.name}-${position}`,
    title: t.name,
    artists: artists.length ? artists : ["Spotify Artist"],
    ...(t.album?.name ? { album: t.album.name } : {}),
    ...(t.album?.images?.[0]?.url ? { coverUrl: t.album.images[0].url } : {}),
    ...(t.duration_ms ? { durationMs: t.duration_ms } : {}),
  };
}

/** one page of Liked Songs (newest first), mapped for import */
export async function fetchSpotifyLikedPage(
  offset: number,
  limit: number,
  signal?: AbortSignal,
): Promise<{ total: number; count: number; tracks: ClientImportedTrack[] }> {
  const page = await likedPage(offset, limit, signal);
  const tracks: ClientImportedTrack[] = [];
  page.items.forEach((item, i) => {
    const mapped = mapSavedTrack(item, offset + i);
    if (mapped) tracks.push(mapped);
  });
  return { total: page.total, count: page.items.length, tracks };
}

/** the signed-in Spotify account id, so a saved import is resumed for the same account */
export async function spotifyAccountId(signal?: AbortSignal): Promise<string> {
  const data = await withRateLimit(
    async () => {
      const token = await userToken(signal);
      const res = await fetch("https://api.spotify.com/v1/me", {
        headers: { authorization: `Bearer ${token}`, accept: "application/json" },
        signal,
      });
      if (res.status === 401) cachedToken = null;
      return {
        status: res.status,
        retryAfter: res.headers.get("retry-after"),
        value: res.ok ? ((await res.json()) as { id?: string }) : undefined,
      };
    },
    "Spotify account request",
    signal,
  );
  return data.id ?? "";
}

export async function fetchSpotifyLikedTracks(signal?: AbortSignal): Promise<ClientImportedTrack[]> {
  const out: ClientImportedTrack[] = [];
  let offset = 0;
  for (;;) {
    const page = await fetchSpotifyLikedPage(offset, 50, signal);
    out.push(...page.tracks);
    offset += page.count;
    if (page.count === 0 || offset >= page.total) break;
    // stay well under Spotify's rate limit
    await sleep(350, signal);
  }
  return out;
}
