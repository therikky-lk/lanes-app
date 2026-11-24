import { beforeEach, describe, expect, it, vi } from "vitest";
import { importSpotify } from "./spotifySource";
import { fetchSpotifyAccountAlbum, fetchSpotifyLikedTracks, fetchSpotifyOAuthPlaylist, spotifyHasLogin, spotifyUserToken, spotifyUsesOAuth, SpotifyRequestError } from "./spotifyAccount";
import { fetchSpotifyEmbed } from "./spotifyEmbed";
import { fetchSpotifyPlaylistTracks } from "./spotifyPathfinder";

vi.mock("./spotifyAccount", () => ({
  fetchSpotifyAccountAlbum: vi.fn(),
  fetchSpotifyLikedTracks: vi.fn(),
  fetchSpotifyOAuthPlaylist: vi.fn(),
  spotifyUserToken: vi.fn(),
  spotifyHasLogin: vi.fn(),
  spotifyAccountSupported: () => true,
  spotifyUsesOAuth: vi.fn(() => false),
  SpotifyRequestError: class extends Error {
    constructor(message: string, readonly status: number) { super(message); }
  },
}));
vi.mock("./spotifyEmbed", () => ({ fetchSpotifyEmbed: vi.fn() }));
vi.mock("./spotifyPathfinder", () => ({ fetchSpotifyPlaylistTracks: vi.fn() }));
vi.mock("../../importedPlaylistMeta", () => ({ rememberSourceMeta: vi.fn() }));

const track = { sourceId: "track1", title: "A track", artists: ["An artist"] };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(spotifyHasLogin).mockResolvedValue(true);
});

describe("Spotify account imports", () => {
  it("uses the signed-in account for album links", async () => {
    vi.mocked(fetchSpotifyAccountAlbum).mockResolvedValue({ title: "My album", coverUrl: undefined, tracks: [track] });
    const url = "https://open.spotify.com/album/album1";
    await expect(importSpotify(url)).resolves.toMatchObject({ title: "My album", tracks: [track] });
    expect(fetchSpotifyAccountAlbum).toHaveBeenCalledWith("album1", undefined);
    expect(fetchSpotifyEmbed).not.toHaveBeenCalled();
  });

  it("falls back to the public album when account lookup fails", async () => {
    vi.mocked(fetchSpotifyAccountAlbum).mockRejectedValue(new Error("Unavailable"));
    vi.mocked(fetchSpotifyEmbed).mockResolvedValue({ title: "Public album", tracks: [track] });
    await expect(importSpotify("https://open.spotify.com/album/album1")).resolves.toMatchObject({ title: "Public album" });
  });

  it("tries the account when a playlist isn't available publicly", async () => {
    vi.mocked(fetchSpotifyEmbed).mockRejectedValue(new Error("Private playlist"));
    vi.mocked(spotifyUserToken).mockResolvedValue("signed-in-token");
    vi.mocked(fetchSpotifyPlaylistTracks).mockImplementation(async (_id, _signal, getToken) => ({
      tracks: getToken && await getToken() === "signed-in-token" ? [track] : [],
      total: undefined,
      title: getToken ? "Your All-Time Top Songs" : undefined,
    }));
    await expect(importSpotify("https://open.spotify.com/playlist/private1")).resolves.toMatchObject({
      title: "Your All-Time Top Songs", tracks: [track],
    });
    expect(fetchSpotifyOAuthPlaylist).not.toHaveBeenCalled();
  });

  it("tries the signed-in playlist API when Android's web player lookup fails", async () => {
    vi.mocked(fetchSpotifyEmbed).mockRejectedValue(new Error("No public embed"));
    vi.mocked(fetchSpotifyPlaylistTracks).mockRejectedValue(new Error("No playlist content"));
    vi.mocked(fetchSpotifyOAuthPlaylist).mockResolvedValue([track]);
    await expect(importSpotify("https://open.spotify.com/playlist/private1")).resolves.toMatchObject({ tracks: [track] });
    expect(fetchSpotifyOAuthPlaylist).toHaveBeenCalledWith("private1", undefined);
  });

  it("imports Liked Songs from the account", async () => {
    vi.mocked(fetchSpotifyLikedTracks).mockResolvedValue([track]);
    await expect(importSpotify("https://open.spotify.com/collection/tracks")).resolves.toMatchObject({ tracks: [track] });
    expect(fetchSpotifyLikedTracks).toHaveBeenCalledOnce();
  });

  it("reports a Spotify permissions restriction without asking a signed-in user to log in again", async () => {
    vi.mocked(spotifyUsesOAuth).mockReturnValue(true);
    vi.mocked(fetchSpotifyEmbed).mockRejectedValue(new Error("No public embed"));
    vi.mocked(fetchSpotifyPlaylistTracks).mockResolvedValue({ tracks: [], total: undefined });
    vi.mocked(fetchSpotifyOAuthPlaylist).mockRejectedValue(new SpotifyRequestError("Forbidden", 403));
    await expect(importSpotify("https://open.spotify.com/playlist/wrapped")).rejects.toThrow(/copy its tracks/i);
    expect(fetchSpotifyOAuthPlaylist).toHaveBeenCalledWith("wrapped", undefined);
  });
});
