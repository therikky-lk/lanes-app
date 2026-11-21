import { create } from "zustand";
import { persist } from "zustand/middleware";
export type VisualQuality = "all" | "balanced" | "lite";
export function visualEffects(quality: VisualQuality, mobile = false) {
  const effective = quality;
  // Word timing stays enabled on phones without creating two spans per letter
  // for the entire song while the user is opening the lyrics pane.
  return { liveBackground: effective !== "lite", lyricBlur: !mobile && effective === "all", letterAnimation: !mobile && effective !== "lite" };
}
export const useVisualQualityStore = create<{ quality: VisualQuality; setQuality: (quality: VisualQuality) => void }>()(persist(
  set => ({ quality: "all", setQuality: quality => set({ quality }) }),
  { name: "lane_fullscreen_visual_quality", merge: (saved, current) => {
    const quality = (saved as { quality?: unknown } | undefined)?.quality;
    return { ...current, quality: quality === "balanced" || quality === "lite" ? quality : "all" };
  } },
));
