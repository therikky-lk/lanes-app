import { readCoverMarker, stripCoverMarker } from "@/features/library/services/playlistCoverMarker";
import { youtubePlaylistArtwork } from "@/shared/media/youtube/account/playlistArtwork";
import { useEffect, useMemo, useState } from "react";
import { api, mediaUrl, toClientTrack } from "@/shared/api";
import { queryCache } from "@/shared/cache/queryCache";
import type { Track } from "@/shared/types";
import { getDailyMixArtists, readStoredMixes } from "@/features/home/hooks/useDailyMixes";
import { useSessionOwner } from "@/features/home/hooks/sessionAwareLoad";
import { isDailyMixId, readDailyMixIdentities } from "@/features/home/mixes/dailyMixIdentity";
import { countryFromMixId, countryMixCover, countryMixTitle, loadCountryMix } from "@/features/home/mixes/countryMixes";
import { createTranslatorSync, getStoredLocale } from "@/languages";
import { fetchYoutubeAccountPlaylist, isAccountPlaylistId } from "@/shared/media/youtube";

export interface CollectionPageData {
  type?: "playlist" | "album";
  title: string;
  author?: string;
  artists?: { id: string; name: string }[];
  description?: string;
  year?: number;
  coverUrl: string;
  tracks: Track[];
  isDailyMix?: boolean;
  /** Lane daily mix: drawn cover (number + mosaic) instead of an image */
  mixCover?: { index: number; covers: string[]; label: string };
}

