// Playlists, albums and artists pinned to the side menu, in the listener's
// order. Kept on this device, per Lane account.
import { create } from "zustand";
import { getAuthSession } from "@/shared/api";

export type PinKind = "playlist" | "album" | "artist";

export interface SidebarPin {
  kind: PinKind;
  id: string;
  title: string;
  imageUrl?: string;
  /** where a click goes, e.g. /artist?id=… */
  href: string;
}

const KEY = "lane_sidebar_pins_v1";
export const MAX_PINS = 30;

type Stored = Record<string, SidebarPin[]>;

function owner(): string {
  return getAuthSession()?.user?.id ?? "guest";
}

function readAll(): Stored {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || "{}") as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Stored) : {};
  } catch {
    return {};
  }
}

function writeMine(pins: SidebarPin[]): void {
  try {
    const all = readAll();
    all[owner()] = pins;
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {}
}

export const pinKey = (kind: PinKind, id: string) => `${kind}:${id}`;

interface PinsState {
  pins: SidebarPin[];
  reload: () => void;
  isPinned: (kind: PinKind, id: string) => boolean;
  pin: (pin: SidebarPin) => void;
  unpin: (kind: PinKind, id: string) => void;
  toggle: (pin: SidebarPin) => void;
  /** new order after a drag */
  setOrder: (pins: SidebarPin[]) => void;
  /** keep the title / cover fresh when the playlist changes */
  refresh: (kind: PinKind, id: string, patch: Partial<Pick<SidebarPin, "title" | "imageUrl">>) => void;
}

export const usePinsStore = create<PinsState>((set, get) => {
  const commit = (pins: SidebarPin[]) => {
    writeMine(pins);
    set({ pins });
  };
  return {
    pins: readAll()[owner()] ?? [],
    reload: () => set({ pins: readAll()[owner()] ?? [] }),
    isPinned: (kind, id) => get().pins.some((p) => p.kind === kind && p.id === id),
    pin: (pin) => {
      if (get().isPinned(pin.kind, pin.id)) return;
      commit([...get().pins, pin].slice(-MAX_PINS));
    },
    unpin: (kind, id) => commit(get().pins.filter((p) => !(p.kind === kind && p.id === id))),
    toggle: (pin) => (get().isPinned(pin.kind, pin.id) ? get().unpin(pin.kind, pin.id) : get().pin(pin)),
    setOrder: (pins) => commit(pins),
    refresh: (kind, id, patch) => {
      const pins = get().pins;
      const i = pins.findIndex((p) => p.kind === kind && p.id === id);
      if (i < 0) return;
      const next = { ...pins[i], ...patch };
      if (next.title === pins[i].title && next.imageUrl === pins[i].imageUrl) return;
      const copy = [...pins];
      copy[i] = next;
      commit(copy);
    },
  };
});

// another account signed in: show its pins
if (typeof window !== "undefined") {
  window.addEventListener("auth:changed", () => usePinsStore.getState().reload());
  // pins changed in another window of the app (the overlay, a second window)
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) usePinsStore.getState().reload();
  });
}
