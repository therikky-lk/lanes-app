import { afterEach, expect, it, vi } from "vitest";
import type { ArtistDetails } from "@/shared/contracts";
import { loadArtistWithFallback } from "./artistFallback";

const artist = (): ArtistDetails => ({
  type: "artist", id: "billie", name: "Billie Eilish", verified: true,
  tracks: [{ id: "old-song", title: "Song", artists: [], durationMs: 1000 }],
  albums: [{ id: "old", title: "Happier Than Ever", year: 2021 }],
  singles: [],
});

afterEach(() => vi.useRealTimers());

it("enriches a successful but incomplete catalog and sorts new releases first", async () => {
  const client = artist();
  const server = artist();
  server.albums.push({ id: "new", title: "HIT ME HARD AND SOFT", year: 2024 });
  server.tracks.push({ id: "new-song", title: "New song", artists: [], durationMs: 1000 });
  server.singles.push({ id: "single", title: "Single", releaseType: "single", year: 2023 });
  const result = await loadArtistWithFallback(async () => client, async () => server);
  expect(result.albums.map((item) => item.id)).toEqual(["new", "old"]);
  expect(result.tracks.map((item) => item.id)).toEqual(["old-song", "new-song"]);
  expect(result.singles).toEqual(server.singles);
  expect(client.albums).toHaveLength(1);
});

it("does not erase client releases when the server has a smaller catalog", async () => {
  const client = artist();
  const server = { ...artist(), tracks: [], albums: [] };
  const result = await loadArtistWithFallback(async () => client, async () => server);
  expect(result.tracks).toEqual(client.tracks);
  expect(result.albums).toEqual(client.albums);
});

it("keeps the client catalog if the server fails", async () => {
  const client = artist();
  expect(await loadArtistWithFallback(async () => client, async () => { throw new Error("404"); })).toBe(client);
});

it("uses the server when the client fails", async () => {
  const server = artist();
  expect(await loadArtistWithFallback(async () => { throw new Error("offline"); }, async () => server)).toBe(server);
});

it("does not merge a different artist", async () => {
  const client = artist();
  expect(await loadArtistWithFallback(async () => client, async () => ({ ...artist(), id: "other" }))).toBe(client);
});

it("bounds the wait for an unresponsive optional server", async () => {
  vi.useFakeTimers();
  const client = artist();
  const result = loadArtistWithFallback(async () => client, () => new Promise(() => {}), 500);
  await vi.advanceTimersByTimeAsync(500);
  expect(await result).toBe(client);
});

it("does not fall back after cancellation", async () => {
  const server = vi.fn();
  const error = new DOMException("Aborted", "AbortError");
  await expect(loadArtistWithFallback(async () => { throw error; }, server)).rejects.toBe(error);
  expect(server).not.toHaveBeenCalled();
});