export function useCollection(
  type: string | null,
  id: string | null,
  fallbackTitle?: string | null,
  fallbackArtist?: string | null,
  isRelease = false,
) {
  const owner = useSessionOwner();
  const cacheKey = type && id ? `collection:${type}:${id}` : null;
  const cached = cacheKey ? queryCache.get<CollectionPageData>(cacheKey) : undefined;
  const [data, setData] = useState<CollectionPageData | null>(cached ?? null);
  const [loading, setLoading] = useState<boolean>(!cached && Boolean(type && id));

  useEffect(() => {
    if (!type || !id || !cacheKey) {
      setData(null);
      setLoading(false);
      return;
    }

    const initial = queryCache.get<CollectionPageData>(cacheKey);
    if (initial) {
      setData(initial);
      setLoading(false);
    } else {
      setData(null);
      setLoading(true);
    }

    let active = true;

    const unsubscribe = queryCache.subscribe<CollectionPageData>(cacheKey, (updated) => {
      if (active) {
        setData(updated);
        setLoading(false);
      }
    });

    void queryCache
      .fetchWithSwr(
        cacheKey,
        async () => {
          const decodedId = id ? decodeURIComponent(id) : "";
          const country = type === "playlist" ? countryFromMixId(decodedId) : null;
          if (country) {
            const locale = getStoredLocale();
            const name = new Intl.DisplayNames(locale, { type: "region" }).of(country) ?? country;
            const tracks = await loadCountryMix(country);
            if (!tracks.length) throw new Error("No playable tracks for this country");
            return {
              type: "playlist",
              title: countryMixTitle(name),
              author: createTranslatorSync(locale)("home.country_mixes"),
              coverUrl: countryMixCover(country),
              tracks,
              isDailyMix: true,
            } satisfies CollectionPageData;
          }
          if (type === "playlist" && isAccountPlaylistId(decodedId)) {
            const youtubeCollection = await fetchYoutubeAccountPlaylist(decodedId);
            if (youtubeCollection) {
              const tracks = youtubeCollection.tracks.map(toClientTrack);
              return {
                type: "playlist",
                title: youtubeCollection.title,
                author: youtubeCollection.author,
                description: youtubeCollection.description,
                coverUrl: youtubePlaylistArtwork(decodedId, youtubeCollection.cover?.url ? mediaUrl(youtubeCollection.cover.url) : tracks[0]?.coverUrl || ""),
                tracks,
              } satisfies CollectionPageData;
            }
          }
          const isDailyMix = type === "playlist" && (isDailyMixId(decodedId)
            || readDailyMixIdentities(owner).some(mix => mix.id === decodedId));

          if (isDailyMix) {
            const t = createTranslatorSync(getStoredLocale());
            const stored = readStoredMixes(owner, true)?.find(mix => mix.id === decodedId);
            if (stored) {
              return {
                type: "playlist", title: stored.title, author: stored.clusterArtists.join(", "),
                description: stored.description, coverUrl: stored.coverUrl ?? "", tracks: stored.tracks,
                isDailyMix: true,
                ...(stored.mixIndex ? { mixCover: { index: stored.mixIndex, covers: stored.mosaic ?? [], label: t("home.mix_label") } } : {}),
              } satisfies CollectionPageData;
            }
            const mixesRes = await api.getDailyMixes();
            const index = mixesRes.items?.findIndex((m) => m.id === decodedId) ?? -1;
            const found = index >= 0 ? mixesRes.items?.[index] : undefined;
            if (found) {
              const clientTracks = (found.tracks || []).map(toClientTrack);
              const primaryCover = found.cover?.url
                ? mediaUrl(found.cover.url)
                : (clientTracks[0]?.coverUrl || clientTracks[1]?.coverUrl || "");
              const computedArtists = getDailyMixArtists(found.clusterArtists, clientTracks, 4);
              const formatted: CollectionPageData = {
                type: "playlist",
                title: found.title,
                author: computedArtists.length > 0 ? computedArtists.join(", ") : "Daily Mix",
                description: found.description,
                coverUrl: primaryCover,
                tracks: clientTracks,
                isDailyMix: true,
                mixCover: { index: index + 1, covers: [], label: t("home.mix_label") },
              };
              return formatted;
            }
          }

          if (type === "playlist" && (/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(decodedId) || decodedId.startsWith("pl-"))) {
            const detail = await api.getPublicPlaylist(decodedId);
            return { type: "playlist", title: detail.playlist.title,
              description: stripCoverMarker(detail.playlist.description), coverUrl: readCoverMarker(detail.playlist.description) || ( detail.items[0]?.track.cover?.url ? mediaUrl(detail.items[0].track.cover.url) : ""),
              tracks: detail.items.map(item => toClientTrack(item.track)),
            } satisfies CollectionPageData;
          }
          let collection = type === "playlist"
            ? await api.getPlaylist(id)
            : await api.getAlbum(id).catch(() => null);

          // A single can expose a bad release id. Keep a direct result only
          // when it belongs to the requested artist; otherwise resolve a
          // normal YouTube Music track from the artist + release query.
          if (isRelease && fallbackTitle) {
            const query = [fallbackTitle, fallbackArtist].filter(Boolean).join(" ");
            const artist = fallbackArtist?.toLocaleLowerCase().trim();
            const title = fallbackTitle.toLocaleLowerCase().trim();
            const hasCyrillic = /[а-яё]/i.test(fallbackTitle);
            const belongsToArtist = (artists: { name: string }[]) => !artist || artists.some((entry) => {
                const name = entry.name.toLocaleLowerCase().trim();
                return name === artist || name.includes(artist) || artist.includes(name);
              });
            const titleScore = (value: string) => {
              const candidate = value.toLocaleLowerCase().trim();
              let score = candidate === title ? 100 : candidate.includes(title) || title.includes(candidate) ? 55 : 0;
              if (hasCyrillic && /[а-яё]/i.test(value)) score += 30;
              if (hasCyrillic && !/[а-яё]/i.test(value)) score -= 20;
              return score;
            };

            const directIsValid = Boolean(
              collection && collection.tracks.length > 0 &&
              belongsToArtist(collection.tracks[0].artists) &&
              titleScore(collection.title) > 0,
            );
            if (!directIsValid) {
              collection = null;
              const results = await api.search(query, "track").catch(() => ({ items: [] }));
              const match = results.items
                .filter((item) => item.type === "track" && belongsToArtist(item.artists))
                .sort((a, b) => titleScore("title" in b ? b.title : "") - titleScore("title" in a ? a.title : ""))[0];
              if (match?.type === "track") {
                const track = toClientTrack(match);
                collection = {
                  type: "album" as const,
                  id,
                  title: track.title || fallbackTitle,
                  artists: track.artistList?.map((entry) => ({ id: entry.id ?? "", name: entry.name })) ?? [],
                  cover: track.coverUrl ? { url: track.coverUrl, width: 500, height: 500 } : undefined,
                  tracks: [match] as any,
                };
              }
            }
          }

          // Artist discography entries can point at a one-track release ID
          // even when the displayed release title is a full album (e.g. the
          // same album track promoted as a standalone release). Resolve the
          // canonical album by its exact title/artist before showing that
          // single track as the entire album.
          if (isRelease && fallbackTitle && collection && collection.tracks.length <= 1) {
            const title = fallbackTitle.toLocaleLowerCase().trim();
            const artist = fallbackArtist?.toLocaleLowerCase().trim();
            const results = await api.search(fallbackTitle, "album").catch(() => ({ items: [] }));
            const candidates = results.items
              .filter((item) =>
                item.type === "album" &&
                item.title.toLocaleLowerCase().trim() === title &&
                (!artist || item.artists.some((entry) => {
                  const name = entry.name.toLocaleLowerCase().trim();
                  return name === artist || name.includes(artist) || artist.includes(name);
                })),
              )
              .sort((a, b) => Number(b.id !== decodedId) - Number(a.id !== decodedId));
            for (const candidate of candidates) {
              if (candidate.id === decodedId) continue;
              const completeAlbum = await api.getAlbum(candidate.id).catch(() => null);
              if (completeAlbum && completeAlbum.tracks.length > collection.tracks.length) {
                collection = completeAlbum;
                break;
              }
            }
          }

          // Single releases can expose a browse id that returns metadata but
          // no track shelf. Resolve the release again through catalog search.
          if (!isRelease && type !== "playlist" && (!collection || collection.tracks.length === 0) && fallbackTitle) {
            const matches = await api.search(fallbackTitle, "album").catch(() => ({ items: [] }));
            const title = fallbackTitle.toLocaleLowerCase().trim();
            const artist = fallbackArtist?.toLocaleLowerCase().trim();
            const match = matches.items.find((item) =>
              item.type === "album" &&
              (item.title.toLocaleLowerCase().trim() === title ||
                item.title.toLocaleLowerCase().includes(title) ||
                title.includes(item.title.toLocaleLowerCase().trim())) &&
              (!artist || item.artists.some((entry) => {
                const name = entry.name.toLocaleLowerCase().trim();
                return name === artist || name.includes(artist) || artist.includes(name);
              })),
            );
            if (match?.type === "album") {
              collection = await api.getAlbum(match.id).catch(() => null);
            }
          }

          if (!collection) {
            const tracks = fallbackTitle
              ? (await api.search(fallbackTitle, "track").catch(() => ({ items: [] }))).items
                  .filter((item): item is Extract<typeof item, { type: "track" }> => {
                    if (item.type !== "track") return false;
                    if (!fallbackArtist) return true;
                    const artist = fallbackArtist.toLocaleLowerCase().trim();
                    return item.artists.some((entry: { name: string }) => {
                      const name = entry.name.toLocaleLowerCase().trim();
                      return name === artist || name.includes(artist) || artist.includes(name);
                    });
                  })
                  .slice(0, 1)
                  .map(toClientTrack)
              : [];
            if (tracks.length > 0) {
              collection = {
                type: "album" as const,
                id,
                title: fallbackTitle || id,
                artists: [],
                tracks: tracks as any,
              };
            }
          }

          if (!collection) throw new Error("Release was not found");

          if ((collection as any).playlist && Array.isArray((collection as any).items)) {
            const userPlaylist = (collection as any).playlist;
            const userItems = (collection as any).items as any[];
            const covers = userItems
              .map((i) => (i.track?.cover ? mediaUrl(i.track.cover.url) : ""))
              .filter(Boolean)
              .filter((url, idx, arr) => arr.indexOf(url) === idx)
              .slice(0, 4);
            const tracks: Track[] = userItems.map((item) => toClientTrack(item.track));
            const ownerName = userPlaylist.owner?.displayName || userPlaylist.owner?.username || "";
            const formatted: CollectionPageData = {
              type: "playlist",
              title: userPlaylist.title,
              author: ownerName || undefined,
              description: userPlaylist.description || undefined,
              coverUrl: covers[0] || "",
              tracks,
            };
            return formatted;
          }

          const collectionCoverUrl = collection.cover ? mediaUrl(collection.cover.url) : "";
          const tracks = (collection.tracks || []).map((t: any) => {
            const clientTrack = toClientTrack(t);
            let updated = clientTrack;
            if (collection.type === "album") {
              const albumData = {
                id: decodedId,
                title: collection.title,
              };
              updated = {
                ...updated,
                album: updated.album?.id ? updated.album : albumData,
              };
              if (collectionCoverUrl && (!updated.coverUrl || updated.coverUrl.includes("i.ytimg.com"))) {
                updated = { ...updated, coverUrl: collectionCoverUrl };
              }
            }
            return updated;
          });

          const formatted: CollectionPageData = {
            type: collection.type,
            title: collection.title,
            author: collection.type === "playlist" ? collection.author : undefined,
            artists: collection.type === "album" ? collection.artists : undefined,
            description: (collection as any).description,
            year: collection.year,
            coverUrl: collectionCoverUrl,
            tracks,
          };
          return formatted;
        },
        { staleTimeMs: 5 * 60 * 1000 },
      )
      .then(({ data: result }) => {
        if (active) {
          setData(result);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active && !queryCache.get(cacheKey)) {
          setData(null);
          setLoading(false);
        }
      });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [type, id, cacheKey, fallbackTitle, fallbackArtist, isRelease, owner]);

  // Artwork is a UI choice, so stale catalog/cache covers must not override it.
  const displayed = useMemo(() => data && type === "playlist" && id
    ? { ...data, coverUrl: youtubePlaylistArtwork(decodeURIComponent(id), data.coverUrl) }
    : data, [data, type, id]);
  return { data: displayed, loading };
}
