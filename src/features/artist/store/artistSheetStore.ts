import { create } from "zustand";

export interface ArtistSheetArtist {
  /** artist id, or the name when the track only knows the name */
  id: string;
  name: string;
}

interface ArtistSheetState {
  artists: ArtistSheetArtist[];
  /** the one that was tapped, shown big */
  selectedId: string | null;
  onNavigate: (() => void) | null;
  open: (artists: ArtistSheetArtist[], selectedId: string, onNavigate?: () => void) => void;
  close: () => void;
}

// phone layout: tapping an artist name slides up a sheet (round avatar,
// name, how many of their songs you have) instead of jumping straight away
export const useArtistSheetStore = create<ArtistSheetState>((set) => ({
  artists: [],
  selectedId: null,
  onNavigate: null,
  open: (artists, selectedId, onNavigate) => set({ artists, selectedId, onNavigate: onNavigate ?? null }),
  close: () => set({ selectedId: null, onNavigate: null }),
}));
