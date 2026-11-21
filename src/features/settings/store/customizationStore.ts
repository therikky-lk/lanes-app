import { create } from "zustand";

/** Legacy shape kept so existing view components can use the default opaque styles. */
export interface BlockCustomization {
  opacity: number;
  blur: number;
  dim: number;
}

export interface CustomizationState {
  backgroundImage: string | null;
  backgroundBlur: number;
  backgroundDim: number;
  sidebar: BlockCustomization;
  contentView: BlockCustomization;
  miniplayer: BlockCustomization;
  setBackgroundImage: (image: string | null) => void;
  setBackgroundBlur: (blur: number) => void;
  setBackgroundDim: (dim: number) => void;
  setBlockConfig: (block: "sidebar" | "contentView" | "miniplayer", patch: Partial<BlockCustomization>) => void;
  applyToAllBlocks: (sourceBlock: "sidebar" | "contentView" | "miniplayer") => void;
  resetBlock: (block: "sidebar" | "contentView" | "miniplayer") => void;
  resetAll: () => void;
}

export const MIN_OPACITY = 25;
export const MAX_OPACITY = 100;
export const MIN_BLUR = 10;
export const MAX_BLUR = 40;
export const MIN_DIM = 8;
export const MAX_DIM = 85;
export const DEFAULT_BLOCK_CONFIG: BlockCustomization = { opacity: 100, blur: 0, dim: 0 };
export const DEFAULT_GLASS_CONFIG: BlockCustomization = DEFAULT_BLOCK_CONFIG;

// Remove custom wallpapers and per-block glass values saved by older versions.
try {
  localStorage.removeItem("liner_customization_v1");
  if (typeof indexedDB !== "undefined") indexedDB.deleteDatabase("liner_customization_db");
} catch {}

const noop = () => {};
export const useCustomizationStore = create<CustomizationState>(() => ({
  backgroundImage: null,
  backgroundBlur: 0,
  backgroundDim: 0,
  sidebar: DEFAULT_BLOCK_CONFIG,
  contentView: DEFAULT_BLOCK_CONFIG,
  miniplayer: DEFAULT_BLOCK_CONFIG,
  setBackgroundImage: noop,
  setBackgroundBlur: noop,
  setBackgroundDim: noop,
  setBlockConfig: noop,
  applyToAllBlocks: noop,
  resetBlock: noop,
  resetAll: noop,
}));

export function useIsContentTransparent(): boolean {
  return false;
}

export function getBlockStyle(
  _config: BlockCustomization,
  _isDark: boolean,
  _hasCustomBg: boolean,
): React.CSSProperties {
  return {};
}

export function isGlassThemeActive(): boolean {
  return false;
}

export const selectIsGlassThemeActive = (_state: CustomizationState): boolean => false;
