// Importing the user's own Liked Songs needs their Spotify login. The login
// lives outside the page (Electron: a separate session; Android: the app
// cookie store); requests that need it are sent by the native side.
import { registerPlugin } from "@capacitor/core";
import { isAndroidApp, laneHttp } from "@/shared/platform/native";
import type { ClientImportedTrack } from "../../importTypes";
import { buildSpotifyTokenUrl } from "./spotifyAuth";

export const SPOTIFY_LIKED_URL = "https://open.spotify.com/collection/tracks";



const LaneSpotify = registerPlugin<{
  hasLogin(): Promise<{ value: boolean }>;
  login(): Promise<{ value: boolean }>;
  logout(): Promise<void>;
}>("LaneSpotify");



export function spotifyAccountSupported(): boolean {
  return isAndroidApp() || Boolean(window.linerElectron?.spotifyLogin);
}

export async function spotifyHasLogin(): Promise<boolean> {
  if (isAndroidApp()) return (await LaneSpotify.hasLogin()).value;
  return (await window.linerElectron?.spotifyHasLogin?.()) ?? false;
}

export async function spotifyLogin(): Promise<boolean> {
  if (isAndroidApp()) return (await LaneSpotify.login()).value;
  return (await window.linerElectron?.spotifyLogin?.()) ?? false;
}

export async function spotifyLogout(): Promise<void> {
  if (isAndroidApp()) await LaneSpotify.logout();
  else await window.linerElectron?.spotifyLogout?.();
  cachedToken = null;
  cachedProfile = null;
}

