import { describe, expect, it } from "vitest";
import { genreTags, paceTag } from "./trackTags";

describe("track tags", () => {
  it("maps Deezer genres to tags", () => {
    expect(genreTags(["Rap/Hip Hop"])).toEqual(["rap"]);
    expect(genreTags(["Pop", "Dance"])).toEqual(expect.arrayContaining(["pop", "electronic"]));
    expect(genreTags(["R&B", "Soul & Funk"])).toEqual(["rnb"]);
    expect(genreTags(["Alternative"])).toEqual(["rock"]);
  });

  it("calls the pace from the tempo", () => {
    expect(paceTag(140)).toBe("fast");
    expect(paceTag(80)).toBe("slow");
    expect(paceTag(105)).toBeUndefined();
    expect(paceTag(0)).toBeUndefined();
  });
});
