import { useState, useEffect, type ReactNode } from "react";
import { LuMonitor, LuSun, LuMoon, LuMoonStar, LuDroplets } from "react-icons/lu";
import { useTranslation, LOCALE_OPTIONS } from "@/languages";
import { Select, ToggleSwitch } from "@/shared/ui";
import { useLibraryPreferences } from "@/features/library/store/libraryPreferences";
import { useOfflineLibraryStore } from "@/features/library/offline/offlineLibraryStore";
import { SettingRow, SettingSection } from "../controls";
import { useIsMobile } from "@/shared/hooks/useIsMobile";
import { nativePlatform } from "@/shared/platform/native";
import { chooseCustomColor, chooseTheme, DEFAULT_CUSTOM_COLOR, useThemePreferences, type ThemePreset } from "@/shared/theme/themePreferences";
import ThemeColorPicker from "../ThemeColorPicker";


function presetIcon(preset: ThemePreset, customColor?: string): ReactNode {
  const colors: Partial<Record<ThemePreset, string>> = {
    amoled: "#fff",
    violet: "#a78bfa",
    ocean: "#38bdf8",
    spotify: "#1ed760",
    ruby: "#f87171",
    amber: "#facc15",
    coffee: "#d6b59a",
    custom: `color-mix(in srgb, ${customColor ?? DEFAULT_CUSTOM_COLOR} 25%, #bfc0c9)`,
  };
  if (preset === "system") return <LuMonitor size={16} />;
  if (preset === "light") return <LuSun size={16} />;
  if (preset === "dark") return <LuMoon size={16} />;
  if (preset === "amoled") return <LuMoonStar size={16} />;
  if (preset === "liquid-glass") return <LuDroplets size={16} />;
  return <span aria-hidden="true" className="inline-block h-[12px] w-[12px] rounded-full" style={{ background: colors[preset] }} />;
}

