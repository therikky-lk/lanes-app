import { afterEach, expect, it, vi } from "vitest";
import { fetchLrclibJson, findLrclibLyrics, LRCLIB_BASE, streamFallbackLyrics } from "./fallbackLyrics";
import { hasSuspiciousLrcTiming } from "./lrcTiming";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("shares the LRCLIB cooldown between language lookups and lyric searches", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2025-01-01T00:00:00Z"));
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

const record = {
  id: 10,
  trackName: "На Титанике",
  artistName: "INSTASAMKA & Лолита",
  duration: 153,
  plainLyrics: "Первая строка\nВторая строка",
  syncedLyrics: "[00:01.00]Первая строка\n[00:04.00]Вторая строка",
};

async function fallbackEvents(title: string, artist: string, durationMs: number) {
  const events = [];
  for await (const event of streamFallbackLyrics("sc:10", { title, artist, durationMs })) events.push(event);
  return events;
}

it("finds timed Russian lyrics for a collaboration even if the exact result only has plain text", async () => {
  const fetch = vi.fn()
    .mockResolvedValueOnce(Response.json({ ...record, syncedLyrics: null }))
    .mockResolvedValueOnce(Response.json([record]));
  vi.stubGlobal("fetch", fetch);

  const events = await fallbackEvents("INSTASAMKA, Лолита — На Титанике (Official Video)", "INSTASAMKA, Лолита", 153_000);

  const exact = new URL(fetch.mock.calls[0][0]);
  expect(exact.searchParams.get("track_name")).toBe("На Титанике");
  expect(exact.searchParams.get("artist_name")).toBe("INSTASAMKA");
  expect(events[0]).toMatchObject({ provider: "LRCLIB", syncLevel: "line_level" });
});

it("keeps genuine Enhanced LRC word timings and doesn't split a dash in the real title", async () => {
  const title = "First part - Second part";
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({
    ...record, trackName: title, artistName: "Test Artist",
    syncedLyrics: "[00:01.00]<00:01.00>First <00:02.00>part<00:03.00>",
  }));
  vi.stubGlobal("fetch", fetch);

  const events = await fallbackEvents(title, "Test Artist - Topic", 153_000);

  expect(new URL(fetch.mock.calls[0][0]).searchParams.get("track_name")).toBe(title);
  expect(events[0]).toMatchObject({ provider: "LRCLIB", syncLevel: "word_level" });
});

it("avoids another artist's lyrics and shows plain text when the version is too far off", async () => {
  const artistName = "Different Artist";
  vi.stubGlobal("fetch", vi.fn()
    .mockResolvedValueOnce(new Response(null, { status: 404 }))
    .mockResolvedValueOnce(Response.json([{ ...record, artistName }, record]))
    .mockResolvedValueOnce(Response.json([])));

  const events = await fallbackEvents(record.trackName, "INSTASAMKA", 118_000);
  expect(events[0]).toMatchObject({
    provider: "LRCLIB", syncLevel: "plain",
    candidate: { lyrics: { content: record.plainLyrics } },
  });
});

it("keeps searching past an exact duration match when the timestamps cover a shorter version", async () => {
  const short = {
    ...record, id: 20, trackName: "A longer version", artistName: "Example Artist", duration: 233,
    syncedLyrics: ["00:00.07", "00:11.95", "00:24.43", "00:37.49", "00:50.82", "01:28.21", "02:06.42", "02:51.13"]
      .map(time => `[${time}]Vocal line`).join("\n"),
  };
  const full = {
    ...short, id: 21, artistName: "Artist Example",
    syncedLyrics: ["00:24.25", "00:32.58", "00:36.75", "00:44.82", "00:49.42", "01:15.76", "02:05.42", "03:41.66"]
      .map(time => `[${time}]Vocal line`).join("\n"),
  };
  const fetch = vi.fn()
    .mockResolvedValueOnce(Response.json(short))
    .mockResolvedValueOnce(Response.json([short]))
    .mockResolvedValueOnce(Response.json([short, full]));
  vi.stubGlobal("fetch", fetch);

  const events = await fallbackEvents(short.trackName, short.artistName, 233_000);
  expect(fetch).toHaveBeenCalledTimes(3);
  expect(events[0]).toMatchObject({ candidate: { lyrics: { content: full.syncedLyrics } } });
  expect(hasSuspiciousLrcTiming(short.syncedLyrics, 233_000)).toBe(true);
  expect(hasSuspiciousLrcTiming(`${short.syncedLyrics}\n[03:47.00]♪`, 233_000)).toBe(false);
});
