import { beforeEach, describe, expect, it, vi } from "vitest";
import { chooseCustomColor, chooseTheme, receiveThemeSettings, setThemeSync, useThemePreferences } from "./themePreferences";

beforeEach(() => {
  localStorage.clear();
  useThemePreferences.setState({ preset: "dark", syncEnabled: false, preferenceVersion: 0, themeVersion: 0, customColor: undefined });
});

describe("Lane Connect theme preferences", () => {
  it("shares the current theme when synchronization is enabled", () => {
    setThemeSync(true);
    expect(useThemePreferences.getState()).toMatchObject({ preset: "dark", syncEnabled: true });
    expect(useThemePreferences.getState().themeVersion).toBeGreaterThan(0);
  });
  it("applies a remote theme and switch without echoing a local change", () => {
    const listener = vi.fn();
    window.addEventListener("theme:local-change", listener);
    receiveThemeSettings({ preset: "violet", syncEnabled: true, preferenceVersion: 10, themeVersion: 20 });
    expect(useThemePreferences.getState().preset).toBe("violet");
    expect(listener).not.toHaveBeenCalled();
    window.removeEventListener("theme:local-change", listener);
  });
  it("rejects stale themes and stale enable requests", () => {
    useThemePreferences.setState({ syncEnabled: false, preferenceVersion: 100, themeVersion: 100 });
    receiveThemeSettings({ preset: "light", syncEnabled: true, preferenceVersion: 90, themeVersion: 110 });
    expect(useThemePreferences.getState()).toMatchObject({ preset: "dark", syncEnabled: false });
  });
  it("disables synchronization across devices without changing the local theme", () => {
    useThemePreferences.setState({ syncEnabled: true, preferenceVersion: 10 });
    receiveThemeSettings({ preset: "light", syncEnabled: false, preferenceVersion: 20, themeVersion: 30 });
    expect(useThemePreferences.getState()).toMatchObject({ preset: "dark", syncEnabled: false });
  });
  it("ignores malformed remote settings", () => {
    receiveThemeSettings({ preset: "unknown", syncEnabled: true, preferenceVersion: 10, themeVersion: 20 });
    receiveThemeSettings({ preset: "light", syncEnabled: true, preferenceVersion: Infinity, themeVersion: 20 });
    expect(useThemePreferences.getState().preset).toBe("dark");
  });
  it("persists local theme choices and advances their version", () => {
    chooseTheme("ocean");
    const version = useThemePreferences.getState().themeVersion;
    chooseTheme("ruby");
    expect(useThemePreferences.getState().themeVersion).toBeGreaterThan(version);
    expect(localStorage.getItem("lane_theme_preset")).toBe("ruby");
  });
  it("saves valid custom colors across switches and ignores invalid input", () => {
    chooseTheme("custom");
    chooseCustomColor("#FF0066");
    chooseCustomColor("red");
    chooseTheme("ocean");
    chooseTheme("custom");
    expect(useThemePreferences.getState().customColor).toBe("#ff0066");
    expect(JSON.parse(localStorage.getItem("lane_theme_sync")!).customColor).toBe("#ff0066");
  });
  it("applies a synced custom color with its preset", () => {
    receiveThemeSettings({ preset: "custom", customColor: "#0066ff", syncEnabled: true, preferenceVersion: 10, themeVersion: 20 });
    expect(useThemePreferences.getState()).toMatchObject({ preset: "custom", customColor: "#0066ff" });
  });
});
