import { useEffect, useState } from "react";
import { api, mediaUrl, toMaxQualityAvatarUrl, toClientTrack } from "@/shared/api";
import type { Track } from "@/shared/types";
import type { ArtistDetails } from "@/shared/contracts";
import { canonicalArtistId, nativeArtistName, nativeTrackTitle, sameArtistName, uniqueArtistId } from "@/shared/media/artistIdentity";
import { isAppleArtistId } from "@/shared/media/innertube/appleReleaseCatalog";

export interface ArtistAlbumViewModel {
  id: string;
  title: string;
  coverUrl: string;
  releaseDate?: string;
  totalTracks?: number;
  explicit?: boolean;
}

export interface ArtistReleaseViewModel extends ArtistAlbumViewModel {
  releaseType: "single" | "ep";
}

export interface ArtistPageData {
  id: string;
  title: string;
  description: string;
  coverUrl: string;
  geniusImageUrl?: string;
  geniusAka?: string[];
  geniusUsername?: string;
  monthlyListeners?: string;
  verified: boolean;
  followers?: number;
  totalListens?: number;
  totalTracks?: number;
  tracks: Track[];
  popularSongs: Track[];
  albums: ArtistAlbumViewModel[];
  reposts: Track[];
  singles: ArtistReleaseViewModel[];
}

export function useArtist(id: string | null, expectedName: string | null = null, sourceTrackId: string | null = null) {
  const [data, setData] = useState<ArtistPageData | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(id));

  useEffect(() => {
    if (!id) {
      setData(null);
      setLoading(false);
      return;
    }

    const artistId = canonicalArtistId(id, expectedName);
    let active = true;

    setData(null);
    setLoading(true);

    let confirmedArtistId: string | undefined;
    const matches = (artist: ArtistDetails) =>
      !expectedName || sameArtistName(artist.name, expectedName) || artist.id === confirmedArtistId ||
      (!!sourceTrackId && artist.id === artistId && artist.tracks.some(track =>
        track.id === sourceTrackId && track.artists.some(credit => credit.id === artist.id),
      ));
    const hasCatalog = (artist: ArtistDetails) =>
      artist.tracks.length > 0 || artist.albums.length > 0 || artist.singles.length > 0;

    function publish(artist: ArtistDetails) {
        if (!active || !matches(artist)) return;
        const tracks = artist.tracks.map(toClientTrack);
        const credit = { id: artist.id, name: artist.name };
        const formatted: ArtistPageData = {
          id: artist.id,
          title: nativeArtistName(artist.id, artist.name),
          monthlyListeners: artist.monthlyListeners,
          verified: Boolean(artist.verified),
          description: artist.bio?.trim() || "",
          coverUrl: artist.cover ? toMaxQualityAvatarUrl(mediaUrl(artist.cover.url)) : "",
          geniusImageUrl: artist.geniusImageUrl ? mediaUrl(artist.geniusImageUrl) : undefined,
          geniusAka: artist.geniusAka,
          geniusUsername: artist.geniusUsername,
          totalTracks: tracks.length,
          tracks,
          popularSongs: tracks.slice(0, 5),
          albums: artist.albums.map((album) => ({
            id: album.id,
            title: nativeTrackTitle(album.title, credit),
            coverUrl: album.cover ? mediaUrl(album.cover.url) : "",
            ...(album.year ? { releaseDate: String(album.year) } : {}),
            totalTracks: album.totalTracks ?? album.trackCount,
            explicit: album.explicit,
          })),
          reposts: [],
          singles: artist.singles.map((single) => ({
            id: single.id,
            title: nativeTrackTitle(single.title, credit),
            coverUrl: single.cover ? mediaUrl(single.cover.url) : "",
            releaseType: single.releaseType,
            ...(single.year ? { releaseDate: String(single.year) } : {}),
            totalTracks: single.totalTracks ?? single.trackCount,
            explicit: single.explicit,
          })),
        };

        setData(formatted);
    }

    async function loadArtist() {
      try {
        const nameOnly = expectedName && (artistId === "unknown" || sameArtistName(artistId, expectedName));
        const artist = nameOnly
          ? null
          : await api.getArtist(artistId, publish).catch(() => null);
        if (!active) return;
        if (artist) publish(artist);
        if (isAppleArtistId(artistId)) return;
        if (sourceTrackId && (!artist || !matches(artist) || !hasCatalog(artist))) {
          const source = await api.getTrack(sourceTrackId).catch(() => null);
          if (!active) return;
          const credits = source?.artists.filter(credit => credit.id && credit.id !== "unknown") ?? [];
          const credited = credits.find(credit => credit.id === artistId);
          const matchingIds = new Set(credits.filter(credit => expectedName && sameArtistName(credit.name, expectedName))
            .map(credit => canonicalArtistId(credit.id, credit.name)));
          confirmedArtistId = credited ? canonicalArtistId(credited.id, credited.name)
            : matchingIds.size === 1 ? matchingIds.values().next().value : undefined;
          if (confirmedArtistId) {
            const recovered = artist?.id === confirmedArtistId ? artist
              : await api.getArtist(confirmedArtistId, publish).catch(() => null);
            if (!active) return;
            if (recovered?.id === confirmedArtistId) {
              publish(recovered);
              if (hasCatalog(recovered)) return;
            }
          }
        }
        const lookupName = expectedName || artist?.name;
        if (lookupName && (!artist || !matches(artist) || !hasCatalog(artist))) {
          const { items } = await api.search(lookupName, "artist");
          if (!active) return;
          const matchId = uniqueArtistId(items, lookupName);
          if (matchId && (nameOnly || matchId !== artistId)) {
            const recovered = await api.getArtist(matchId);
            if (sameArtistName(recovered.name, lookupName) && (!artist || !matches(artist) || hasCatalog(recovered))) {
              publish(recovered);
            }
          }
        }
      } catch {
        // Keep any verified profile already published from the first response.
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadArtist();

    return () => {
      active = false;
    };
  }, [id, expectedName, sourceTrackId]);

  return { data, loading };
}
