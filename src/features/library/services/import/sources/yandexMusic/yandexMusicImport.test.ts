import { beforeEach, expect, it, vi } from "vitest";
import type { Track } from "@/shared/contracts";
import { importedPlaylistDescription, readPlaylistSource, stripCoverMarker, withCoverMarker, withDescriptionText } from "../../../playlistCoverMarker";
import { addYandexPlaylistToLikes, importYandexMusic } from "./yandexMusicImport";

const mocks = vi.hoisted(() => ({
  api: {
    listPlaylists: vi.fn(),
    getUserPlaylist: vi.fn(),
    listLikedTracks: vi.fn(),
    likeTrackSnapshot: vi.fn(),
  },
  loadYandexLikedTracks: vi.fn(),
  matchWithRetry: vi.fn(),
  appendImportedPlaylistTracks: vi.fn(),
  finalizeImportedPlaylist: vi.fn(),
}));

vi.mock("@/shared/api", () => ({
  api: mocks.api,
  getAuthSession: () => ({ user: { id: "lane-user" } }),
}));
vi.mock("@/shared/media/matching", () => ({
  normalizeWords: (value: string) => value.replace(/[^\p{L}\p{N}]+/gu, " ").trim(),
  isRateLimit: () => false,
}));
vi.mock("../../../../hooks/useLikedTracks", () => ({ loadLikedTracks: vi.fn() }));
vi.mock("../../../../hooks/usePlaylists", () => ({ notifyLibraryChanged: vi.fn() }));
vi.mock("./yandexMusicSource", () => ({ loadYandexLikedTracks: mocks.loadYandexLikedTracks }));
vi.mock("../../manager/clientImportManager", () => ({ matchWithRetry: mocks.matchWithRetry }));
vi.mock("../../manager/finalizeImport", () => ({
  appendImportedPlaylistTracks: mocks.appendImportedPlaylistTracks,
  finalizeImportedPlaylist: mocks.finalizeImportedPlaylist,
}));

const track = (id: string, title: string, durationMs = 180_000): Track => ({
  id, title, artists: [{ id: "artist", name: "Исполнитель" }], durationMs,
});
const original = track("youtube-original", "Серёдка");
const duplicate = track("sc:duplicate", "Середка", 180_800);
const live = track("sc:live", "Середка (Live)");
const description = importedPlaylistDescription("yandex");
const playlist = { id: "yandex-playlist", description };

function prepareSource(...tracks: Track[]) {
  mocks.loadYandexLikedTracks.mockResolvedValue({
    total: tracks.length,
    tracks: tracks.map(({ id, title, artists, durationMs }) => ({
      sourceId: id, title, artists: artists.map(({ name }) => name), durationMs,
    })),
  });
  const byId = new Map(tracks.map((item) => [item.id, item]));
  mocks.matchWithRetry.mockImplementation(async ({ sourceId }) => ({ status: "approved", track: byId.get(sourceId) }));
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.api.listPlaylists.mockResolvedValue({ items: [playlist] });
  mocks.api.getUserPlaylist.mockResolvedValue({ playlist, items: [{ track: original }] });
  mocks.api.listLikedTracks.mockResolvedValue({ items: [], nextCursor: null });
  mocks.appendImportedPlaylistTracks.mockResolvedValue(1);
  mocks.finalizeImportedPlaylist.mockResolvedValue({ playlistId: playlist.id, saved: 1 });
});

it("reuses the saved playlist, skips duplicate recordings and preserves a live version", async () => {
  prepareSource(duplicate, live);
  const result = await importYandexMusic("token", "Music from Yandex", false, () => {});
  expect(result).toEqual({ playlistId: playlist.id, added: 1, skipped: 0 });
  expect(mocks.matchWithRetry).toHaveBeenCalledTimes(1);
  expect(mocks.appendImportedPlaylistTracks).toHaveBeenCalledWith(playlist.id, [live]);
  expect(mocks.finalizeImportedPlaylist).not.toHaveBeenCalled();
  expect(mocks.api.likeTrackSnapshot).not.toHaveBeenCalled();
});

it("creates a marked playlist and optionally likes the imported track immediately", async () => {
  prepareSource(live);
  mocks.api.listPlaylists.mockResolvedValue({ items: [] });
  const result = await importYandexMusic("token", "Music from Yandex", true, () => {});
  expect(mocks.finalizeImportedPlaylist).toHaveBeenCalledWith("Music from Yandex", description, [live]);
  expect(mocks.api.likeTrackSnapshot).toHaveBeenCalledWith(live.id, live);
  expect(result.likes).toEqual({ added: 1, failed: 0 });

  const edited = withDescriptionText(withCoverMarker(description, "https://example.com/cover.jpg"), "My text");
  expect(readPlaylistSource(edited)).toBe("yandex");
  expect(stripCoverMarker(edited)).toBe("My text");
});

it("copies playlist tracks to favorites without re-adding duplicates from later pages", async () => {
  mocks.api.getUserPlaylist.mockResolvedValue({ playlist, items: [{ track: duplicate }, { track: live }] });
  mocks.api.listLikedTracks
    .mockResolvedValueOnce({ items: [], nextCursor: "page-2" })
    .mockResolvedValueOnce({ items: [{ track: original }], nextCursor: null });
  expect(await addYandexPlaylistToLikes(playlist.id)).toEqual({ added: 1, failed: 0 });
  expect(mocks.api.likeTrackSnapshot).toHaveBeenCalledExactlyOnceWith(live.id, live);
});
