import { useEffect, useMemo, useState } from "react";
import { api, mediaUrl, toMaxQualityAvatarUrl } from "@/shared/api";
import { useLikedTracks } from "@/features/library/hooks/useLikedTracks";
import { usePlaylistsList } from "@/features/library/hooks/usePlaylists";
import { useLocalTracks } from "@/features/local/hooks/useLocalTracks";
import { filterTracks, normalizeForSearch, tokenizeQuery } from "@/shared/utils/trackSearch";
import type { Track } from "@/shared/types";

// Search over what the user already has: liked songs, their own files,
// their playlists and the albums / artists / playlists they saved. Runs on
// the device, so results show up instantly while the catalog search loads.

export type LibrarySearchItem = Record<string, any> & {
  id: string;
  _type: "track" | "artist" | "album" | "playlist";
  _fromLibrary: true;
  /** where a collection opens */
  _href?: string;
  /** the list a track starts playing from */
  _queue?: Track[];
  _context?: string;
};

type Saved = { type: "album" | "artist" | "playlist"; id: string; title: string; subtitle: string; coverUrl: string };

let savedCache: Saved[] | null = null;
let savedRequest: Promise<Saved[]> | null = null;

async function loadSaved(force = false): Promise<Saved[]> {
  if (savedCache && !force) return savedCache;
  if (savedRequest) return savedRequest;
  savedRequest = (async () => {
    const kinds = ["album", "artist", "playlist"] as const;
    const settled = await Promise.allSettled(
      kinds.map((kind) => api.listSavedCollections(kind === "album" ? "albums" : kind === "artist" ? "artists" : "playlists")),
    );
    const out: Saved[] = [];
    settled.forEach((result, i) => {
      if (result.status !== "fulfilled") return;
      const kind = kinds[i];
      for (const entry of result.value.items as any[]) {
        const value = entry?.[kind];
        if (!value?.id) continue;
        const raw = value.cover ? mediaUrl(value.cover.url) : "";
        out.push({
          type: kind,
          id: value.id,
          title: kind === "artist" ? value.name : value.title,
          subtitle:
            kind === "artist"
              ? ""
              : Array.isArray(value.artists)
                ? value.artists.map((a: any) => a?.name).filter(Boolean).join(", ")
                : (value.author ?? ""),
          coverUrl: kind === "artist" ? toMaxQualityAvatarUrl(raw) : raw,
        });
      }
    });
    savedCache = out;
    return out;
  })().finally(() => {
    savedRequest = null;
  });
  return savedRequest;
}

if (typeof window !== "undefined") {
  const drop = () => {
    savedCache = null;
  };
  window.addEventListener("library:changed", drop);
  window.addEventListener("auth:changed", drop);
}

function matchesAll(text: string, tokens: string[]): boolean {
  if (tokens.length === 0) return false;
  const haystack = normalizeForSearch(text);
  return tokens.every((token) => haystack.includes(token));
}

export function useLibrarySearch(query: string, enabled: boolean, limit = 40): LibrarySearchItem[] {
  const { data: liked } = useLikedTracks();
  const { tracks: localTracks } = useLocalTracks();
  const { data: playlistsData } = usePlaylistsList();
  const [saved, setSaved] = useState<Saved[]>(() => savedCache ?? []);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const load = (force = false) =>
      void loadSaved(force)
        .then((list) => active && setSaved(list))
        .catch(() => undefined);
    load();
    const refresh = () => load(true);
    window.addEventListener("library:changed", refresh);
    return () => {
      active = false;
      window.removeEventListener("library:changed", refresh);
    };
  }, [enabled]);

  const trimmed = query.trim();

  return useMemo(() => {
    if (!enabled || trimmed.length < 2) return [];
    const tokens = tokenizeQuery(trimmed);
    const out: LibrarySearchItem[] = [];
    const seen = new Set<string>();
    const push = (item: LibrarySearchItem) => {
      const key = `${item._type}:${item.id}`;
      if (seen.has(key) || out.length >= limit) return;
      seen.add(key);
      out.push(item);
    };

    // playlists the user made come first: they're what people look for by name
    for (const p of playlistsData?.playlists ?? []) {
      if (!matchesAll(p.title ?? "", tokens)) continue;
      push({
        ...p,
        id: p.id,
        title: p.title,
        _type: "playlist",
        _fromLibrary: true,
        _href: `/library/playlist?id=${encodeURIComponent(p.id)}`,
        coverUrl: p.coverUrl || "",
        artists: "",
        totalTracks: p.trackCount,
      });
    }
    for (const s of saved) {
      if (!matchesAll(`${s.title} ${s.subtitle}`, tokens)) continue;
      push({
        id: s.id,
        title: s.title,
        name: s.title,
        _type: s.type,
        _fromLibrary: true,
        _href:
          s.type === "artist"
            ? `/artist?id=${encodeURIComponent(s.id)}`
            : `/collection?type=${s.type}&id=${encodeURIComponent(s.id)}`,
        coverUrl: s.coverUrl,
        artists: s.subtitle,
      });
    }

    const likedTracks = liked?.tracks ?? [];
    for (const { track } of filterTracks(likedTracks, trimmed)) {
      if (!track.id || !track.title) continue;
      push({ ...track, _type: "track", _fromLibrary: true, _queue: likedTracks, _context: "playlist:likes" });
    }
    for (const { track } of filterTracks(localTracks, trimmed)) {
      push({ ...track, _type: "track", _fromLibrary: true, _queue: localTracks, _context: "local:uploads" });
    }
    return out;
  }, [enabled, trimmed, playlistsData, saved, liked, localTracks, limit]);
}
