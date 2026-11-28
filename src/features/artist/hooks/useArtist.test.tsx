// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, toClientTrack } from "@/shared/api";
import type { ArtistDetails } from "@/shared/contracts";
import { rememberArtistDisplayName } from "@/shared/media/artistIdentity";
import { useArtist } from "./useArtist";

vi.mock("@/shared/api", () => ({
  api: { getArtist: vi.fn(), getTrack: vi.fn(), search: vi.fn() },
  toClientTrack: vi.fn(),
}));

const profile = (id: string, name: string) => ({ id, name, type: "artist" as const, verified: false, tracks: [], albums: [], singles: [] });
const result = (id: string, name: string) => ({ type: "artist" as const, id, name });

describe("useArtist", () => {
  let root: ReturnType<typeof createRoot>;
  let current: ReturnType<typeof useArtist>;

  function TestArtist() {
    current = useArtist("wrong", "Toxi$");
    return null;
  }

  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    root = createRoot(document.createElement("div"));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  });

  it("recovers the selected artist when the recommended card has the wrong ID", async () => {
    vi.mocked(api.getArtist)
      .mockResolvedValueOnce(profile("wrong", "Unknown T"))
      .mockResolvedValueOnce(profile("right", "Toxi$"));
    vi.mocked(api.search).mockResolvedValue({ items: [result("wrong", "Unknown T"), result("right", "Toxi$")] });
    await act(async () => root.render(<TestArtist />));
    expect(current.loading).toBe(false);
    expect(current.data).toMatchObject({ id: "right", title: "Toxi$" });
  });

  it("does not pick the first result when the artist name is ambiguous", async () => {
    vi.mocked(api.getArtist).mockRejectedValue(new Error("Not found"));
    vi.mocked(api.search).mockResolvedValue({ items: [result("one", "Toxi$"), result("two", "Toxi$")] });
    await act(async () => root.render(<TestArtist />));
    expect(current.loading).toBe(false);
    expect(current.data).toBeNull();
    expect(api.getArtist).toHaveBeenCalledTimes(1);
  });

  it("recovers the profile using the credited artist on the selected track", async () => {
    vi.mocked(api.getArtist).mockRejectedValueOnce(new Error("Missing ID"))
      .mockResolvedValueOnce({ ...profile("original", "Another spelling"), albums: [{ id: "album", title: "Album" }] });
    vi.mocked(api.getTrack).mockResolvedValue({
      id: "selected-track", title: "Song", durationMs: 180_000,
      artists: [{ id: "other", name: "Collaborator" }, { id: "original", name: "Artist Credit" }],
    });
    function FromTrack() {
      current = useArtist("stale-id", "Artist Credit", "selected-track");
      return null;
    }
    await act(async () => root.render(<FromTrack />));
    expect(current.data).toMatchObject({ id: "original", title: "Another spelling", albums: [{ title: "Album" }] });
    expect(api.getTrack).toHaveBeenCalledWith("selected-track");
    expect(api.search).not.toHaveBeenCalled();
  });

  it("loads Tonya's official channel while presenting its Ukrainian display name", async () => {
    const id = "UCfmezqOwYi6svvnsXJzPoig";
    rememberArtistDisplayName(id, "Антонина Петровна Матвиенко", "Тоня Матвієнко");
    vi.mocked(api.getArtist).mockResolvedValue({ ...profile(id, "Антонина Петровна Матвиенко"), albums: [{ id: "album", title: "Album" }] });
    function FromSavedTrack() {
      current = useArtist("Tonya Matvienko", "Tonya Matvienko");
      return null;
    }
    await act(async () => root.render(<FromSavedTrack />));
    expect(api.getArtist).toHaveBeenCalledWith(id, expect.any(Function));
    expect(current.data).toMatchObject({ id, title: "Тоня Матвієнко", albums: [{ title: "Album" }] });
    expect(api.search).not.toHaveBeenCalled();
  });

  it("opens the shared original t.A.T.u. profile from an old credit", async () => {
    const id = "UChTBSId6VeDfiIEuRvqTO6A";
    vi.mocked(api.getArtist).mockResolvedValue({ ...profile(id, "t.A.T.u."), tracks: [
      { id: "robot", title: "Робот", artists: [{ id, name: "t.A.T.u." }], durationMs: 200_000 },
    ] });
    vi.mocked(toClientTrack).mockReturnValue({ id: "robot", title: "Робот", artists: "t.A.T.u.", coverUrl: "", durationMs: 200_000, playCount: 0 });
    function OldCredit() {
      current = useArtist("stale-credit", "t.A.T.u.");
      return null;
    }
    await act(async () => root.render(<OldCredit />));
    expect(api.getArtist).toHaveBeenCalledWith(id, expect.any(Function));
    expect(api.search).not.toHaveBeenCalled();
    expect(current.data).toMatchObject({ id, title: "t.A.T.u.", tracks: [{ title: "Робот" }] });
  });

  it("recovers a populated profile when an old ID returns an empty catalog", async () => {
    vi.mocked(api.getArtist).mockResolvedValueOnce(profile("wrong", "Toxi$"))
      .mockResolvedValueOnce({ ...profile("original", "Toxi$"), tracks: [
        { id: "song", title: "Song", artists: [{ id: "original", name: "Toxi$" }], durationMs: 200_000 },
      ] });
    vi.mocked(api.search).mockResolvedValue({ items: [result("unrelated", "Toxic"), result("original", "Toxi$")] });
    vi.mocked(toClientTrack).mockReturnValue({ id: "song", title: "Song", artists: "Toxi$", coverUrl: "", durationMs: 200_000, playCount: 0 });
    await act(async () => root.render(<TestArtist />));
    expect(current.data).toMatchObject({ id: "original", tracks: [{ title: "Song" }] });
  });

  it("makes the matching profile available while the rest of the catalog is loading", async () => {
    vi.mocked(api.getArtist).mockImplementation((_id, onPreview) => {
      onPreview?.(profile("wrong", "Toxi$"));
      return new Promise(() => {});
    });

    await act(async () => root.render(<TestArtist />));
    expect(current.loading).toBe(true);
    expect(current.data).toMatchObject({ title: "Toxi$" });
  });

  it("shows Khrystyna Soloviy's catalog when opened from a Ukrainian track credit", async () => {
    const id = "UCFpAfa7PvHFd1hejLtqAtqQ";
    const credit = { id, name: "Христина Соловій" };
    rememberArtistDisplayName(id, "Khrystyna Soloviy", credit.name);
    const tracks: ArtistDetails["tracks"] = [
      { id: "trymai", title: "Тримай", artists: [credit], durationMs: 210_000 },
      { id: "fortepiano", title: "Фортепіано", artists: [credit], durationMs: 220_000 },
    ];
    vi.mocked(api.getArtist).mockResolvedValue({ ...profile(id, "Khrystyna Soloviy"), tracks });
    vi.mocked(toClientTrack).mockImplementation(({ id, title, durationMs }) => ({
      id, title, artists: credit.name, durationMs, playCount: 0, coverUrl: "",
    }));
    function FromTrack() {
      current = useArtist("stale-credit-id", credit.name);
      return null;
    }
    await act(async () => root.render(<FromTrack />));
    expect(api.getArtist).toHaveBeenCalledWith(id, expect.any(Function));
    expect(api.search).not.toHaveBeenCalled();
    expect(current.data?.title).toBe("Христина Соловій");
    expect(current.data?.tracks.map(track => track.title)).toEqual(["Тримай", "Фортепіано"]);
  });
});
