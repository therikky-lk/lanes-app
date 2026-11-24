import { expect, it } from "vitest";
import type { Track } from "@/shared/types/track";
import { groupHistory, sourceOf } from "./groupHistory";

it("distinguishes country mixes and both kinds of daily mix from regular playlists", () => {
  const context = (id: string) => ({ type: "playlist", id });
  const serverMixes = new Set(["daily-recommendation-id"]);
  expect(sourceOf(context("country-mix-RS"))).toEqual({ source: "country-mix", id: "country-mix-RS" });
  expect(sourceOf(context("lane-mix-4"))).toEqual({ source: "mix", id: "lane-mix-4" });
  expect(sourceOf(context("daily-recommendation-id"), serverMixes)).toEqual({ source: "mix", id: "daily-recommendation-id" });
  expect(sourceOf(context("PL-example"), serverMixes)).toEqual({ source: "playlist", id: "PL-example" });
});

it("groups tracks from the same country but keeps different countries separate", () => {
  const [day] = groupHistory(["RS", "RS", "VN"].map((country, i) => ({
    track: { id: String(i), title: String(i), artists: "Artist", durationMs: 120_000, coverUrl: "" } as Track,
    context: { type: "playlist", id: `country-mix-${country}` },
    listenedAt: `2026-11-24T18:00:0${3 - i}`,
  })));
  expect(day.groups.map(g => [g.source, g.id, g.tracks.length])).toEqual([
    ["country-mix", "country-mix-RS", 2], ["country-mix", "country-mix-VN", 1],
  ]);
});
