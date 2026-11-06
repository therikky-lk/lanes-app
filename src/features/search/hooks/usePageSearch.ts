import { useCallback, useEffect, useRef, useState } from "react";
import { api, type ApiSearchItem, type SearchType } from "@/shared/api";
import { searchCatalog, searchYoutubeVideos } from "@/shared/media/innertube";

export type PageSearchFilter = SearchType | "library" | "youtube";
const cache = new Map<string, { items: ApiSearchItem[]; at: number }>();
const pending = new Map<string, Promise<ApiSearchItem[]>>();
const keyOf = (query: string, filter: PageSearchFilter) => `${filter}:${query.toLowerCase()}`;

async function fetchResults(query: string, filter: Exclude<PageSearchFilter, "library">) {
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

export function usePageSearch(query: string, filter: PageSearchFilter) {
  const trimmed = query.trim();
  const [state, setState] = useState<{ items: ApiSearchItem[]; loading: boolean; error: boolean; key: string }>({ items: [], loading: false, error: false, key: "" });
  const requestId = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const run = useCallback(async () => {
    const id = ++requestId.current;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (trimmed.length < 2 || filter === "library") {
      setState({ items: [], loading: false, error: false, key: "" });
      return;
    }
    const key = keyOf(trimmed, filter);
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < 120_000) {
      setState({ items: hit.items, loading: false, error: false, key });
      return;
    }
    setState({ items: [], loading: true, error: false, key });
    try {
      let request = pending.get(key);
      if (!request) {
        request = fetchResults(trimmed, filter).then((items) => {
          cache.set(key, { items, at: Date.now() });
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
  }, [trimmed, filter]);

  useEffect(() => {
    requestId.current++;
    if (trimmed.length < 2 || filter === "library") {
      setState({ items: [], loading: false, error: false, key: "" });
    } else {
      const key = keyOf(trimmed, filter);
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
  }, [trimmed, filter, run]);

  const current = state.key === keyOf(trimmed, filter);
  return { items: current ? state.items : [], loading: trimmed.length >= 2 && filter !== "library" && (!current || state.loading), error: current && state.error, runNow: run };
}
