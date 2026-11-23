import { create } from "zustand";
import { persist } from "zustand/middleware";

export const useSpotifyPreferences = create<{
  hideImportedPlaylists: boolean;
  setHideImportedPlaylists: (value: boolean) => void;
}>()(persist(
  set => ({
    hideImportedPlaylists: false,
    setHideImportedPlaylists: hideImportedPlaylists => set({ hideImportedPlaylists }),
  }),
  { name: "lane-spotify-preferences" },
));
