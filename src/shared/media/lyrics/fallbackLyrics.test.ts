import { afterEach, expect, it, vi } from "vitest";
import { fetchLrclibJson, findLrclibLyrics, LRCLIB_BASE } from "./fallbackLyrics";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("shares the LRCLIB cooldown between language lookups and lyric searches", async () => {
  vi.useFakeTimers();
  const fetch = vi.fn()
    .mockResolvedValueOnce(new Response(null, { status: 429, headers: { "Retry-After": "120" } }))
    .mockResolvedValueOnce(new Response(null, { status: 404 }));
  vi.stubGlobal("fetch", fetch);
  const url = `${LRCLIB_BASE}/get?track_name=test`;

  expect(await fetchLrclibJson(url)).toBeNull();
  vi.advanceTimersByTime(61_000);
  expect(await findLrclibLyrics({ title: "Song", artist: "Artist" })).toBeNull();
  expect(fetch).toHaveBeenCalledTimes(1);

  vi.advanceTimersByTime(60_000);
  expect(await fetchLrclibJson(url)).toBeNull();
  expect(await fetchLrclibJson(url)).toBeNull();
  expect(fetch).toHaveBeenCalledTimes(2);
});
