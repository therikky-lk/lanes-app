import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, type ApiSearchItem, type SearchType } from "@/shared/api";
import type { SharedEntity } from "@/shared/contracts/sharing";
import { searchCatalog, searchYoutubeVideos } from "@/shared/media/innertube";

export type PageSearchFilter = SearchType | "library" | "youtube" | "user";
type PageSearchItem = ApiSearchItem | { type: "user"; profile: NonNullable<SharedEntity["profile"]> };
const cache = new Map<string, { items: PageSearchItem[]; at: number }>();
const pending = new Map<string, Promise<PageSearchItem[]>>();
const keyOf = (query: string, filter: PageSearchFilter) => `${filter}:${query.toLowerCase()}`;

async function fetchResults(query: string, filter: Exclude<PageSearchFilter, "library">, backend: "liner" | "hyprr"): Promise<PageSearchItem[]> {
  if (filter === "user") {
    const username = query.replace(/^@/, "");
    if (!/^[\p{L}\p{N}_.-]{1,64}$/u.test(username)) return [];
    const result = await api.getPublicProfileByUsername(username, backend).catch(error => {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    });
    return result?.profile ? [{ type: "user", profile: result.profile }] : [];
  }
  if (filter !== "youtube") return (await api.search(query, filter)).items;
  const results = await Promise.allSettled([searchCatalog(query, "all"), searchYoutubeVideos(query)]);
  if (results.every((result) => result.status === "rejected")) throw new Error("YouTube search unavailable");
  const seen = new Set<string>();
  return results.flatMap((result) => result.status === "fulfilled" ? result.value : []).filter((item) => {
    const key = `${item.type}:${item.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }) as ApiSearchItem[];
}

export function usePageSearch(query: string, filter: PageSearchFilter, backend: "liner" | "hyprr" = "liner") {
  const trimmed = query.trim();
  const minLength = filter === "user" ? 1 : 2;
  const key = `${filter === "user" ? `${backend}:` : ""}${keyOf(trimmed, filter)}`;
  const [state, setState] = useState<{ items: PageSearchItem[]; loading: boolean; error: boolean; key: string }>({ items: [], loading: false, error: false, key: "" });
  const requestId = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const run = useCallback(async () => {
    const id = ++requestId.current;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (trimmed.length < minLength || filter === "library") {
      setState({ items: [], loading: false, error: false, key: "" });
      return;
    }
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < 120_000) {
      setState({ items: hit.items, loading: false, error: false, key });
      return;
    }
    setState({ items: [], loading: true, error: false, key });
    try {
      let request = pending.get(key);
      if (!request) {
        request = fetchResults(trimmed, filter, backend).then((items) => {
          if (filter !== "user") cache.set(key, { items, at: Date.now() });
          if (cache.size > 30) cache.delete(cache.keys().next().value!);
          return items;
        }).finally(() => pending.delete(key));
        pending.set(key, request);
      }
      const items = await request;
      if (id === requestId.current) setState({ items, loading: false, error: false, key });
    } catch {
      if (id === requestId.current) setState({ items: [], loading: false, error: true, key });
    }
  }, [trimmed, filter, backend, key, minLength]);

  useEffect(() => {
    requestId.current++;
    if (trimmed.length < minLength || filter === "library") {
      setState({ items: [], loading: false, error: false, key: "" });
    } else {
      const hit = cache.get(key);
      if (hit && Date.now() - hit.at < 120_000) {
        setState({ items: hit.items, loading: false, error: false, key });
      } else {
        setState({ items: [], loading: true, error: false, key });
        timer.current = setTimeout(() => { timer.current = null; void run(); }, 280);
      }
    }
    return () => {
      requestId.current++;
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };
  }, [trimmed, filter, run, key, minLength]);

  const current = state.key === key;
  return { items: current ? state.items : [], loading: trimmed.length >= minLength && filter !== "library" && (!current || state.loading), error: current && state.error, runNow: run };
}
