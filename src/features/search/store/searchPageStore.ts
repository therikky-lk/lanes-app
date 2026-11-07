import { create } from "zustand";
import type { PageSearchFilter } from "../hooks/usePageSearch";

// Keep the current search when switching tabs or opening an album/artist.
export const useSearchPageStore = create<{
  query: string;
  filter: PageSearchFilter;
  setQuery: (query: string) => void;
  setFilter: (filter: PageSearchFilter) => void;
}>((set) => ({ query: "", filter: "all", setQuery: (query) => set({ query }), setFilter: (filter) => set({ filter }) }));
