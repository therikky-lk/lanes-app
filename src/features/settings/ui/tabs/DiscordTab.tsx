import { useState, useEffect } from "react";
import { useTranslation } from "@/languages";
import {
  useDiscordSettingsStore,
  type DiscordStatusDisplayType,
} from "@/features/discord";
import { ToggleSwitch, Select } from "@/shared/ui";
import { SettingRow, SettingSection } from "../controls";

export function DiscordTab({ searchQuery }: { searchQuery?: string }) {
  const { t } = useTranslation();
  const [mounted, setMounted] = useState(false);
  const [discordStatus, setDiscordStatus] = useState<{
    connected: boolean;
    username?: string;
    avatarUrl?: string;
    error?: string;
  }>({ connected: false });

  const enabled = useDiscordSettingsStore((s) => s.enabled);
  const setEnabled = useDiscordSettingsStore((s) => s.setEnabled);

  const statusDisplayType = useDiscordSettingsStore((s) => s.statusDisplayType);
  const setStatusDisplayType = useDiscordSettingsStore((s) => s.setStatusDisplayType);

  const showTime = useDiscordSettingsStore((s) => s.showTime);
  const setShowTime = useDiscordSettingsStore((s) => s.setShowTime);

  const showArtwork = useDiscordSettingsStore((s) => s.showArtwork);
  const setShowArtwork = useDiscordSettingsStore((s) => s.setShowArtwork);

  const showArtistSmallImage = useDiscordSettingsStore((s) => s.showArtistSmallImage);
  const setShowArtistSmallImage = useDiscordSettingsStore((s) => s.setShowArtistSmallImage);

  const showPaused = useDiscordSettingsStore((s) => s.showPaused);
  const setShowPaused = useDiscordSettingsStore((s) => s.setShowPaused);

  const showButton = useDiscordSettingsStore((s) => s.showButton);
  const setShowButton = useDiscordSettingsStore((s) => s.setShowButton);

  const showDownloadButton = useDiscordSettingsStore((s) => s.showDownloadButton);
  const setShowDownloadButton = useDiscordSettingsStore((s) => s.setShowDownloadButton);

  useEffect(() => {
    setMounted(true);

    const checkStatus = () => {
      if (window.linerElectron?.getDiscordStatus) {
        window.linerElectron.getDiscordStatus().then((status) => {
          if (status) setDiscordStatus(status);
        });
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 4000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col gap-[18px]">
      {/* Discord Connection Status */}
      <div className="lane-setting-status flex items-center gap-[16px] rounded-[16px] bg-white/[0.09] px-[14px] py-[14px]">
        {discordStatus.avatarUrl ? (
          <img
            src={discordStatus.avatarUrl}
            alt=""
            className="h-[64px] w-[64px] shrink-0 rounded-[14px] object-cover"
          />
        ) : (
          <div className="flex h-[64px] w-[64px] shrink-0 items-center justify-center rounded-[14px] bg-white/[0.08] text-text-secondary">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[30px] w-[30px] fill-current">
              <path d="M19.7 5.4a18 18 0 0 0-4.4-1.4l-.6 1.2a16 16 0 0 0-5.4 0l-.6-1.2a18 18 0 0 0-4.4 1.4C1.5 9.5.7 13.5 1.1 17.4a18 18 0 0 0 5.4 2.7l1.2-2a11 11 0 0 1-1.9-.9l.5-.4a12 12 0 0 0 11.4 0l.5.4a11 11 0 0 1-1.9.9l1.2 2a18 18 0 0 0 5.4-2.7c.5-4.5-.8-8.5-3.2-12Zm-11 9.1c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Zm6.6 0c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Z" />
            </svg>
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-[600] text-text-primary">
            {discordStatus.connected
              ? discordStatus.username || "Discord"
              : t("settings.discord.status.disconnected") || "Discord not connected"}
          </div>
          <div className="mt-[3px] truncate text-[13px] text-text-secondary" title={discordStatus.error}>
            {enabled
              ? discordStatus.connected
                ? t("settings.discord.status.ready") || "Ready"
                : t("settings.discord.status.waiting") || "Waiting for Discord"
              : t("settings.discord.status.disabled") || "Disabled"}
          </div>
        </div>
      </div>

      {/* Main enable switch */}
      <SettingSection>
        <SettingRow
          title={t("settings.discord.enable.title") || "Discord Rich Presence"}
          titleKey="settings.discord.enable.title"
          searchQuery={searchQuery}
          control={
            <ToggleSwitch
              checked={enabled}
              onChange={setEnabled}
            />
          }
        />
      </SettingSection>

      {/* Display Options */}
      <SettingSection label={t("settings.discord.section_display") || "Display Options"}>
        {/* Status Line Format */}
        <SettingRow
          title={t("settings.discord.status_display.title") || "Status Format"}
          description={
            t("settings.discord.status_display.description") ||
            "Choose what appears in Discord's 'Listening to...' status header."
          }
          titleKey="settings.discord.status_display.title"
          descKey="settings.discord.status_display.description"
          searchQuery={searchQuery}
          control={
            mounted ? (
              <Select<DiscordStatusDisplayType>
                aria-label={t("settings.discord.status_display.title") || "Status Format"}
                className="w-[210px]"
                value={statusDisplayType}
                onChange={setStatusDisplayType}
                disabled={!enabled}
                options={[
                  {
                    value: "app",
                    label: t("settings.discord.status_display.app") || "Lane (Default)",
                  },
                  {
                    value: "artist",
                    label: t("settings.discord.status_display.artist") || "Artist",
                  },
                  {
                    value: "title",
                    label: t("settings.discord.status_display.song") || "Song Title",
                  },
                  {
                    value: "artist_title",
                    label: t("settings.discord.status_display.artist_song") || "Artist - Song",
                  },
                  {
                    value: "title_artist",
                    label: t("settings.discord.status_display.song_artist") || "Song - Artist",
                  },
                ]}
              />
            ) : (
              <span />
            )
          }
        />

        {/* Timeline progress bar */}
        <SettingRow
          title={t("settings.discord.show_timeline.title") || "Playback Timeline"}
          description={
            t("settings.discord.show_timeline.description") ||
            "Display interactive progress bar with elapsed and remaining track time."
          }
          titleKey="settings.discord.show_timeline.title"
          descKey="settings.discord.show_timeline.description"
          searchQuery={searchQuery}
          control={
            <ToggleSwitch
              checked={showTime}
              onChange={setShowTime}
              disabled={!enabled}
            />
          }
        />

        {/* Track artwork */}
        <SettingRow
          title={t("settings.discord.show_artwork.title") || "Track Artwork"}
          description={
            t("settings.discord.show_artwork.description") ||
            "Show track or album cover in the Discord activity card."
          }
          titleKey="settings.discord.show_artwork.title"
          descKey="settings.discord.show_artwork.description"
          searchQuery={searchQuery}
          control={
            <ToggleSwitch
              checked={showArtwork}
              onChange={setShowArtwork}
              disabled={!enabled}
            />
          }
        />

        {/* Artist small image */}
        <SettingRow
          title={t("settings.discord.show_artist_image.title") || "Artist Photo Badge"}
          description={
            t("settings.discord.show_artist_image.description") ||
            "Display the artist photo in a small circular badge on the bottom corner."
          }
          titleKey="settings.discord.show_artist_image.title"
          descKey="settings.discord.show_artist_image.description"
          searchQuery={searchQuery}
          control={
            <ToggleSwitch
              checked={showArtistSmallImage}
              onChange={setShowArtistSmallImage}
              disabled={!enabled}
            />
          }
        />

        {/* Show when paused */}
        <SettingRow
          title={t("settings.discord.show_paused.title") || "Show when Paused"}
          description={
            t("settings.discord.show_paused.description") ||
            "Keep status visible on Discord with a paused indicator when music is paused."
          }
          titleKey="settings.discord.show_paused.title"
          descKey="settings.discord.show_paused.description"
          searchQuery={searchQuery}
          control={
            <ToggleSwitch
              checked={showPaused}
              onChange={setShowPaused}
              disabled={!enabled}
            />
          }
        />
      </SettingSection>

      {/* Profile Buttons */}
      <SettingSection label={t("settings.discord.section_buttons") || "Profile Buttons"}>
        {/* Listen on Lane button */}
        <SettingRow
          title={t("settings.discord.show_button.title") || "'Listen on Lane' Button"}
          description={
            t("settings.discord.show_button.description") ||
            "Add an interactive button linking to the song on Lane."
          }
          titleKey="settings.discord.show_button.title"
          descKey="settings.discord.show_button.description"
          searchQuery={searchQuery}
          control={
            <ToggleSwitch
              checked={showButton}
              onChange={setShowButton}
              disabled={!enabled}
            />
          }
        />

        {/* Download Lane button */}
        <SettingRow
          title={t("settings.discord.show_download_button.title") || "'Download Lane' Button"}
          description={
            t("settings.discord.show_download_button.description") ||
            "Add a button inviting people to the Lane Discord server."
          }
          titleKey="settings.discord.show_download_button.title"
          descKey="settings.discord.show_download_button.description"
          searchQuery={searchQuery}
          control={
            <ToggleSwitch
              checked={showDownloadButton}
              onChange={setShowDownloadButton}
              disabled={!enabled}
            />
          }
        />
      </SettingSection>
    </div>
  );
}
