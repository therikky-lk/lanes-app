import { useRef, useState } from "react";
import { EyeCloseLine } from "@mingcute/react";
import { useTranslation } from "@/languages";
import { useModalStore } from "@/features/library/store/modalStore";
import { useImportStore } from "@/features/library/store/importStore";
import { useSpotifyPreferences } from "@/features/library/store/spotifyPreferences";
import { MAX_SPOTIFY_CSV_BYTES, parseSpotifyCsv } from "@/features/library/services/import/sources/spotify/spotifyCsv";
import { ToggleSwitch } from "@/shared/ui";
import Button from "@/shared/ui/Button";
import SpotifyIcon from "@/shared/ui/SpotifyIcon";
import { SettingRow, SettingSection } from "../controls";
import { ServiceAccountAvatar } from "../ServiceAccountAvatar";
import "./yandexMusicAccount.css";

export function SpotifyTab() {
  const { t } = useTranslation();
  const importing = useImportStore(state => state.isPolling);
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const [readingFile, setReadingFile] = useState(false);
  const { hideImportedPlaylists, setHideImportedPlaylists } = useSpotifyPreferences();

  async function importCsv(file: File) {
    if (importing || readingFile) return;
    setReadingFile(true);
    setError("");
    try {
      if (file.size > MAX_SPOTIFY_CSV_BYTES) throw new Error("CSV too large");
      const playlist = parseSpotifyCsv(await file.text(), file.name);
      if (useImportStore.getState().isPolling) return;
      await useImportStore.getState().startFileImport(playlist);
      useModalStore.getState().closeSettings();
    } catch {
      setError(t("common.failed_import_playlist"));
    } finally {
      setReadingFile(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="lane-setting-status lane-yandex-account rounded-[16px] bg-white/[0.09] p-[14px]">
        <div className="lane-yandex-account-layout">
          <div className="flex min-w-0 items-center gap-4">
            <ServiceAccountAvatar className="bg-white/[0.08] text-[#1ED760]"><SpotifyIcon size={28} /></ServiceAccountAvatar>
            <div className="min-w-0">
              <div className="text-[15px] font-semibold text-text-primary">Exportify CSV</div>
              <a href="https://exportify.app/" target="_blank" rel="noopener noreferrer" className="text-[13px] text-text-secondary underline">
                exportify.app ↗
              </a>
            </div>
          </div>
          <div className="lane-yandex-account-actions">
            <input ref={fileInput} hidden type="file" accept=".csv,text/csv" onChange={event => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (file) void importCsv(file);
            }} />
            <Button type="button" disabled={importing || readingFile} onClick={() => fileInput.current?.click()}>
              {t("common.import")} CSV
            </Button>
          </div>
        </div>
        {error && <p role="alert" className="m-0 mt-[14px] text-[13px] text-red-500">{error}</p>}
      </div>
      <SettingSection label={t("common.import")}>
        <SettingRow
          title={t("settings.spotify.hide_imported")}
          icon={<EyeCloseLine size={20} />}
          control={<ToggleSwitch checked={hideImportedPlaylists} onChange={setHideImportedPlaylists} ariaLabel={t("settings.spotify.hide_imported")} />}
        />
      </SettingSection>
    </div>
  );
}
