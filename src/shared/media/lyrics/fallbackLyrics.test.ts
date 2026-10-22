import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/shared/media/innertube/innertubeClient", () => ({
  postInnertube: vi.fn(async (endpoint: string) => {
    if (endpoint === "next") return { tabs: [{ endpoint: { browseEndpoint: { browseId: "MPLYt_abc" } } }] };
    return { contents: { musicDescriptionShelfRenderer: { description: { runs: [{ text: "line one\nline two" }] } } } };
  }),
}));

import {
  normalizeForMatch,
  primaryArtist,
  scoreLrclibRecord,
  streamFallbackLyrics,
} from "./fallbackLyrics";

const collect = async <T,>(gen: AsyncGenerator<T>) => {
  const out: T[] = [];
  for await (const e of gen) out.push(e);
  return out;
};

afterEach(() => vi.unstubAllGlobals());

describe("fallback lyrics matching", () => {
  it("normalizes noise and cyrillic", () => {
    expect(normalizeForMatch("НЕ ХОДИ (Official Video)")).toBe("не ходи");
    expect(normalizeForMatch("Ёлка")).toBe("елка");
    expect(primaryArtist("Маша Кондратенко, Volodymyr Dantes")).toBe("Маша Кондратенко");
  });

  it("prefers the right artist and duration", () => {
    const hint = { title: "НЕ ХОДИ", artist: "Маша Кондратенко", durationMs: 148_000 };
    const good = scoreLrclibRecord({ id: 1, trackName: "НЕ ХОДИ", artistName: "Маша Кондратенко", duration: 148, syncedLyrics: "[00:00.20]x" }, hint);
    const bad = scoreLrclibRecord({ id: 2, trackName: "Не ходи", artistName: "Someone Else", duration: 210 }, hint);
    expect(good).toBeGreaterThan(0.9);
    expect(bad).toBeLessThan(0.6);
  });
});

describe("streamFallbackLyrics", () => {
  it("returns synced LRCLIB lyrics as line-synced lrc", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      id: 1, trackName: "НЕ ХОДИ", artistName: "Маша Кондратенко", duration: 148,
      syncedLyrics: "[00:00.20]a\n[00:05.11]b", plainLyrics: "a\nb",
    }))));
    const events = await collect(streamFallbackLyrics("yt:abcdefghijk", { title: "НЕ ХОДИ", artist: "Маша Кондратенко", durationMs: 148_000 }));
    const found = events.find((e) => e.type === "provider") as any;
    expect(found.candidate.lyrics.format).toBe("lrc");
    expect(found.candidate.syncLevel).toBe("line_level");
    expect(events.at(-1)).toMatchObject({ type: "done", best: { provider: "LRCLIB" } });
  });

  it("falls back to YouTube Music plain text", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("[]")));
    const events = await collect(streamFallbackLyrics("yt:abcdefghijk", { title: "Unknown", artist: "Nobody" }));
    const found = events.find((e) => e.type === "provider") as any;
    expect(found.provider).toBe("YouTube Music");
    expect(found.candidate.lyrics).toEqual({ format: "plain", content: "line one\nline two" });
  });
});
