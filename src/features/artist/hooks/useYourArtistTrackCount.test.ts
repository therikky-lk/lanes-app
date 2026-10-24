import { describe, expect, it } from "vitest";
import { countArtistTracks } from "./useYourArtistTrackCount";
import type { Track } from "@/shared/types";

const track = (over: Partial<Track>): Track => ({
  id: Math.random().toString(36),
  title: "x",
  artists: "",
  coverUrl: "",
  durationMs: 0,
  playCount: 0,
  ...over,
});

describe("countArtistTracks", () => {
  it("counts by artist id and by name, once per track", () => {
    const tracks = [
      track({ artists: "Земфира", artistList: [{ id: "UCz", name: "Земфира" }] }),
      track({ artists: "Земфира, Би-2", artistList: [{ id: "UCz", name: "Земфира" }, { id: "UCb", name: "Би-2" }] }),
      track({ artists: "земфира" }),
      track({ artists: "Other", artistList: [{ id: "UCo", name: "Other" }] }),
    ];
    expect(countArtistTracks(tracks, { id: "UCz", name: "Земфира" })).toBe(3);
    expect(countArtistTracks(tracks, { id: "UCb", name: "Би-2" })).toBe(1);
  });

  it("doesn't count tracks without an artist id as a match for an empty id", () => {
    const tracks = [track({ artists: "A" }), track({ artists: "B", artistId: "" })];
    expect(countArtistTracks(tracks, { id: "", name: "C" })).toBe(0);
  });
});
