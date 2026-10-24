import { describe, expect, it } from "vitest";
import { groupHistory } from "./groupHistory";

const tr = (id: string) => ({ id, title: id, artists: "A", coverUrl: "", durationMs: 1, playCount: 0 });

describe("history grouping", () => {
  it("groups by day, then by source; single tracks stay apart", () => {
    const days = groupHistory([
      { track: tr("a"), listenedAt: "2026-10-24T12:00:00", context: { type: "playlist", id: "p1" } },
      { track: tr("b"), listenedAt: "2026-10-24T11:58:00", context: { type: "playlist", id: "p1" } },
      { track: tr("c"), listenedAt: "2026-10-24T11:50:00" },
      { track: tr("d"), listenedAt: "2026-10-24T11:45:00" },
      { track: tr("e"), listenedAt: "2026-10-23T20:00:00", context: { type: "radio", id: "vibe:-:happy:-:x" } },
      { track: tr("f"), listenedAt: "2026-10-23T19:57:00", context: { type: "radio", id: "vibe:-:happy:-:x" } },
    ]);
    expect(days).toHaveLength(2);
    expect(days[0].groups.map((g) => [g.source, g.tracks.length])).toEqual([
      ["playlist", 2],
      ["track", 1],
      ["track", 1],
    ]);
    expect(days[1].groups.map((g) => [g.source, g.tracks.length])).toEqual([["vibe", 2]]);
  });
});
