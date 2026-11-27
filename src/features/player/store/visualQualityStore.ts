import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { KawarpMotion } from "../engine/kawarpEngine";

export type VisualQuality = "all" | "balanced" | "lite";
const BACKDROP: Record<VisualQuality, KawarpMotion> = {
  all: { warpIntensity: 1.1, animationSpeed: 1, saturation: 1.3, maxFps: 60 },
  balanced: { warpIntensity: 0.84, animationSpeed: 0.76, saturation: 1.2, maxFps: 48 },
  lite: { warpIntensity: 0.55, animationSpeed: 0.52, saturation: 1.08, maxFps: 24 },
};

export function backdropMotion(quality: VisualQuality, native = false, lowEnd = false): KawarpMotion {
  const motion = BACKDROP[quality];
  if (!native) return motion;
  const deviceLimit = lowEnd ? 24 : 30;
  return {
    ...motion,
    animationSpeed: motion.animationSpeed * 0.7,
    maxFps: Math.min(motion.maxFps || deviceLimit, deviceLimit),
  };
}

export function visualEffects(quality: VisualQuality, mobile = false) {
  return { lyricBlur: !mobile && quality === "all" };
}
export const useVisualQualityStore = create<{ quality: VisualQuality; setQuality: (quality: VisualQuality) => void }>()(persist(
  set => ({ quality: "all", setQuality: quality => set({ quality }) }),
  { name: "lane_fullscreen_visual_quality", merge: (saved, current) => {
    const quality = (saved as { quality?: unknown } | undefined)?.quality;
    return { ...current, quality: quality === "balanced" || quality === "lite" ? quality : "all" };
  } },
));
