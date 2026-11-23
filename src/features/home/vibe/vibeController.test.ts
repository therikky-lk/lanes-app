import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Track } from "@/shared/types/track";
import type { VibeSettings } from "./vibeTaste";

const mocks = vi.hoisted(() => ({
  search: vi.fn(), getPlaylist: vi.fn(), getRadio: vi.fn(),
  playTrack: vi.fn().mockResolvedValue(undefined),
  state: { currentTrack: null as Track | null, playbackContext: null as string | null },
}));
vi.mock("@/features/player/engine/playerEngine", () => ({
  playerEngine: { playTrack: mocks.playTrack }, setRadioRefillProvider: vi.fn(),
}));
vi.mock("@/features/player/store/playerStore", () => ({
  usePlayerStore: { subscribe: vi.fn(), getState: () => mocks.state },
}));
vi.mock("@/shared/api", () => ({
  api: { search: mocks.search, getPlaylist: mocks.getPlaylist, getRadio: mocks.getRadio },
  toClientTrack: (track: Track) => track,
}));
vi.mock("../hooks/listeningSignals", () => ({ loadListeningSignals: async () => ({ liked: [], history: [] }) }));
vi.mock("@/shared/platform/native", () => ({ isNativeApp: () => false }));

const tracks = (prefix: string): Track[] => Array.from({ length: 24 }, (_, i) => ({
  id: `${prefix}-${i}`, title: `${prefix} ${i}`, artists: `artist ${i}`,
  coverUrl: "https://lh3.googleusercontent.com/cover", durationMs: 180000, playCount: 0,
  musicVideoType: "MUSIC_VIDEO_TYPE_ATV",
}));
const settings = (mood: VibeSettings["mood"] = null): VibeSettings => ({ character: null, mood, language: null });

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  localStorage.clear();
  mocks.state.currentTrack = null;
  mocks.state.playbackContext = null;
  mocks.getPlaylist.mockImplementation(() => new Promise(() => {}));
  mocks.getRadio.mockImplementation(() => new Promise(() => {}));
});
afterEach(() => vi.useRealTimers());

it("starts tagged music from song results without waiting for playlists or radio", async () => {
  mocks.search.mockImplementation((_q, type) => type === "track"
    ? Promise.resolve({ items: tracks("calm").map(track => ({ ...track, type: "track" })) })
    : new Promise(() => {}));
  const { startVibe } = await import("./vibeController");
  expect(await startVibe(settings("calm"))).toBe(true);
  expect(mocks.playTrack.mock.calls[0][0].id).toMatch(/^calm-/);
  expect(mocks.getRadio).not.toHaveBeenCalled();
});

it("uses personal music when radio times out instead of silently refusing to start", async () => {
  vi.useFakeTimers();
  const { startVibe } = await import("./vibeController");
  const request = startVibe(settings(), { liked: tracks("liked") });
  await vi.advanceTimersByTimeAsync(3000);
  expect(await request).toBe(true);
  expect(mocks.playTrack.mock.calls[0][0].id).toMatch(/^liked-/);
});

it("does not let an older tag search overwrite a newer one", async () => {
  let finishOld!: (value: { items: unknown[] }) => void;
  const old = new Promise<{ items: unknown[] }>(resolve => { finishOld = resolve; });
  mocks.search.mockImplementation((q: string, type: string) => {
    if (type !== "track") return new Promise(() => {});
    if (q === "спокойная музыка" || q === "chill vibes") return old;
    return Promise.resolve({ items: tracks("sad").map(track => ({ ...track, type: "track" })) });
  });
  const { startVibe } = await import("./vibeController");
  const first = startVibe(settings("calm"));
  const second = startVibe(settings("sad"));
  expect(await second).toBe(true);
  finishOld({ items: tracks("calm").map(track => ({ ...track, type: "track" })) });
  expect(await first).toBeNull();
  expect(mocks.playTrack).toHaveBeenCalledOnce();
  expect(mocks.playTrack.mock.calls[0][0].id).toMatch(/^sad-/);
});

it("preserves music manually started while a tag search was pending", async () => {
  let finish!: (value: { items: unknown[] }) => void;
  const pending = new Promise<{ items: unknown[] }>(resolve => { finish = resolve; });
  mocks.search.mockImplementation(() => pending);
  const { startVibe } = await import("./vibeController");
  const request = startVibe(settings("happy"));
  mocks.state.currentTrack = tracks("manual")[0];
  mocks.state.playbackContext = "album:manual";
  finish({ items: tracks("happy").map(track => ({ ...track, type: "track" })) });
  expect(await request).toBeNull();
  expect(mocks.playTrack).not.toHaveBeenCalled();
});
