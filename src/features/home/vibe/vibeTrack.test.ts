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
  musicVideoType: "MUSIC_VIDEO_TYPE_ATV",
};

describe("My Vibe track eligibility", () => {
  it("keeps official songs with a known duration", () => {
    expect(isVibeTrack(song)).toBe(true);
    expect(isVibeTrack({ ...song, musicVideoType: "MUSIC_VIDEO_TYPE_OFFICIAL_SOURCE_MUSIC" })).toBe(true);
    expect(isVibeTrack({ ...song, durationMs: 0 })).toBe(false);
  });

  it("rejects video uploads even when short or missing duration", () => {
    const video = { ...song, musicVideoType: "MUSIC_VIDEO_TYPE_UGC" };
    expect(isVibeTrack(video)).toBe(false);
    expect(isVibeTrack({ ...video, durationMs: 0 })).toBe(false);
  });

  it("rejects unclassified uploads and compilation-like titles even if short", () => {
    expect(isVibeTrack({ ...song, musicVideoType: undefined })).toBe(false);
    expect(isVibeTrack({ ...song, musicVideoType: "MUSIC_VIDEO_TYPE_OMV" })).toBe(false);
    expect(isVibeTrack({ ...song, title: "Найкращі Пісні 2026 Українська Музика" })).toBe(false);
  });

  it.each([20, 60])("rejects %i-minute compilations even with album-style artwork", (minutes) => {
    expect(isVibeTrack({
      ...song,
      title: "Найкращі пісні 2026 · Українська музика",
      durationMs: minutes * 60_000,
    })).toBe(false);
  });
});
