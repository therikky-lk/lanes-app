import { describe, expect, it } from "vitest";
import {
  getArtistReleaseBrowses,
  getGridContinuation,
  mapReleaseGrid,
  releaseShelfKind,
} from "./innertubeArtistMapper";

const card = (id: string, title: string, kind: string, year = "2021") => ({
  musicTwoRowItemRenderer: {
    title: { runs: [{ text: title, navigationEndpoint: { browseEndpoint: { browseId: id, browseEndpointContextSupportedConfigs: { browseEndpointContextMusicConfig: { pageType: "MUSIC_PAGE_TYPE_ALBUM" } } } } }] },
    subtitle: { runs: [{ text: kind }, { text: " • " }, { text: year }] },
    navigationEndpoint: { browseEndpoint: { browseId: id, browseEndpointContextSupportedConfigs: { browseEndpointContextMusicConfig: { pageType: "MUSIC_PAGE_TYPE_ALBUM" } } } },
  },
});

const shelf = (title: string, more?: { browseId: string; params: string }) => ({
  musicCarouselShelfRenderer: {
    header: {
      musicCarouselShelfBasicHeaderRenderer: {
        title: { runs: [{ text: title }] },
        ...(more ? { moreContentButton: { buttonRenderer: { navigationEndpoint: { browseEndpoint: more } } } } : {}),
      },
    },
    contents: [card("MPREb_1", "First", "Album")],
  },
});

describe("artist releases", () => {
  it("recognises the shelf labels YouTube Music uses", () => {
    expect(releaseShelfKind("Albums")).toBe("albums");
    expect(releaseShelfKind("Singles & EPs")).toBe("singles");
    expect(releaseShelfKind("Singles and EPs")).toBe("singles");
    expect(releaseShelfKind("Singles")).toBe("singles");
    expect(releaseShelfKind("Videos")).toBeNull();
  });

  it("finds the 'see all' targets of both shelves", () => {
    const body = { contents: [shelf("Albums", { browseId: "UCx", params: "alb" }), shelf("Singles & EPs", { browseId: "UCx", params: "sng" }), shelf("Videos")] };
    expect(getArtistReleaseBrowses(body)).toEqual({
      albums: { browseId: "UCx", params: "alb" },
      singles: { browseId: "UCx", params: "sng" },
    });
  });

  it("maps a whole grid page and its continuation token", () => {
    const page = {
      contents: { gridRenderer: {
        items: [card("MPREb_a", "A", "Album"), card("MPREb_b", "B", "Single"), card("MPREb_c", "C", "EP")],
        continuations: [{ nextContinuationData: { continuation: "TOKEN" } }],
      } },
    };
    const mapped = mapReleaseGrid(page);
    expect(mapped.albums.map((a) => a.id)).toEqual(["MPREb_a"]);
    expect(mapped.singles.map((a) => [a.id, a.releaseType])).toEqual([["MPREb_b", "single"], ["MPREb_c", "ep"]]);
    expect(getGridContinuation(page)).toBe("TOKEN");
    expect(getGridContinuation({ contents: [] })).toBeUndefined();
  });
});
