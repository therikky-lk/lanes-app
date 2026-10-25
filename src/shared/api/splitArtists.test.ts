import { describe, expect, it } from "vitest";
import { splitJoinedArtists } from "./track";

describe("splitJoinedArtists", () => {
  it("splits names that came joined, keeps linked bands whole", () => {
    expect(splitJoinedArtists([{ id: "", name: "Koss & ПЛУТТО" }])).toEqual([
      { id: "", name: "Koss" },
      { id: "", name: "ПЛУТТО" },
    ]);
    expect(splitJoinedArtists([{ id: "UCsg", name: "Simon & Garfunkel" }])).toEqual([{ id: "UCsg", name: "Simon & Garfunkel" }]);
    expect(splitJoinedArtists([{ id: "UCk", name: "Koss" }, { id: "", name: "Koss" }, { id: "", name: "Toxi$ feat. Дора" }])).toEqual([
      { id: "UCk", name: "Koss" },
      { id: "", name: "Toxi$" },
      { id: "", name: "Дора" },
    ]);
  });
});
