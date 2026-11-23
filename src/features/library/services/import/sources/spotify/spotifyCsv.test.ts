import { expect, it } from "vitest";
import { parseSpotifyCsv } from "./spotifyCsv";

it("reads Exportify metadata and skips episodes and local tracks", () => {
  const csv = [
    "\uFEFFTrack URI,Track Name,Artist Name(s),Album Name,Track Duration (ms)",
    'spotify:track:abc,"Song, ""Live""","First\\, Jr., Second",Album,180000',
    "spotify:episode:def,Talk,Host,,5000",
    "spotify:local:file,Local,Artist,,5000",
  ].join("\r\n");
  expect(parseSpotifyCsv(csv, "Liked Songs.csv")).toEqual({
    source: "spotify", sourceUrl: "", title: "Liked Songs",
    tracks: [{ sourceId: "abc", title: 'Song, "Live"', artists: ["First, Jr.", "Second"], album: "Album", durationMs: 180000 }],
  });
});

it("rejects the album-list export, which contains no individual tracks", () => {
  expect(() => parseSpotifyCsv("Album URI,Album Name", "saved_albums.csv")).toThrow();
});
