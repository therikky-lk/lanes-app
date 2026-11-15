import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ listLikedTracks: vi.fn() }));

vi.mock("@/shared/storage/linerDb", () => ({
  linerDb: { getLikedSnapshot: async () => null, putLikedSnapshot: async () => undefined },
}));
vi.mock("@/shared/api", () => ({
  api: { listLikedTracks: mocks.listLikedTracks },
  getAuthSession: () => ({ accessToken: "test-token", user: { id: "test-user" } }),
  toClientTrack: (track: unknown) => track,
}));
vi.mock("@/shared/media/local/localTracks", () => ({
  listLikedLocalTracks: async () => [],
  localRecordToTrack: vi.fn(),
  onLocalTracksChange: vi.fn(),
}));
vi.mock("@/features/local/localLikesSync", () => ({ loadLocalLikes: async () => [] }));
vi.mock("@/features/local/localPlaylistTracks", () => ({ localEntryToTrack: vi.fn() }));

it("reloads recent favorites after a remote change and queues one reload behind an active request", async () => {
  vi.useFakeTimers();
  try {
    const { loadLikedTracks, likedTracksSnapshot } = await import("./useLikedTracks");
    const page = (...ids: string[]) => ({ items: ids.map((id) => ({ track: { id }, likedAt: 1 })), nextCursor: null });
    let finishRequest!: (result: ReturnType<typeof page>) => void;
    mocks.listLikedTracks
      .mockResolvedValueOnce(page("original"))
      .mockImplementationOnce(() => new Promise((resolve) => { finishRequest = resolve; }))
      .mockResolvedValueOnce(page("newest"));

    await loadLikedTracks();
    window.dispatchEvent(new Event("library:changed"));
    expect(mocks.listLikedTracks).toHaveBeenCalledTimes(1);

    const remoteChange = () => window.dispatchEvent(new CustomEvent("library:changed", { detail: { remote: true } }));
    remoteChange();
    expect(mocks.listLikedTracks).toHaveBeenCalledTimes(2);
    remoteChange();
    remoteChange();
    expect(mocks.listLikedTracks).toHaveBeenCalledTimes(2);
    expect(likedTracksSnapshot().map(({ id }) => id)).toEqual(["original"]);

    finishRequest(page("original", "newest"));
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.listLikedTracks).toHaveBeenCalledTimes(3);
    expect(likedTracksSnapshot().map(({ id }) => id)).toEqual(["newest"]);
  } finally {
    vi.useRealTimers();
  }
});
