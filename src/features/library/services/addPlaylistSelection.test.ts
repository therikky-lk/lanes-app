import { expect, it, vi } from "vitest";
import type { Track } from "@/shared/contracts";
import { addPlaylistSelection } from "./addPlaylistSelection";

const mocks = vi.hoisted(() => ({
  getPlaylist: vi.fn(),
  append: vi.fn(),
  notify: vi.fn(),
  localEntry: vi.fn(),
}));

vi.mock("@/shared/api", () => ({ api: { getUserPlaylist: mocks.getPlaylist } }));
vi.mock("../hooks/usePlaylists", () => ({ notifyLibraryChanged: mocks.notify }));
vi.mock("./import/manager/finalizeImport", () => ({ appendImportedPlaylistTracks: mocks.append }));
vi.mock("@/features/local/localPlaylistTracks", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/features/local/localPlaylistTracks")>(),
  buildLocalPlaylistEntry: mocks.localEntry,
}));

const track = (id: string): Track => ({ id, title: id, artists: [], durationMs: 1000 });

it("adds the selected tracks in one batch, skipping duplicate IDs and preserving local-file metadata", async () => {
  const existing = track("existing");
  const online = track("online");
  const local = track("local:file");
  mocks.getPlaylist.mockResolvedValue({ playlist: {}, items: [{ track: existing }] });
  mocks.localEntry.mockResolvedValue({
    ...local, artists: "Artist", deviceId: "device", deviceName: "Phone", addedAt: 0,
  });
  mocks.append.mockResolvedValue(2);

  await expect(addPlaylistSelection("target", [existing, online, online, local])).resolves.toBe(2);
  expect(mocks.append).toHaveBeenCalledExactlyOnceWith("target", [
    online,
    { ...local, artists: [{ id: "", name: "Artist" }], album: { id: "lane-device:device", title: "Phone" } },
  ]);
  expect(mocks.notify).toHaveBeenCalledTimes(1);
});
