import { create } from "zustand";

export const useArtworkInteractionStore = create<{ active: boolean }>(() => ({ active: false }));
export function setArtworkInteracting(active: boolean): void {
  if (useArtworkInteractionStore.getState().active !== active) useArtworkInteractionStore.setState({ active });
}
