import { afterEach, expect, it, vi } from "vitest";
import { fetchSpotifyAccountProfile, spotifyLikedCount, spotifyRetryAt } from "./spotifyAccount";

vi.mock("@/shared/platform/native", () => ({ isNativeApp: () => false }));
vi.mock("./spotifyAuth", () => ({ buildSpotifyTokenUrl: async () => "https://open.spotify.com/api/token" }));

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.removeItem("lane_spotify_retry_at");
});

it("reads Spotify identity, caches it, and stops subsequent requests after a 429", async () => {
  vi.stubGlobal("linerElectron", {
    spotifyFetch: async () => ({ status: 200, body: '{"accessToken":"test","isAnonymous":false}' }),
  });
  const request = vi.fn()
    .mockResolvedValueOnce(Response.json({ id: "listener", display_name: "My name", images: [{ url: "https://i.scdn.co/avatar" }] }))
    .mockResolvedValueOnce(new Response(null, { status: 429, headers: { "retry-after": "120" } }));
  vi.stubGlobal("fetch", request);

  const before = Date.now();
  await expect(fetchSpotifyAccountProfile()).resolves.toEqual({ id: "listener", displayName: "My name", avatarUrl: "https://i.scdn.co/avatar" });
  await expect(spotifyLikedCount()).rejects.toMatchObject({ status: 429, retryAfterMs: 120_000 });
  await expect(spotifyLikedCount()).rejects.toMatchObject({ status: 429 });
  await expect(fetchSpotifyAccountProfile()).resolves.toMatchObject({ id: "listener" });
  expect(spotifyRetryAt()).toBeGreaterThanOrEqual(before + 120_000);
  expect(request).toHaveBeenCalledTimes(2);
});

it("loads a profile through the OAuth bridge without fetching a web player token", async () => {
  vi.resetModules();
  const oauthRead = vi.fn().mockResolvedValue({
    status: 200, body: '{"id":"oauth-user","display_name":"OAuth User","images":[]}',
  });
  vi.stubGlobal("linerElectron", { spotifyOAuthRead: oauthRead, spotifyLogout: async () => true });
  const request = vi.fn();
  vi.stubGlobal("fetch", request);
  const oauth = await import("./spotifyAccount");
  await expect(oauth.fetchSpotifyAccountProfile()).resolves.toMatchObject({ displayName: "OAuth User" });
  expect(oauthRead).toHaveBeenCalledWith("/me");
  expect(request).not.toHaveBeenCalled();
  await oauth.spotifyLogout();
});
