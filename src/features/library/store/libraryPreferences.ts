import { create } from "zustand";
import type { LibraryTab, LibraryViewMode } from "../types";

const REMEMBER_VIEW_KEY = "lane_library_remember_view_v1";
const REMEMBER_CATEGORY_KEY = "lane_library_remember_category_v1";
const REMEMBER_LAYOUT_KEY = "lane_library_remember_layout_v1";
const ACTIVE_TAB_KEY = "lane_library_active_tab_v1";
const VIEW_MODE_KEY = "liner_library_view_mode";

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function readSavedLibraryTab(): LibraryTab | null {
  try {
    const tab = localStorage.getItem(ACTIVE_TAB_KEY);
    return tab === "all" || tab === "playlists" || tab === "albums" || tab === "artists" ? tab : null;
  } catch {
    return null;
  }
}

export function readSavedLibraryView(): LibraryViewMode | null {
  try {
    const view = localStorage.getItem(VIEW_MODE_KEY);
    return view === "grid" || view === "list" ? view : null;
  } catch {
    return null;
  }
}

export function saveLibraryDisplay(tab: LibraryTab, view: LibraryViewMode, rememberCategory: boolean, rememberLayout: boolean): void {
  try {
    if (rememberCategory) localStorage.setItem(ACTIVE_TAB_KEY, tab);
    if (rememberLayout) localStorage.setItem(VIEW_MODE_KEY, view);
  } catch {
    // Keep the current session usable if storage is unavailable.
  }
}

interface LibraryPreferencesState {
  rememberCategory: boolean;
  rememberLayout: boolean;
  setRememberCategory: (remember: boolean) => void;
  setRememberLayout: (remember: boolean) => void;
}

function readMigratedFlag(key: string): boolean {
  try {
    const stored = localStorage.getItem(key);
    return stored === null ? readFlag(REMEMBER_VIEW_KEY) : stored === "1";
  } catch {
    return false;
  }
}

export const useLibraryPreferences = create<LibraryPreferencesState>((set) => ({
  rememberCategory: readMigratedFlag(REMEMBER_CATEGORY_KEY),
  rememberLayout: readMigratedFlag(REMEMBER_LAYOUT_KEY),
  setRememberCategory: (remember) => {
    try {
      localStorage.setItem(REMEMBER_CATEGORY_KEY, remember ? "1" : "0");
      if (!remember) {
        localStorage.removeItem(ACTIVE_TAB_KEY);
      }
    } catch {
      // Keep the setting responsive even when storage is unavailable.
    }
    set({ rememberCategory: remember });
  },
  setRememberLayout: (remember) => {
    try {
      localStorage.setItem(REMEMBER_LAYOUT_KEY, remember ? "1" : "0");
      if (!remember) localStorage.removeItem(VIEW_MODE_KEY);
    } catch {
      // Keep the setting responsive even when storage is unavailable.
    }
    set({ rememberLayout: remember });
  },
}));
