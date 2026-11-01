import { useCallback, useEffect, useRef, useState } from "react";
import { searchCatalog, searchYoutubeVideos } from "@/shared/media/innertube";
import type { SearchResult } from "@/shared/contracts";

export function useSearchYoutube(
  query: string,
  options: { enabled?: boolean; debounceMs?: number } = {},
) {
  const { enabled = true, debounceMs = 250 } = options;
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const requestId = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trimmed = query.trim();

  const runRequest = useCallback(async (id: number, value: string) => {
    setLoading(true);
    try {
      const [catalog, videos] = await Promise.allSettled([
        searchCatalog(value, "all"),
        searchYoutubeVideos(value),
      ]);
      const merged = [
        ...(catalog.status === "fulfilled" ? catalog.value : []),
        ...(videos.status === "fulfilled" ? videos.value : []),
      ];
      const seen = new Set<string>();
      const unique = merged.filter((item) => {
        const key = `${item.type}:${item.id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      if (id === requestId.current) setResults(unique);
    } catch {
      if (id === requestId.current) setResults([]);
    } finally {
      if (id === requestId.current) {
        setLoading(false);
        setHasLoaded(true);
      }
    }
  }, []);

  useEffect(() => {
    if (!enabled || trimmed.length < 2) {
      requestId.current += 1;
      setResults([]);
      setLoading(false);
      setHasLoaded(false);
      return;
    }
    const id = ++requestId.current;
    setLoading(true);
    const timer = setTimeout(() => {
      timerRef.current = null;
      void runRequest(id, trimmed);
    }, debounceMs);
    timerRef.current = timer;
    return () => {
      clearTimeout(timer);
      if (timerRef.current === timer) timerRef.current = null;
    };
  }, [debounceMs, enabled, runRequest, trimmed]);

  // Enter: search right away and drop the pending debounced request, so the
  // same query isn't sent to YouTube twice
  const runNow = useCallback(() => {
    if (!enabled || trimmed.length < 2) return;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    void runRequest(++requestId.current, trimmed);
  }, [enabled, runRequest, trimmed]);

  return { results, loading, hasLoaded, runNow };
}
