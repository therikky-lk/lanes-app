import type { Track } from "@/shared/types";

const coverCache = new Map<string, string | null>();
const pendingCovers = new Map<string, Promise<string | null>>();

function normalize(value: string): string {
  return value.toLowerCase().replace(/ё/g, "е").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/** Find a track cover through Yandex Music without an account token. */
export async function getCoverWithoutToken(
  query: string,
  expectedTitle = "",
  expectedArtists = "",
): Promise<string | null> {
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
      const title = normalize(expectedTitle);
      const artists = expectedArtists
        .split(/,|&|\bfeat\.?\b|\bft\.?\b/i)
        .map(normalize)
        .filter(Boolean);
      const candidates = Array.isArray(data.tracks?.items) ? data.tracks.items : [];
      const track = candidates
        .map((candidate: any) => {
          const candidateTitle = normalize(String(candidate.title ?? ""));
          const candidateArtists = Array.isArray(candidate.artists)
            ? candidate.artists.map((artist: any) => normalize(String(artist.name ?? artist))).filter(Boolean)
            : [];
          let score = 0;
          if (title && (candidateTitle === title || candidateTitle.includes(title) || title.includes(candidateTitle))) score += 100;
          for (const artist of artists) {
            if (candidateArtists.some((name: string) => name === artist || name.includes(artist) || artist.includes(name))) score += 40;
          }
          for (const token of title.split(" ").filter((word) => word.length > 2)) {
            if (candidateTitle.includes(token)) score += 2;
          }
          return { candidate, score };
        })
        .sort((a: { score: number }, b: { score: number }) => b.score - a.score)[0]?.candidate;
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
      const coverUrl = await getCoverWithoutToken(
        `${track.title} ${track.artists}`,
        track.title,
        track.artists,
      );
      return coverUrl ? { ...track, coverUrl } : track;
    }),
  );
}