/** GET with the Spotify login cookies attached */
async function fetchWithLogin(url: string): Promise<{ status: number; text: string; retryAfter?: string | null }> {
  if (isAndroidApp()) {
    const res = await laneHttp!.request({ url, method: "GET", headers: { accept: "application/json" }, withCookies: true });
    const bin = atob(res.body);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { status: res.status, text: new TextDecoder().decode(bytes) };
  }
  const res = await window.linerElectron?.spotifyFetch?.({ url, headers: { accept: "application/json" } });
  if (!res) throw new Error("Spotify login isn't available here");
  return { status: res.status, text: res.body, retryAfter: res.retryAfter };
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

export class SpotifyRequestError extends Error {
  constructor(what: string, readonly status: number) {
    super(`${what} failed (${status})`);
  }
}

export const spotifyUsesOAuth = () => typeof window !== "undefined" && Boolean(window.linerElectron?.spotifyOAuthRead);
const COOLDOWN_KEY = spotifyUsesOAuth() ? "lane_spotify_oauth_retry_at" : "lane_spotify_retry_at";
const cooldownListeners = new Set<() => void>();
let retryAt = 0;
try { retryAt = Number(localStorage.getItem(COOLDOWN_KEY)) || 0; } catch { /* storage unavailable */ }

export const spotifyRetryAt = () => retryAt;
export function subscribeSpotifyRetryAt(listener: () => void) {
  cooldownListeners.add(listener);
  return () => { cooldownListeners.delete(listener); };
}

function pauseSpotify(retryAfter: string | null | undefined) {
  const now = Date.now();
  const seconds = retryAfter?.trim() ? Number(retryAfter) : NaN;
  const date = retryAfter && !Number.isFinite(seconds) ? Date.parse(retryAfter) : NaN;
  const delay = Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : date - now;
  retryAt = Math.max(retryAt, now + (Number.isFinite(delay) && delay > 0 ? delay : 60_000));
  try { localStorage.setItem(COOLDOWN_KEY, String(retryAt)); } catch { /* storage unavailable */ }
  cooldownListeners.forEach(listener => listener());
  return retryAt - now;
}

async function withRateLimit<T>(
  run: () => Promise<{ status: number; retryAfter?: string | null; value?: T }>,
  what: string,
  signal?: AbortSignal,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    signal?.throwIfAborted();
    const remaining = retryAt - Date.now();
    if (remaining > 0) throw new SpotifyRateLimitError(what, remaining);
    const res = await run();
    if (res.status === 429) throw new SpotifyRateLimitError(what, pauseSpotify(res.retryAfter));
    if (res.status !== 429 && res.status < 500) {
      if (res.value === undefined) throw new SpotifyRequestError(what, res.status);
      return res.value;
    }
    const told = Number(res.retryAfter);
    const toldMs = Number.isFinite(told) && told > 0 ? told * 1000 : undefined;
    if (attempt >= 4 || (toldMs ?? 0) > 30_000) {
      throw new Error(`${what} failed (${res.status})`);
    }
    const wait = toldMs ?? Math.min(3000 * 2 ** attempt, 30_000);
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
      return { status: res.status, retryAfter: res.retryAfter, value: res.status === 200 ? res.text : undefined };
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

async function readSpotifyApi(path: string, signal?: AbortSignal): Promise<Response> {
  signal?.throwIfAborted();
  if (window.linerElectron?.spotifyOAuthRead) {
    const res = await window.linerElectron.spotifyOAuthRead(path);
    signal?.throwIfAborted();
    return new Response([204, 205, 304].includes(res.status) ? null : res.body, {
      status: res.status,
      headers: res.retryAfter ? { "retry-after": res.retryAfter } : undefined,
    });
  }
  const token = await userToken(signal);
  return fetch(`https://api.spotify.com/v1${path}`, {
    headers: { authorization: `Bearer ${token}`, accept: "application/json" }, signal,
  });
}

async function likedPage(offset: number, limit: number, signal?: AbortSignal): Promise<{ total: number; items: SavedTrackItem[] }> {
  const data = await withRateLimit(
    async () => {
      const res = await readSpotifyApi(`/me/tracks?limit=${limit}&offset=${offset}`, signal);
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

export async function fetchSpotifyAccountAlbum(id: string, signal?: AbortSignal) {
  type Track = NonNullable<SavedTrackItem["track"]>;
  type Page = { items?: Track[]; next?: string | null };
  type Album = { name?: string; images?: { url?: string }[]; tracks?: Page };

  async function read<T>(suffix: string): Promise<T> {
    return withRateLimit(async () => {
      const response = await readSpotifyApi(`/albums/${encodeURIComponent(id)}${suffix}`, signal);
      if (response.status === 401) cachedToken = null;
      return {
        status: response.status,
        retryAfter: response.headers.get("retry-after"),
        value: response.ok ? await response.json() as T : undefined,
      };
    }, "Spotify album request", signal);
  }

  const album = await read<Album>("");
  const tracks: ClientImportedTrack[] = [];
  let page = album.tracks;
  let offset = 0;
  while (page?.items?.length) {
    for (const track of page.items) {
      const mapped = mapSavedTrack({ track: { ...track, album } }, offset++);
      if (mapped) tracks.push(mapped);
    }
    if (!page.next) break;
    page = await read<Page>(`/tracks?limit=50&offset=${offset}`);
  }
  return { title: album.name, coverUrl: album.images?.[0]?.url, tracks };
}

export async function fetchSpotifyOAuthPlaylist(id: string, signal?: AbortSignal) {
  type Item = SavedTrackItem & { item?: SavedTrackItem["track"] };
  type Page = { items?: Item[]; next?: string | null };
  const tracks: ClientImportedTrack[] = [];
  let endpoint = spotifyUsesOAuth() ? "items" : "tracks";
  let offset = 0;
  const readPage = () => withRateLimit(async () => {
      const res = await readSpotifyApi(`/playlists/${encodeURIComponent(id)}/${endpoint}?limit=50&offset=${offset}`, signal);
      if (res.status === 401) cachedToken = null;
      return { status: res.status, retryAfter: res.headers.get("retry-after"), value: res.ok ? await res.json() as Page : undefined };
    }, "Spotify playlist request", signal);
  let page = await readPage().catch(error => {
    if (!(error instanceof SpotifyRequestError) || ![404, 405].includes(error.status)) throw error;
    endpoint = endpoint === "items" ? "tracks" : "items";
    return readPage();
  });
  for (;;) {
    const items = page.items ?? [];
    for (const item of items) {
      const mapped = mapSavedTrack({ track: item.item ?? item.track }, offset++);
      if (mapped) tracks.push(mapped);
    }
    if (!page.next || !items.length) return tracks;
    await sleep(350, signal);
    page = await readPage();
  }
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
  return (await fetchSpotifyAccountProfile(signal)).id;
}

let cachedProfile: { id: string; displayName: string; avatarUrl?: string } | null = null;

export async function fetchSpotifyAccountProfile(signal?: AbortSignal) {
  signal?.throwIfAborted();
  if (cachedProfile) return cachedProfile;
  const data = await withRateLimit(
    async () => {
      const res = await readSpotifyApi("/me", signal);
      if (res.status === 401) cachedToken = null;
      return {
        status: res.status,
        retryAfter: res.headers.get("retry-after"),
        value: res.ok ? ((await res.json()) as {
          id?: string;
          display_name?: string | null;
          images?: { url?: string }[];
        }) : undefined,
      };
    },
    "Spotify account request",
    signal,
  );
  const image = data.images?.find(item => item.url?.startsWith("https://"));
  signal?.throwIfAborted();
  return cachedProfile = { id: data.id ?? "", displayName: data.display_name?.trim() || data.id || "", avatarUrl: image?.url };
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
