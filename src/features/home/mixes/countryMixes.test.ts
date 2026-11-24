import { beforeEach, expect, it, vi } from "vitest";
import type { Track } from "@/shared/types";
import { COUNTRY_MIX_COUNTRIES, COUNTRY_MIX_SIZE, countryFromMixId, countryMixId, loadCountryMix } from "./countryMixes";
import { countriesInGroup, countryGroup } from "../vibe/vibeLanguages";

const mocks = vi.hoisted(() => ({
  fetchFeed: vi.fn(),
  resolveSong: vi.fn(),
  search: vi.fn(),
  getPlaylist: vi.fn(),
}));

vi.mock("../trends/charts", () => ({ fetchFeed: mocks.fetchFeed, resolveSong: mocks.resolveSong }));
vi.mock("@/shared/api", () => ({
  api: { search: mocks.search, getPlaylist: mocks.getPlaylist },
  toClientTrack: (track: Track) => track,
}));

const song = (id: string) => ({ id, title: id, artist: "Artist", coverUrl: "" });
const track = (id: string) => ({ id, title: id, artists: "Artist", durationMs: 180_000, coverUrl: "" });

beforeEach(() => vi.resetAllMocks());

it("makes a route for each unique region", () => {
  expect(COUNTRY_MIX_COUNTRIES).toContain("RU");
  expect(COUNTRY_MIX_COUNTRIES).toContain("US");
  expect(new Set(COUNTRY_MIX_COUNTRIES).size).toBe(COUNTRY_MIX_COUNTRIES.length);
  for (const country of COUNTRY_MIX_COUNTRIES) expect(countryFromMixId(countryMixId(country))).toBe(country);
  expect(countryFromMixId("country-mix-XX")).toBeNull();
  expect(COUNTRY_MIX_COUNTRIES.filter(country => !countryGroup(country))).toEqual([]);
  expect(COUNTRY_MIX_COUNTRIES).toEqual(expect.arrayContaining(["EE", "VN"]));
  expect(countryGroup("EE")).toBe("europe");
  expect(countryGroup("VN")).toBe("asia");
  expect(countriesInGroup(["BR", "PE", "US", "DE"], "americas", country => country)).toEqual(["US", "BR", "PE"]);
});

it("takes 25 unique playable tracks in chart order", async () => {
  mocks.fetchFeed.mockResolvedValue(Array.from({ length: 40 }, (_, i) => song(String(i))));
  mocks.resolveSong.mockImplementation(({ id }) => Promise.resolve(id === "0" ? null : track(id === "2" ? "1" : id)));
  const tracks = await loadCountryMix("US");
  expect(tracks).toHaveLength(COUNTRY_MIX_SIZE);
  expect(tracks.slice(0, 3).map(t => t.id)).toEqual(["1", "3", "4"]);
  expect(mocks.fetchFeed).toHaveBeenCalledWith("us", 50, expect.any(AbortSignal));
  expect(mocks.search).not.toHaveBeenCalled();
});

it("uses regional playlists when an Apple chart is unavailable", async () => {
  mocks.fetchFeed.mockRejectedValue(new Error("no chart"));
  mocks.search.mockImplementation((_query, type) => Promise.resolve({
    items: type === "playlist" ? [{ type, id: "regional" }] : [],
  }));
  mocks.getPlaylist.mockResolvedValue({ tracks: Array.from({ length: 30 }, (_, i) => track(String(i))) });
  expect(await loadCountryMix("JP")).toHaveLength(COUNTRY_MIX_SIZE);
  expect(mocks.search).toHaveBeenCalledWith("日本語の曲", "playlist");
  expect(mocks.getPlaylist).toHaveBeenCalledOnce();
});
