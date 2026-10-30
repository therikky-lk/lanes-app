import type { Track } from "@/shared/types";

const coverCache = new Map<string, string | null>();
const pendingCovers = new Map<string, Promise<string | null>>();

/** Find a track cover through Yandex Music without an account token. */
export async function getCoverWithoutToken(query: string): Promise<string | null> {
  const normalized = query.trim();
  if (!normalized) return null;
  const cached = coverCache.get(normalized);
  if (cached !== undefined) return cached;
  const pending = pendingCovers.get(normalized);
  if (pending) return pending;

  const request = (async () => {
    try {
      const url = `https://music.yandex.ru/handlers/music-search.jsx?text=${encodeURIComponent(normalized)}&type=all`;
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
          Referer: "https://music.yandex.ru/",
        },
      });
      if (!res.ok) return null;
      const data = await res.json();
      const track = data.tracks?.items?.[0];
      const rawUri = track?.coverUri || track?.albums?.[0]?.coverUri;
      return rawUri ? `https://${String(rawUri).replace("%%", "500x500")}` : null;
    } catch {
      return null;
    }
  })();

  pendingCovers.set(normalized, request);
  const result = await request;
  pendingCovers.delete(normalized);
  coverCache.set(normalized, result);
  return result;
}

export async function replaceTrackCoversWithYandex(tracks: Track[]): Promise<Track[]> {
  return Promise.all(
    tracks.map(async (track) => {
      const coverUrl = await getCoverWithoutToken(`${track.title} ${track.artists}`);
      return coverUrl ? { ...track, coverUrl } : track;
    }),
  );
}
