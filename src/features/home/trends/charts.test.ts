import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchFeed, mergeCharts, withMovement, type ChartSong } from "./charts";

const song = (id: string, artist = "A"): ChartSong => ({ id, title: id, artist, coverUrl: "" });

describe("chart movement", () => {
  beforeEach(() => localStorage.clear());

  it("compares with the previous day's list", () => {
    const first = withMovement("russia", [song("a"), song("b"), song("c")], "2026-10-23");
    expect(first.every((e) => e.movement === "same")).toBe(true);
    const next = withMovement("russia", [song("b"), song("a"), song("d")], "2026-10-24");
    expect(next.map((e) => [e.song.id, e.movement, e.delta])).toEqual([
      ["b", "up", 1],
      ["a", "down", -1],
      ["d", "new", 0],
    ]);
    // a second load the same day still compares with the day before
    const again = withMovement("russia", [song("b"), song("a"), song("d")], "2026-10-24");
    expect(again[0].movement).toBe("up");
  });
});

describe("world chart", () => {
  it("ranks a song high in many countries above a song that tops just one", () => {
    const merged = mergeCharts([
      [song("solo"), song("hit"), song("x1")],
      [song("y1"), song("hit"), song("y2")],
      [song("z1"), song("hit"), song("z2")],
    ]);
    expect(merged[0].id).toBe("hit");
    expect(merged).toHaveLength(7);
  });
});

describe("Apple Music feed", () => {
  afterEach(() => vi.restoreAllMocks());

  it("reads the songs and asks for bigger artwork", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          feed: {
            results: [
              {
                id: "1",
                name: "ДИНАСТИЯ",
                artistName: "VILLIAN & madk1d",
                artworkUrl100: "https://is1-ssl.mzstatic.com/image/thumb/x/100x100bb.jpg",
              },
              { name: "no id" },
            ],
          },
        }),
      ),
    );
    const songs = await fetchFeed("ru", 50);
    expect(songs).toEqual([
      { id: "1", title: "ДИНАСТИЯ", artist: "VILLIAN & madk1d", coverUrl: "https://is1-ssl.mzstatic.com/image/thumb/x/300x300bb.jpg" },
    ]);
    expect(String((globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0])).toContain("/ru/music/most-played/50/songs.json");
  });
});
