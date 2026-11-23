import { describe, expect, it } from "vitest";
import type { Track } from "@/shared/types/track";
import { isVibeTrack } from "./vibeTrack";

const song: Track = {
  id: "song",
  title: "Смарагдове небо",
  artists: "Drevo",
  coverUrl: "https://lh3.googleusercontent.com/artwork",
  durationMs: 210_000,
  playCount: 0,
};

describe("My Vibe track eligibility", () => {
  it("keeps regular songs, including songs without duration metadata", () => {
    expect(isVibeTrack(song)).toBe(true);
    expect(isVibeTrack({ ...song, durationMs: 0 })).toBe(true);
  });

  it("rejects video uploads even when short or missing duration", () => {
    const video = { ...song, coverUrl: "https://i.ytimg.com/vi/upload/hqdefault.jpg" };
    expect(isVibeTrack(video)).toBe(false);
    expect(isVibeTrack({ ...video, durationMs: 0 })).toBe(false);
  });

  it.each([20, 60])("rejects %i-minute compilations even with album-style artwork", (minutes) => {
    expect(isVibeTrack({
      ...song,
      title: "Найкращі пісні 2026 · Українська музика",
      durationMs: minutes * 60_000,
    })).toBe(false);
  });
});
