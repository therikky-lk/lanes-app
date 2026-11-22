// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/shared/api";
import { useArtist } from "./useArtist";

vi.mock("@/shared/api", () => ({
  api: { getArtist: vi.fn(), search: vi.fn() },
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

  it("makes the matching profile available while the rest of the catalog is loading", async () => {
    vi.mocked(api.getArtist).mockImplementation((_id, onPreview) => {
      onPreview?.(profile("wrong", "Toxi$"));
      return new Promise(() => {});
    });

    await act(async () => root.render(<TestArtist />));
    expect(current.loading).toBe(true);
    expect(current.data).toMatchObject({ title: "Toxi$" });
  });
});
