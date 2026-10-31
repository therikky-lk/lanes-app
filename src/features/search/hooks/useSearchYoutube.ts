import { useCallback, useEffect, useRef, useState } from "react";
import { searchYoutubeVideos } from "@/shared/media/innertube";
import type { SearchResult } from "@/shared/contracts";

export function useSearchYoutube(
  query: string,
  options: { enabled?: boolean; debounceMs?: number } = {},
) {
  const { enabled = true, debounceMs = 250 } = options;
  const [videos, setVideos] = useState<Extract<SearchResult, { type: "track" }>[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const requestId = useRef(0);
  const trimmed = query.trim();

  const runRequest = useCallback(async (id: number, value: string) => {
    setLoading(true);
    try {
      const result = await searchYoutubeVideos(value);
      if (id === requestId.current) setVideos(result);
    } catch {
      if (id === requestId.current) setVideos([]);
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
      setVideos([]);
      setLoading(false);
      setHasLoaded(false);
      return;
    }
    const id = ++requestId.current;
    setLoading(true);
    const timer = setTimeout(() => void runRequest(id, trimmed), debounceMs);
    return () => clearTimeout(timer);
  }, [debounceMs, enabled, runRequest, trimmed]);

  const runNow = useCallback(() => {
    if (enabled && trimmed.length >= 2) void runRequest(++requestId.current, trimmed);
  }, [enabled, runRequest, trimmed]);

  return { videos, loading, hasLoaded, runNow };
}
