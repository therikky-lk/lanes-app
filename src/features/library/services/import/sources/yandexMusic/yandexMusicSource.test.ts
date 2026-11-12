import { afterEach, expect, it, vi } from "vitest";
import { loadYandexLikedTracks } from "./yandexMusicSource";

const mocks = vi.hoisted(() => ({
  native: vi.fn(() => false),
  request: vi.fn(),
}));

vi.mock("@/shared/platform/native", () => ({ isNativeApp: mocks.native }));
vi.mock("@capacitor/core", () => ({ CapacitorHttp: { request: mocks.request } }));

const result = (data: unknown) => Response.json({ result: data });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  mocks.native.mockReturnValue(false);
  mocks.request.mockReset();
});

it("loads liked metadata in ordered batches of 100 using only the Yandex API", async () => {
  const trackIds = Array.from({ length: 101 }, (_, i) => ({ id: i + 1, albumId: i + 10 }));
  const fetch = vi.fn()
    .mockResolvedValueOnce(result({ account: { uid: 123 } }))
    .mockResolvedValueOnce(result({ library: { tracks: [...trackIds, trackIds[0]] } }))
    .mockResolvedValueOnce(result([{ id: 2, title: "Second", artists: [{ name: "Artist" }] }, { id: "1", title: "First", artists: [{ name: "Artist" }] }]))
    .mockResolvedValueOnce(result([{ id: 101, title: "Last", version: "Live", artists: [{ name: "Artist" }] }]));
  vi.stubGlobal("fetch", fetch);

  const imported = await loadYandexLikedTracks("OAuth test_token_1234");
  expect(imported.total).toBe(101);
  expect(imported.tracks.map(({ sourceId, title }) => [sourceId, title])).toEqual([
    ["1", "First"], ["2", "Second"], ["101", "Last (Live)"],
  ]);
  expect(fetch.mock.calls.map(([url]) => url)).toEqual([
    "https://api.music.yandex.net/account/status",
    "https://api.music.yandex.net/users/123/likes/tracks?if-modified-since-revision=0",
    "https://api.music.yandex.net/tracks",
    "https://api.music.yandex.net/tracks",
  ]);
  expect(fetch.mock.calls[2][1].body.get("track-ids").split(",")).toHaveLength(100);
  expect(fetch.mock.calls[3][1].body.get("track-ids")).toBe("101:110");
  for (const [, options] of fetch.mock.calls) {
    expect(options).toMatchObject({
      credentials: "omit", redirect: "error", headers: { Authorization: "OAuth test_token_1234" },
    });
  }
});

it("honors Retry-After and distinguishes access rejection from a rate limit", async () => {
  vi.useFakeTimers();
  const fetch = vi.fn()
    .mockResolvedValueOnce(new Response(null, { status: 429, headers: { "Retry-After": "3" } }))
    .mockResolvedValueOnce(new Response(null, { status: 403 }));
  vi.stubGlobal("fetch", fetch);
  const outcome = expect(loadYandexLikedTracks("test_token_1234")).rejects.toMatchObject({ code: "access_denied" });
  await vi.advanceTimersByTimeAsync(2_999);
  expect(fetch).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  await outcome;
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("uses the Android transport with redirects disabled", async () => {
  mocks.native.mockReturnValue(true);
  mocks.request
    .mockResolvedValueOnce({ status: 200, headers: {}, data: { result: { account: { uid: 123 } } } })
    .mockResolvedValueOnce({ status: 200, headers: {}, data: { result: { library: { tracks: [] } } } });

  await expect(loadYandexLikedTracks("test_token_1234")).resolves.toEqual({ total: 0, tracks: [] });
  expect(mocks.request).toHaveBeenCalledWith(expect.objectContaining({
    url: "https://api.music.yandex.net/account/status",
    disableRedirects: true,
    headers: expect.objectContaining({ Authorization: "OAuth test_token_1234" }),
  }));
});
