import { isNativeApp } from "@/shared/platform/native";
import { useState, useEffect } from "react";
import { useTranslation } from "@/languages";
import { usePlayerStore } from "@/features/player";
import { ToggleSwitch } from "@/shared/ui";
import { SettingRow, SettingSection, SegmentedControl } from "../controls";
import Button from "@/shared/ui/Button";
import { batteryOptimizationStatus, requestBatteryExemption } from "@/shared/platform/keepAwake";

/**
 * Android: battery optimization freezes Lane in the background on many phones
 * (playback stops between tracks, imports stall). Shows whether Lane is
 * exempt and asks the system to exempt it.
 */
function BackgroundWorkRow({ searchQuery }: { searchQuery?: string }) {
  const { t } = useTranslation();
  const tr = (key: string, fallback: string) => {
    const v = t(key);
    return v && v !== key ? v : fallback;
  };
  const [status, setStatus] = useState<{ supported: boolean; ignoring: boolean } | null>(null);

  useEffect(() => {
    const check = () => void batteryOptimizationStatus().then(setStatus);
    check();
    // the system prompt returns to the app: read the answer
    document.addEventListener("visibilitychange", check);
    return () => document.removeEventListener("visibilitychange", check);
  }, []);

  if (!status?.supported) return null;
  return (
    <SettingRow
      title={tr("settings.background.title", "Background work")}
      description={
        status.ignoring
          ? tr("settings.background.ok", "Lane runs without battery restrictions: music and imports keep going in the background.")
          : tr("settings.background.restricted", "The system may put Lane to sleep in the background: music stops between tracks and imports stall. Allow unrestricted background work.")
      }
      titleKey="settings.background.title"
      descKey="settings.background.restricted"
      searchQuery={searchQuery}
      control={
        status.ignoring ? (
          <span className="text-[13px] text-text-secondary">✓</span>
        ) : (
          <Button onClick={() => void requestBatteryExemption().then(() => batteryOptimizationStatus().then(setStatus))}>
            {tr("settings.background.allow", "Allow")}
          </Button>
        )
      }
    />
  );
}

export function PlaybackTab({ searchQuery }: { searchQuery?: string }) {
  const { t } = useTranslation();
  const [mounted, setMounted] = useState(false);
  const autoplaySimilar = usePlayerStore((state) => state.autoplaySimilar);
  const setAutoplaySimilar = usePlayerStore(
    (state) => state.setAutoplaySimilar,
  );
  const trackDoubleClickBehavior = usePlayerStore(
    (state) => state.trackDoubleClickBehavior,
  );
  const setTrackDoubleClickBehavior = usePlayerStore(
    (state) => state.setTrackDoubleClickBehavior,
  );
  const defaultPlaybackContext = usePlayerStore(
    (state) => state.defaultPlaybackContext,
  );
  const setDefaultPlaybackContext = usePlayerStore(
    (state) => state.setDefaultPlaybackContext,
  );
  const pauseOnDeviceChange = usePlayerStore(
    (state) => state.pauseOnDeviceChange,
  );
  const setPauseOnDeviceChange = usePlayerStore(
    (state) => state.setPauseOnDeviceChange,
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <SettingSection>

      <SettingRow
        title={t("settings.autoplay_similar.title")}
        description={t("settings.autoplay_similar.description")}
        titleKey="settings.autoplay_similar.title"
        descKey="settings.autoplay_similar.description"
        searchQuery={searchQuery}
        control={
          <ToggleSwitch
            checked={autoplaySimilar}
            onChange={setAutoplaySimilar}
          />
        }
      />

      <SettingRow
        title={t("settings.track_double_click.title")}
        description={t("settings.track_double_click.description")}
        titleKey="settings.track_double_click.title"
        descKey="settings.track_double_click.description"
        searchQuery={searchQuery}
        control={
          mounted ? (
            <SegmentedControl
              ariaLabel={t("settings.track_double_click.title")}
              value={trackDoubleClickBehavior}
              onChange={setTrackDoubleClickBehavior}
              options={[
                {
                  value: "play",
                  label: t("settings.track_double_click.play"),
                },
                {
                  value: "queue",
                  label: t("settings.track_double_click.queue"),
                },
              ]}
            />
          ) : (
            <span />
          )
        }
      />

      <SettingRow
        title={t("settings.default_playback_context.title")}
        description={t("settings.default_playback_context.description")}
        titleKey="settings.default_playback_context.title"
        descKey="settings.default_playback_context.description"
        searchQuery={searchQuery}
        control={
          mounted ? (
            <SegmentedControl
              ariaLabel={t("settings.default_playback_context.title")}
              value={defaultPlaybackContext}
              onChange={setDefaultPlaybackContext}
              options={[
                {
                  value: "resume",
                  label: t("settings.default_playback_context.resume"),
                },
                {
                  value: "empty",
                  label: t("settings.default_playback_context.empty"),
                },
              ]}
            />
          ) : (
            <span />
          )
        }
      />

      {!isNativeApp() && <SettingRow
        title={t("settings.audio.pause_on_device_change.title")}
        description={t("settings.audio.pause_on_device_change.description")}
        titleKey="settings.audio.pause_on_device_change.title"
        descKey="settings.audio.pause_on_device_change.description"
        searchQuery={searchQuery}
        control={
          <ToggleSwitch
            checked={pauseOnDeviceChange}
            onChange={setPauseOnDeviceChange}
          />
        }
      />}

      {isNativeApp() && <BackgroundWorkRow searchQuery={searchQuery} />}
    </SettingSection>
  );
}
