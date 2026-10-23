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

async function userToken(signal?: AbortSignal): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) return cachedToken.token;
  const res = await fetchWithLogin(await buildSpotifyTokenUrl(signal));
  if (res.status !== 200) throw new Error(`Spotify sign-in token failed (${res.status})`);
  const data = JSON.parse(res.text) as { accessToken?: string; isAnonymous?: boolean; accessTokenExpirationTimestampMs?: number };
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
  const token = await userToken(signal);
  const res = await fetch(`https://api.spotify.com/v1/me/tracks?limit=${limit}&offset=${offset}`, {
    headers: { authorization: `Bearer ${token}`, accept: "application/json" },
    signal,
  });
  if (!res.ok) throw new Error(`Spotify Liked Songs request failed (${res.status})`);
  const data = (await res.json()) as { total?: number; items?: SavedTrackItem[] };
  return { total: data.total ?? 0, items: data.items ?? [] };
}

export async function spotifyLikedCount(signal?: AbortSignal): Promise<number> {
  return (await likedPage(0, 1, signal)).total;
}

export async function fetchSpotifyLikedTracks(signal?: AbortSignal): Promise<ClientImportedTrack[]> {
  const out: ClientImportedTrack[] = [];
  let offset = 0;
  for (;;) {
    const page = await likedPage(offset, 50, signal);
    for (const item of page.items) {
      const t = item.track;
      if (!t?.name || t.is_local) continue;
      const artists = (t.artists ?? []).map((a) => a.name ?? "").filter(Boolean);
      out.push({
        sourceId: t.id ?? `${t.name}-${offset}`,
        title: t.name,
        artists: artists.length ? artists : ["Spotify Artist"],
        ...(t.album?.name ? { album: t.album.name } : {}),
        ...(t.album?.images?.[0]?.url ? { coverUrl: t.album.images[0].url } : {}),
        ...(t.duration_ms ? { durationMs: t.duration_ms } : {}),
      });
    }
    offset += page.items.length;
    if (page.items.length === 0 || offset >= page.total) break;
  }
  return out;
}
