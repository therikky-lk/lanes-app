import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMock = vi.hoisted(() => ({
  createPlaylist: vi.fn(),
  addPlaylistTrackSnapshots: vi.fn(),
  addPlaylistTrack: vi.fn(),
  deletePlaylist: vi.fn(),
}));

vi.mock("@/shared/api", () => ({
  api: apiMock,
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string) { super(message); }
  },
}));

import { finalizeImportedPlaylist } from "./finalizeImport";
import type { Track } from "@/shared/contracts";

function tracks(count: number): Track[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `track-${index}`,
    title: `Track ${index}`,
    artists: [],
    durationMs: 180_000,
  }));
}

function fullResult(items: Track[]) {
  return {
    items: items.map((track, index) => ({
      id: `item-${track.id}`,
      track,
      position: index,
      addedAt: new Date(0).toISOString(),
    })),
    added: items.length,
    rejected: 0,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.createPlaylist.mockResolvedValue({ id: "new-playlist" });
  apiMock.deletePlaylist.mockResolvedValue(undefined);
});

describe("finalizeImportedPlaylist", () => {
  it("saves all tracks across 100-track request chunks", async () => {
    const input = tracks(231);
    apiMock.addPlaylistTrackSnapshots.mockImplementation(async (_playlistId: string, chunk: Track[]) => fullResult(chunk));

    const result = await finalizeImportedPlaylist("Playlist", undefined, input);

    expect(result.saved).toBe(231);
    expect(apiMock.addPlaylistTrackSnapshots.mock.calls.map((call) => call[1].length)).toEqual([100, 100, 31]);
    expect(apiMock.addPlaylistTrack).not.toHaveBeenCalled();
  });

  it("retries tracks the bulk endpoint reports as rejected", async () => {
    const input = tracks(3);
    apiMock.addPlaylistTrackSnapshots.mockResolvedValue({
      items: fullResult(input.slice(0, 2)).items,
      added: 2,
      rejected: 1,
    });
    apiMock.addPlaylistTrack.mockResolvedValue({});

    const result = await finalizeImportedPlaylist("Playlist", undefined, input);

    expect(result.saved).toBe(3);
    expect(apiMock.addPlaylistTrack).toHaveBeenCalledWith("new-playlist", "track-2", input[2]);
  });

  it("fails and removes the partial playlist if a rejected track cannot be saved", async () => {
    const input = tracks(2);
    apiMock.addPlaylistTrackSnapshots.mockResolvedValue({ items: [], added: 0, rejected: 2 });
    apiMock.addPlaylistTrack.mockRejectedValue(new Error("save failed"));

    await expect(finalizeImportedPlaylist("Playlist", undefined, input)).rejects.toThrow("Could not save");
    expect(apiMock.deletePlaylist).toHaveBeenCalledWith("new-playlist");
  });

  it("keeps the saved chunk and sends no further writes after cancellation", async () => {
    const controller = new AbortController();
    apiMock.addPlaylistTrackSnapshots.mockImplementationOnce(async (_playlistId: string, chunk: Track[]) => {
      controller.abort();
      return fullResult(chunk);
    });

    await expect(finalizeImportedPlaylist("Playlist", undefined, tracks(231), controller.signal))
      .rejects.toMatchObject({ name: "AbortError" });
    expect(apiMock.addPlaylistTrackSnapshots).toHaveBeenCalledTimes(1);
    expect(apiMock.addPlaylistTrack).not.toHaveBeenCalled();
    expect(apiMock.deletePlaylist).not.toHaveBeenCalled();
  });
});