export function AppearanceTab({ searchQuery }: { searchQuery?: string }) {
  const { t, locale, setLocale } = useTranslation();
  const [mounted, setMounted] = useState(false);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const isMobile = useIsMobile();
  const glassAvailable = isMobile && !window.linerElectron && nativePlatform() !== "ios";
  const preset = useThemePreferences((state) => state.preset);
  const customColor = useThemePreferences((state) => state.customColor ?? DEFAULT_CUSTOM_COLOR);
  const themePreset = preset === "liquid-glass" && !glassAvailable ? "dark" : preset;
  const rememberLibraryCategory = useLibraryPreferences((state) => state.rememberCategory);
  const rememberLibraryLayout = useLibraryPreferences((state) => state.rememberLayout);
  const setRememberLibraryCategory = useLibraryPreferences((state) => state.setRememberCategory);
  const setRememberLibraryLayout = useLibraryPreferences((state) => state.setRememberLayout);
  const showLikedCollection = useOfflineLibraryStore((state) => state.showLikedCollection);
  const showCachedCollection = useOfflineLibraryStore((state) => state.showCachedCollection);
  const showLocalCollection = useOfflineLibraryStore((state) => state.showLocalCollection);
  const setShowLikedCollection = useOfflineLibraryStore((state) => state.setShowLikedCollection);
  const setShowCachedCollection = useOfflineLibraryStore((state) => state.setShowCachedCollection);
  const setShowLocalCollection = useOfflineLibraryStore((state) => state.setShowLocalCollection);

  useEffect(() => {
    setMounted(true);
  }, []);

  const chooseThemePreset = (value: string) => {
    const preset = value === "liquid-glass" && !glassAvailable ? "dark" : value as ThemePreset;
    if (preset !== "custom") setColorPickerOpen(false);
    chooseTheme(preset);
  };

  return (
    <>
    <SettingSection>
      <SettingRow
        title={t("settings.language.label")}
        className="lane-language-setting"
        description={t("settings.language.description")}
        titleKey="settings.language.label"
        descKey="settings.language.description"
        searchQuery={searchQuery}
        control={
          mounted ? (
            <Select
              options={LOCALE_OPTIONS}
              value={locale}
              onChange={setLocale}
              align="bottom-right"
              className="min-w-[130px]"
              aria-label={t("settings.language.label")}
            />
          ) : (
            <span />
          )
        }
      />

      <SettingRow
        title={t("settings.theme.title")}
        className="lane-theme-setting"
        description={t("settings.theme.description")}
        titleKey="settings.theme.title"
        descKey="settings.theme.description"
        searchQuery={searchQuery}
        control={mounted ? (
          <Select
            options={[
              { value: "custom", label: t("settings.theme.custom"), icon: presetIcon("custom", customColor) },
              { value: "system", label: t("settings.theme.system"), icon: presetIcon("system") },
              { value: "light", label: t("settings.theme.light"), icon: presetIcon("light") },
              { value: "dark", label: t("settings.theme.dark"), icon: presetIcon("dark") },
              ...(glassAvailable ? [{ value: "liquid-glass", label: "Liquid Glass", icon: presetIcon("liquid-glass") }] : []),
              { value: "amoled", label: t("settings.theme.amoled"), icon: presetIcon("amoled") },
              { value: "violet", label: t("settings.theme.violet"), icon: presetIcon("violet") },
              { value: "ocean", label: t("settings.theme.ocean"), icon: presetIcon("ocean") },
              { value: "ruby", label: t("settings.theme.ruby"), icon: presetIcon("ruby") },
              { value: "amber", label: t("settings.theme.amber"), icon: presetIcon("amber") },
              { value: "coffee", label: t("settings.theme.coffee"), icon: presetIcon("coffee") },
              { value: "spotify", label: t("settings.theme.spotify"), icon: presetIcon("spotify") },
            ]}
            value={themePreset}
            onChange={chooseThemePreset}
            align="bottom-right"
            className="min-w-[130px]"
            aria-label={t("settings.theme.title")}
          />
        ) : <span />}
      />

      {mounted && themePreset === "custom" && (
        <SettingRow
          title={t("settings.theme.custom_color")}
          description={t("settings.theme.custom_color_description")}
          titleKey="settings.theme.custom_color"
          descKey="settings.theme.custom_color_description"
          searchQuery={searchQuery}
          control={
            <button
              type="button"
              onClick={() => setColorPickerOpen(true)}
              aria-haspopup="dialog"
              aria-label={t("settings.theme.custom_color")}
              className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-[10px] border border-border-secondary bg-bg-primary px-3 text-text-secondary hover:bg-bg-elevated focus-visible:ring-2 focus-visible:ring-accent-primary"
            >
              <span aria-hidden="true" className="size-5 rounded-md border border-border-tertiary bg-accent-primary" />
              <span className="font-mono text-[12px]">{customColor.toUpperCase()}</span>
            </button>
          }
        />
      )}
    </SettingSection>
    {colorPickerOpen && themePreset === "custom" && (
      <ThemeColorPicker
        color={customColor}
        onClose={() => setColorPickerOpen(false)}
        onSave={(color) => { chooseCustomColor(color); setColorPickerOpen(false); }}
      />
    )}

    <SettingSection label={t("settings.storage.library_display_title")}>
      <SettingRow title={t("library.liked_songs")} titleKey="library.liked_songs" searchQuery={searchQuery}
        control={<ToggleSwitch checked={showLikedCollection} onChange={setShowLikedCollection} ariaLabel={t("library.liked_songs")} />} />
      <SettingRow title={t("library.cached_songs")} titleKey="library.cached_songs" searchQuery={searchQuery}
        control={<ToggleSwitch checked={showCachedCollection} onChange={setShowCachedCollection} ariaLabel={t("library.cached_songs")} />} />
      <SettingRow title={t("library.on_device")} titleKey="library.on_device" searchQuery={searchQuery}
        control={<ToggleSwitch checked={showLocalCollection} onChange={setShowLocalCollection} ariaLabel={t("library.on_device")} />} />
      <SettingRow
        title={t("settings.storage.remember_library_view")}
        titleKey="settings.storage.remember_library_view"
        descKey="settings.storage.remember_library_view_desc"
        searchQuery={searchQuery}
        description={t("settings.storage.remember_library_view_desc")}
        control={<ToggleSwitch checked={rememberLibraryCategory} onChange={setRememberLibraryCategory} ariaLabel={t("settings.storage.remember_library_view")} />}
      />
      <SettingRow
        title={t("settings.storage.remember_library_layout")}
        titleKey="settings.storage.remember_library_layout"
        descKey="settings.storage.remember_library_layout_desc"
        searchQuery={searchQuery}
        description={t("settings.storage.remember_library_layout_desc")}
        control={<ToggleSwitch checked={rememberLibraryLayout} onChange={setRememberLibraryLayout} ariaLabel={t("settings.storage.remember_library_layout")} />}
      />
    </SettingSection>
    </>
  );
}
