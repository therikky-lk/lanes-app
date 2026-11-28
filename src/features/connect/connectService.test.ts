import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getRemotePlaybackClock, startConnect, stopConnect, useConnectStore } from "./connectService";
import { usePlayerStore } from "@/features/player/engine/playerEngine";

const transport = vi.hoisted(() => ({
  receive: (_text: string) => {},
  status: (_online: boolean, _recovered: boolean) => {},
  publish: vi.fn(async (_text: string) => {}),
}));
vi.mock("./connectTransport", () => ({
  openRelay: (_topic: string, receive: typeof transport.receive, status: typeof transport.status) => {
    transport.receive = receive;
    transport.status = status;
    return { publish: transport.publish, close: vi.fn() };
  },
}));
vi.mock("./connectCrypto", () => ({
  deriveKeys: async () => ({ topic: "lane_test", key: {} }),
  open: async (_key: unknown, text: string) => JSON.parse(text),
  seal: async (_key: unknown, message: unknown) => JSON.stringify(message),
}));
vi.mock("@/features/auth/store/authStore", () => ({
  useAuthStore: { getState: () => ({ user: { id: "same-account" } }) },
}));
vi.mock("@/features/player/engine/playerEngine", async () => {
  const { create } = await import("zustand");
  const usePlayerStore = create<any>(set => ({
    currentTrack: null, currentIndex: -1, queue: [], status: "idle", positionMs: 0,
    volume: 1, playbackRate: 1, pitchSemitones: 0,
    setQueue: (queue: unknown) => set({ queue }),
    setCurrentTrack: (currentTrack: unknown, currentIndex: number) => set({ currentTrack, currentIndex }),
    setStatus: (status: string) => set({ status }),
    setPosition: (positionMs: number) => set({ positionMs }),
    setDuration: (durationMs: number) => set({ durationMs }),
    setVolume: (volume: number) => set({ volume }),
    setPlaybackRate: (playbackRate: number) => set({ playbackRate }),
    setPitchSemitones: (pitchSemitones: number) => set({ pitchSemitones }),
  }));
  return { usePlayerStore, setRemoteHooks: vi.fn(), playerEngine: { pause: vi.fn() } };
});

const track = (id: string) => ({ id, title: id, artists: "", coverUrl: "", durationMs: 120_000, playCount: 0 });
const phone = { id: "phone", name: "Phone", kind: "phone", lastSeen: 0 };
const messages = () => transport.publish.mock.calls.map(([text]) => JSON.parse(text));
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("crypto", webcrypto);
  vi.setSystemTime(new Date("2026-11-23T10:00:00Z"));
  transport.publish.mockClear();
  usePlayerStore.setState({ currentTrack: null, currentIndex: -1, queue: [], status: "idle", positionMs: 0 });
});
afterEach(() => {
  stopConnect(false);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("reannounces playback when a mirror recovers and does not answer presence-only heartbeats", async () => {
  const song = { ...track("one"), coverUrl: `data:image/png;base64,${"X".repeat(5000)}` };
  usePlayerStore.setState({ currentTrack: song, currentIndex: 0, queue: [song], status: "playing" });
  await startConnect();
  transport.status(true, true);
  await vi.advanceTimersByTimeAsync(300);
  expect(messages().find(message => message.t === "state").state.track.coverUrl).toBe("");
  transport.publish.mockClear();
  transport.receive(JSON.stringify({ t: "hello", from: phone, requestState: false }));
  await vi.advanceTimersByTimeAsync(1500);
  expect(messages()).toHaveLength(0);
  transport.status(true, true);
  await vi.advanceTimersByTimeAsync(300);
  expect(messages().map(message => message.t)).toEqual(["hello", "state"]);
});

it("keeps the newer phone track when an older snapshot arrives through another relay", async () => {
  await startConnect();
  const receive = (id: string, seq: number) => transport.receive(JSON.stringify({ t: "state", from: phone,
    state: { track: track(id), status: "playing", positionMs: 4000, at: Date.now(), volume: 1, seq, epoch: Date.now() },
  }));
  receive("first", 10);
  await vi.advanceTimersByTimeAsync(1);
  receive("third", 12);
  receive("second", 11);
  await vi.advanceTimersByTimeAsync(250);
  expect(useConnectStore.getState().followingId).toBe(phone.id);
  expect(usePlayerStore.getState().currentTrack?.id).toBe("third");
});

it("does not show the intermediate tracks from a replayed burst", async () => {
  await startConnect();
  const seen: string[] = [];
  const unsubscribe = usePlayerStore.subscribe((state, previous) => {
    if (state.currentTrack?.id && state.currentTrack.id !== previous.currentTrack?.id) seen.push(state.currentTrack.id);
  });
  for (const [index, id] of ["old", "middle", "latest"].entries()) {
    transport.receive(JSON.stringify({ t: "state", from: phone,
      state: { track: track(id), status: "playing", positionMs: 4000, at: Date.now(), volume: 1, seq: index + 1, epoch: 1 },
    }));
    await vi.advanceTimersByTimeAsync(35);
  }
  expect(seen).toEqual([]);
  await vi.advanceTimersByTimeAsync(250);
  expect(seen).toEqual(["latest"]);
  unsubscribe();
});

it("provides a live lyrics clock between mirrored progress updates and freezes it on pause", async () => {
  await startConnect();
  const at = Date.now();
  const remote = { track: track("one"), positionMs: 4000, at, rate: 1.5, volume: 1 };
  expect(getRemotePlaybackClock()).toBeNull();
  useConnectStore.setState({ followingId: phone.id, remote: { ...remote, status: "playing" } });
  await vi.advanceTimersByTimeAsync(100);
  expect(getRemotePlaybackClock()).toEqual({ positionMs: 4150, playing: true, rate: 1.5 });
  useConnectStore.setState({ remote: { ...remote, positionMs: 9000, status: "paused" } });
  await vi.advanceTimersByTimeAsync(100);
  expect(getRemotePlaybackClock()).toEqual({ positionMs: 9000, playing: false, rate: 1.5 });
});
