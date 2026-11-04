import { mediaUrl } from "./api";
import type { ApiTrack } from "../contracts";
import type { Track } from "../types";
import { cleanTrackTitle } from "../utils/trackTitle";

// Commas and explicit feature credits separate artists; "&" can be a band name.
const ARTIST_SEPARATOR = /\s*,\s*|\s+(?:×|x|feat\.?|ft\.?|featuring)\s+/i;

/**
 * One entry per artist. Commas always separate credits. Names containing
 * "&" stay intact (for example "Artik & Asti" or "Simon & Garfunkel").
 */
export function splitJoinedArtists(list: { id?: string; name: string }[]): { id: string; name: string }[] {
  const out: { id: string; name: string }[] = [];
  const seen = new Set<string>();
  const push = (id: string, name: string) => {
    const key = name.toLowerCase();
    if (!name || seen.has(key)) return;
    seen.add(key);
    out.push({ id, name });
  };
  for (const artist of list) {
    const name = (artist.name ?? "").trim();
    const id = artist.id ?? "";
    const linked = Boolean(id && id !== "unknown");
    if (seen.has(name.toLowerCase())) continue;
    if ((linked && !name.includes(",")) || !ARTIST_SEPARATOR.test(name)) {
      push(id, name);
      continue;
    }
    // A catalog ID on a comma-joined credit belongs to the first artist only.
    const parts = name.includes(",") ? name.split(/\s*,\s*/) : name.split(ARTIST_SEPARATOR);
    parts.forEach((part, index) => push(index === 0 && linked ? id : "", part.trim()));
  }
  return out;
}

export function toClientTrack(source: any): Track {
  if (!source) {
    return {
      id: "",
      title: "",
      artists: "",
      coverUrl: "",
      durationMs: 0,
      playCount: 0,
    };
  }

  let artistsList: { id?: string; name: string }[] = [];

  if (Array.isArray(source.artistList) && source.artistList.length > 0) {
    artistsList = source.artistList.map((artist: any) => ({
      id: typeof artist === "string" ? "" : (artist?.id ?? ""),
      name: typeof artist === "string" ? artist : (artist?.name ?? ""),
    }));
  } else if (Array.isArray(source.artists) && source.artists.length > 0) {
    artistsList = source.artists.map((artist: any) => ({
      id: typeof artist === "string" ? "" : (artist?.id ?? ""),
      name: typeof artist === "string" ? artist : (artist?.name ?? ""),
    }));
  } else if (typeof source.artist === "object" && source.artist !== null) {
    artistsList = [
      {
        id: source.artist.id ?? "",
        name: source.artist.name ?? "",
      },
    ];
  } else if (typeof source.artists === "string" && source.artists.trim()) {
    const rawArtistId = source.artistId || source.artist_id || "";
    const parts = source.artists.split(",").map((p: string) => p.trim()).filter(Boolean);
    artistsList = parts.map((name: string, idx: number) => ({
      id: idx === 0 ? rawArtistId : "",
      name,
    }));
  } else if (typeof source.artist === "string" && source.artist.trim()) {
    artistsList = [
      {
        id: source.artistId || source.artist_id || "",
        name: source.artist.trim(),
      },
    ];
  }

  artistsList = splitJoinedArtists(artistsList);
  // always "A, B": the same look everywhere, whatever the source wrote
  const artistsString = artistsList.map((artist) => artist.name).filter(Boolean).join(", ");

  const primaryArtistId =
    artistsList.find((artist) => Boolean(artist.id && artist.id !== "unknown"))?.id ||
    (source.artistId && source.artistId !== "unknown" ? source.artistId : undefined) ||
    (source.artist_id && source.artist_id !== "unknown" ? source.artist_id : undefined) ||
    (artistsList[0]?.id && artistsList[0].id !== "unknown" ? artistsList[0].id : undefined);

  const coverUrl = source.cover
    ? mediaUrl(source.cover.url ?? source.cover)
    : source.coverUrl ?? source.cover_url ?? "";

  const album =
    source.album && typeof source.album === "object"
      ? {
          id: source.album.id ? String(source.album.id) : "",
          title: source.album.title ? String(source.album.title) : "",
        }
      : undefined;

  return {
    id: source.id,
    title: cleanTrackTitle(source.title, artistsString),
    artists: artistsString,
    artistList: artistsList.length > 0 ? artistsList : undefined,
    artistId: primaryArtistId,
    coverUrl,
    durationMs: source.durationMs ?? source.duration_ms ?? 0,
    playCount: source.playCount ?? 0,
    explicit: source.explicit,
    album: album && (album.id || album.title) ? album : undefined,
  };
}

