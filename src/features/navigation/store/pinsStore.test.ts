import { beforeEach, describe, expect, it } from "vitest";
import { usePinsStore, type SidebarPin } from "./pinsStore";

const pin = (id: string, kind: SidebarPin["kind"] = "playlist"): SidebarPin => ({
  kind,
  id,
  title: `T ${id}`,
  href: kind === "artist" ? `/artist?id=${id}` : `/library/playlist?id=${id}`,
});

beforeEach(() => {
  localStorage.clear();
  usePinsStore.setState({ pins: [] });
});

describe("sidebar pins", () => {
  it("pins once, keeps the order it was given and survives a reload", () => {
    const s = usePinsStore.getState();
    s.pin(pin("a"));
    s.pin(pin("b", "artist"));
    s.pin(pin("a"));
    expect(usePinsStore.getState().pins.map((p) => p.id)).toEqual(["a", "b"]);

    usePinsStore.getState().setOrder([...usePinsStore.getState().pins].reverse());
    usePinsStore.setState({ pins: [] });
    usePinsStore.getState().reload();
    expect(usePinsStore.getState().pins.map((p) => p.id)).toEqual(["b", "a"]);
  });

  it("toggles and tells playlists and artists with the same id apart", () => {
    const s = usePinsStore.getState();
    s.toggle(pin("x"));
    s.toggle(pin("x", "artist"));
    expect(usePinsStore.getState().isPinned("artist", "x")).toBe(true);
    usePinsStore.getState().toggle(pin("x"));
    expect(usePinsStore.getState().pins.map((p) => `${p.kind}:${p.id}`)).toEqual(["artist:x"]);
  });
});
