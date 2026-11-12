import { CapacitorHttp } from "@capacitor/core";
import { isNativeApp } from "@/shared/platform/native";
import type { ImportedTrack } from "@/shared/contracts";
import { isYandexMusicToken } from "@/shared/media/yandexMusicOAuth";

const API = "https://api.music.yandex.net";
const TRACK_BATCH_SIZE = 100;
const TIMEOUT_MS = 20_000;

export type YandexSourceErrorCode = "invalid_token" | "access_denied" | "rate_limited" | "source_unavailable";

export class YandexSourceError extends Error {
  constructor(readonly code: YandexSourceErrorCode) {
    super(code);
  }
}

interface YandexTrack {
  id?: number | string;
  title?: string;
  version?: string;
  artists?: { name?: string }[];
  albums?: { title?: string }[];
  durationMs?: number;
}

function numericId(value: unknown): string | undefined {
  const id = typeof value === "string" || (typeof value === "number" && Number.isSafeInteger(value))
    ? String(value)
    : "";
  return /^\d+$/.test(id) ? id : undefined;
}

async function request<T>(path: string, token: string, form?: URLSearchParams): Promise<T> {
  const url = `${API}${path}`;
  const method = form ? "POST" : "GET";
  const headers: Record<string, string> = { Accept: "application/json", Authorization: `OAuth ${token}` };
  if (form) headers["Content-Type"] = "application/x-www-form-urlencoded";

  for (let attempt = 0; ; attempt++) {
    let status: number;
    let retryAfter: string | null | undefined;
    let readBody: () => Promise<unknown>;
    try {
      if (isNativeApp()) {
        const response = await CapacitorHttp.request({
          url, method, headers, data: form?.toString(), disableRedirects: true,
          connectTimeout: TIMEOUT_MS, readTimeout: TIMEOUT_MS,
        });
        status = response.status;
        retryAfter = Object.entries(response.headers).find(([key]) => key.toLowerCase() === "retry-after")?.[1];
        readBody = async () => typeof response.data === "string" ? JSON.parse(response.data) : response.data;
      } else {
        const response = await fetch(url, {
          method, headers, body: form, credentials: "omit", redirect: "error",
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        status = response.status;
        retryAfter = response.headers.get("retry-after");
        readBody = () => response.json();
      }
    } catch {
      throw new YandexSourceError("source_unavailable");
    }

    if (status === 401 || status === 403) throw new YandexSourceError("access_denied");
    if (status === 429) {
      const headerDelay = /^\d+$/.test(retryAfter ?? "") ? Number(retryAfter) * 1_000 : Date.parse(retryAfter ?? "") - Date.now();
      const delay = Math.max(1_500 * 2 ** attempt, Number.isFinite(headerDelay) ? headerDelay : 0);
      if (attempt >= 3 || delay > 60_000) throw new YandexSourceError("rate_limited");
      await new Promise((resolve) => setTimeout(resolve, delay));
      continue;
    }
    if (status < 200 || status >= 300) throw new YandexSourceError("source_unavailable");

    let body: { result?: T } | null;
    try {
      body = await readBody() as typeof body;
    } catch {
      throw new YandexSourceError("source_unavailable");
    }
    if (body?.result == null) throw new YandexSourceError("source_unavailable");
    return body.result;
  }
}

function mapTrack(track: YandexTrack): ImportedTrack | undefined {
  const sourceId = numericId(track?.id);
  const title = typeof track?.title === "string" ? track.title.trim() : "";
  const artists = Array.isArray(track?.artists)
    ? track.artists.flatMap((artist) => typeof artist?.name === "string" && artist.name.trim() ? [artist.name.trim()] : [])
    : [];
  if (!sourceId || !title || artists.length === 0) return;
  const version = typeof track.version === "string" ? track.version.trim() : "";
  const alreadyVersioned = title.toLowerCase().endsWith(`(${version.toLowerCase()})`);
  return {
    sourceId,
    title: version && !alreadyVersioned ? `${title} (${version})` : title,
    artists,
    album: typeof track.albums?.[0]?.title === "string" ? track.albums[0].title : undefined,
    durationMs: typeof track.durationMs === "number" && track.durationMs > 0 ? track.durationMs : undefined,
  };
}

export async function loadYandexLikedTracks(rawToken: string): Promise<{ total: number; tracks: ImportedTrack[] }> {
  const token = rawToken.trim().replace(/^OAuth\s+/i, "");
  if (!isYandexMusicToken(token)) throw new YandexSourceError("invalid_token");

  const account = await request<{ account?: { uid?: string | number } }>("/account/status", token);
  const uid = numericId(account.account?.uid);
  if (!uid || uid === "0") throw new YandexSourceError("access_denied");
  const likes = await request<{ library?: { tracks?: { id?: string | number; albumId?: string | number }[] } }>(
    `/users/${uid}/likes/tracks?if-modified-since-revision=0`, token,
  );
  if (!Array.isArray(likes.library?.tracks)) throw new YandexSourceError("source_unavailable");

  const ids = new Map<string, string>();
  for (const item of likes.library.tracks) {
    const id = numericId(item?.id);
    if (!id || ids.has(id)) continue;
    const albumId = numericId(item.albumId);
    ids.set(id, albumId ? `${id}:${albumId}` : id);
  }

  const byId = new Map<string, ImportedTrack>();
  const trackIds = [...ids.values()];
  for (let i = 0; i < trackIds.length; i += TRACK_BATCH_SIZE) {
    const details = await request<YandexTrack[]>("/tracks", token, new URLSearchParams({
      "track-ids": trackIds.slice(i, i + TRACK_BATCH_SIZE).join(","),
    }));
    if (!Array.isArray(details)) throw new YandexSourceError("source_unavailable");
    for (const detail of details) {
      const track = mapTrack(detail);
      if (track) byId.set(track.sourceId, track);
    }
  }

  return {
    total: ids.size,
    tracks: [...ids.keys()].flatMap((id) => {
      const track = byId.get(id);
      return track ? [track] : [];
    }),
  };
}
