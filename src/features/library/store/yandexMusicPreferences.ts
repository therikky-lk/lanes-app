import { create } from "zustand";
import { persist } from "zustand/middleware";

interface YandexMusicPreferences {
  alsoLike: boolean;
  hideImportedPlaylist: boolean;
  setAlsoLike: (alsoLike: boolean) => void;
  setHideImportedPlaylist: (hideImportedPlaylist: boolean) => void;
}

export const useYandexMusicPreferences = create<YandexMusicPreferences>()(
  persist(
    (set) => ({
      alsoLike: false,
      hideImportedPlaylist: false,
      setAlsoLike: (alsoLike) => set({ alsoLike }),
      setHideImportedPlaylist: (hideImportedPlaylist) => set({ hideImportedPlaylist }),
    }),
    { name: "lane_yandex_music_preferences" },
  ),
);
