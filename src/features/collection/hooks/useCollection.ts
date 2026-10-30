import { useEffect, useState } from "react";
import { api, mediaUrl, toClientTrack } from "@/shared/api";
import { queryCache } from "@/shared/cache/queryCache";
import type { Track } from "@/shared/types";
import { getDailyMixArtists } from "@/features/home/hooks/useDailyMixes";
import { replaceTrackCoversWithYandex } from "@/shared/media/yandexCover";

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
          const isDailyMix =
            decodedId.startsWith("daily-mix") ||
            decodedId.startsWith("mix-") ||
            id.startsWith("daily-mix") ||
            id.startsWith("mix-");

          if (type === "playlist" && isDailyMix) {
            const mixesRes = await api.getDailyMixes();
            const found = mixesRes.items?.find((m) => m.id === id || m.id === decodedId);
            if (found) {
              const clientTracks = await replaceTrackCoversWithYandex((found.tracks || []).map((t) => toClientTrack(t)));
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
              };
              return formatted;
            }
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
            const tracks: Track[] = await replaceTrackCoversWithYandex(userItems.map((item) => toClientTrack(item.track)));
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
          const tracks = await replaceTrackCoversWithYandex((collection.tracks || []).map((t: any) => {
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
          }));

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
  }, [type, id, cacheKey, fallbackTitle, fallbackArtist, isRelease]);

  return { data, loading };
}
