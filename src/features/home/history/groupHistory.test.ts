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

  it("glues a playlist back together when lone tracks come in between (the screenshot case)", () => {
    const pl = { type: "playlist", id: "top" };
    const days = groupHistory([
      { track: tr("vibe1"), listenedAt: "2026-10-24T14:00:00", context: { type: "radio", id: "vibe:-:-:-:a" }, playedMs: 180_000 },
      { track: tr("lone"), listenedAt: "2026-10-24T13:57:00", playedMs: 180_000 },
      { track: tr("vibe2"), listenedAt: "2026-10-24T13:54:00", context: { type: "radio", id: "vibe:-:-:-:b" }, playedMs: 180_000 },
      { track: tr("p1"), listenedAt: "2026-10-24T12:00:00", context: pl, playedMs: 200_000 },
      { track: tr("s1"), listenedAt: "2026-10-24T11:57:00", playedMs: 200_000 },
      { track: tr("p2"), listenedAt: "2026-10-24T11:54:00", context: pl, playedMs: 200_000 },
      { track: tr("s2"), listenedAt: "2026-10-24T11:51:00", playedMs: 200_000 },
      { track: tr("p3"), listenedAt: "2026-10-24T11:48:00", context: pl, playedMs: 200_000 },
    ]);
    expect(days[0].groups.map((g) => [g.source, g.tracks.map((t) => t.id).join(",")])).toEqual([
      ["vibe", "vibe1,lone,vibe2"],
      ["playlist", "p1,s1,p2,s2,p3"],
    ]);
    expect(days[0].plays).toBe(8);
    expect(days[0].playedMs).toBe(3 * 180_000 + 5 * 200_000);
  });

  it("keeps sessions apart across a long break or another source in between", () => {
    const pl = { type: "playlist", id: "top" };
    const days = groupHistory([
      { track: tr("p1"), listenedAt: "2026-10-24T20:00:00", context: pl },
      { track: tr("x"), listenedAt: "2026-10-24T19:57:00", context: { type: "album", id: "al" } },
      { track: tr("p2"), listenedAt: "2026-10-24T19:54:00", context: pl },
      { track: tr("lone"), listenedAt: "2026-10-24T15:00:00" },
      { track: tr("p3"), listenedAt: "2026-10-24T14:57:00", context: pl },
    ]);
    // a single song from an album in between is a detour; the long break still splits
    expect(days[0].groups.map((g) => g.source)).toEqual(["playlist", "track", "playlist"]);
  });

  it("doesn't chop My Vibe into pieces around one-song playlists", () => {
    const vibe = (id: string, at: string) => ({ track: tr(id), listenedAt: at, context: { type: "radio", id: "vibe:-:-:-:a" } });
    const days = groupHistory([
      vibe("v1", "2026-10-24T14:00:00"),
      { track: tr("a"), listenedAt: "2026-10-24T13:57:00", context: { type: "playlist", id: "pl-a" } },
      vibe("v2", "2026-10-24T13:54:00"),
      { track: tr("b"), listenedAt: "2026-10-24T13:51:00", context: { type: "playlist", id: "pl-b" } },
      vibe("v3", "2026-10-24T13:48:00"),
    ]);
    expect(days[0].groups.map((g) => [g.source, g.tracks.length])).toEqual([["vibe", 5]]);
  });
});
