import type { PopularAlbumItem } from "./usePopularTracks";
import type { Track } from "@/shared/types";
import { isLocalTrackId } from "@/shared/media/local/localTracks";

export type NewRelease = PopularAlbumItem & { releaseDate: string };
const DAY_MS = 86_400_000;

export type ReleaseArtist = { id?: string; name: string };

export function likedReleaseArtists(tracks: Track[]): ReleaseArtist[] {
  const byId = new Map<string, ReleaseArtist>();
  const byName = new Map<string, ReleaseArtist>();
  const namesWithId = new Set<string>();
  for (const track of tracks) {
    if (isLocalTrackId(track.id)) continue;
    const credits = track.artistList?.length ? track.artistList : track.artists.split(",").map((name, i) => ({
      name, id: i === 0 ? track.artistId : undefined,
    }));
    const hasCreditId = credits.some((artist) => artist.id && artist.id !== "unknown");
    for (const [i, credit] of credits.entries()) {
      const name = credit.name.trim();
      const normalized = name.toLowerCase();
      const id = credit.id && credit.id !== "unknown" ? credit.id
        : i === 0 && !hasCreditId ? track.artistId : undefined;
      if (id && id !== "unknown") {
        namesWithId.add(normalized);
        if (!byId.has(id)) byId.set(id, { id, name });
      } else if (name && normalized !== "unknown" && !byName.has(normalized)) {
        byName.set(normalized, { name });
      }
    }
  }
  return [...byId.values(), ...[...byName].filter(([name]) => !namesWithId.has(name)).map(([, artist]) => artist)];
}

export function releaseWeekStart(today: string): string {
  return new Date(Date.parse(today) - 6 * DAY_MS).toISOString().slice(0, 10);
}

export function inReleaseWeek(date: string, today: string): boolean {
  return date >= releaseWeekStart(today) && date <= today;
}

export function recentReleaseItems(releases: NewRelease[], today: string) {
  const seen = new Set<string>();
  return releases
    .filter(({ releaseDate }) => inReleaseWeek(releaseDate, today))
    .sort((a, b) => b.releaseDate.localeCompare(a.releaseDate) || a.id.localeCompare(b.id) || a.artist.localeCompare(b.artist))
    .filter(({ id }) => !seen.has(id) && Boolean(seen.add(id)))
    .map((item) => ({ type: "album" as const, item }));
}
