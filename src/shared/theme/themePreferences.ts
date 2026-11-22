import { create } from "zustand";

export const THEME_PRESETS = ["system", "light", "dark", "amoled", "violet", "ocean", "spotify", "liquid-glass", "ruby", "amber", "coffee"] as const;
export type ThemePreset = typeof THEME_PRESETS[number];
export interface ThemeSettings {
  syncEnabled: boolean;
  preferenceVersion: number;
  preset: ThemePreset;
  themeVersion: number;
}

export function isThemePreset(value: unknown): value is ThemePreset {
  return typeof value === "string" && (THEME_PRESETS as readonly string[]).includes(value);
}

function readInitial(): ThemeSettings {
  const defaults: ThemeSettings = { syncEnabled: false, preferenceVersion: 0, preset: "system", themeVersion: 0 };
  try {
    const saved = JSON.parse(localStorage.getItem("lane_theme_sync") || "null");
    const preset = localStorage.getItem("lane_theme_preset");
    return {
      syncEnabled: saved?.syncEnabled === true,
      preferenceVersion: validVersion(saved?.preferenceVersion) ? saved.preferenceVersion : 0,
      preset: saved?.syncEnabled === true && isThemePreset(saved?.preset)
        ? saved.preset : isThemePreset(preset) ? preset : defaults.preset,
      themeVersion: validVersion(saved?.themeVersion) ? saved.themeVersion : 0,
    };
  } catch { return defaults; }
}

function validVersion(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export const useThemePreferences = create<ThemeSettings>(() => readInitial());
useThemePreferences.subscribe((state) => {
  try {
    localStorage.setItem("lane_theme_preset", state.preset);
    localStorage.setItem("lane_theme_sync", JSON.stringify(state));
  } catch {}
});

export function chooseTheme(preset: ThemePreset) {
  const state = useThemePreferences.getState();
  if (state.preset === preset) return;
  useThemePreferences.setState({ preset, themeVersion: Math.max(Date.now(), state.themeVersion + 1) });
  window.dispatchEvent(new Event("theme:local-change"));
}

export function setThemeSync(syncEnabled: boolean) {
  const state = useThemePreferences.getState();
  if (state.syncEnabled === syncEnabled) return;
  useThemePreferences.setState({
    syncEnabled,
    preferenceVersion: Math.max(Date.now(), state.preferenceVersion + 1),
    // Enabling shares the theme selected on this device.
    ...(syncEnabled ? { themeVersion: Math.max(Date.now(), state.themeVersion + 1) } : {}),
  });
  window.dispatchEvent(new Event("theme:local-change"));
}

/** Merge without rebroadcasting, so remote changes cannot create an echo loop. */
export function receiveThemeSettings(value: unknown) {
  if (!value || typeof value !== "object") return;
  const incoming = value as ThemeSettings;
  if (typeof incoming.syncEnabled !== "boolean" || !isThemePreset(incoming.preset)
    || !validVersion(incoming.preferenceVersion) || !validVersion(incoming.themeVersion)) return;
  const state = useThemePreferences.getState();
  const newerPreference = incoming.preferenceVersion > state.preferenceVersion
    || (incoming.preferenceVersion === state.preferenceVersion && !incoming.syncEnabled);
  const syncEnabled = newerPreference ? incoming.syncEnabled : state.syncEnabled;
  const newerTheme = incoming.themeVersion > state.themeVersion
    || (incoming.themeVersion === state.themeVersion && incoming.preset > state.preset);
  useThemePreferences.setState({
    ...(newerPreference ? { syncEnabled, preferenceVersion: incoming.preferenceVersion } : {}),
    ...(syncEnabled && incoming.syncEnabled && newerTheme
      ? { preset: incoming.preset, themeVersion: incoming.themeVersion } : {}),
  });
}
