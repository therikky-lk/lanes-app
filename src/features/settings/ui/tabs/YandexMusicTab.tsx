import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { create } from "zustand";
import { useTranslation } from "@/languages";
import { useModalStore } from "@/features/library/store/modalStore";
import {
  importYandexMusic, YandexImportError, type YandexImportProgress, type YandexImportResult,
} from "@/features/library/services/import/sources/yandexMusic/yandexMusicImport";
import { YandexSourceError } from "@/features/library/services/import/sources/yandexMusic/yandexMusicSource";
import { signInToYandexMusic } from "@/features/library/services/import/sources/yandexMusic/yandexMusicAccount";
import { getAuthSession } from "@/shared/api";
import { isRateLimit } from "@/shared/media/matching";
import { isBrowserRuntime } from "@/shared/platform/browser";
import Button from "@/shared/ui/Button";
import { ToggleSwitch, useToast } from "@/shared/ui";
import { SettingRow, SettingSection } from "../controls";

const useImportStatus = create<{ progress: YandexImportProgress | { phase: "signing_in" } | null }>(() => ({ progress: null }));

export function YandexMusicTab() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const progress = useImportStatus((state) => state.progress);
  const [alsoLike, setAlsoLike] = useState(false);
  const [result, setResult] = useState<YandexImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const playlistId = result?.playlistId;

  if (isBrowserRuntime()) return <p className="text-[14px] text-text-secondary">{t("settings.yandex_music.native_only")}</p>;

  const startImport = async () => {
    if (useImportStatus.getState().progress) return;
    setResult(null);
    setError(null);
    useImportStatus.setState({ progress: { phase: "signing_in" } });
    try {
      const owner = getAuthSession();
      if (!owner?.user?.id) throw new YandexImportError("lane_sign_in");
      const login = await signInToYandexMusic();
      if (login.status === "cancelled") return;
      if (login.status !== "success") {
        setError(t("settings.yandex_music.error_sign_in"));
        return;
      }
      const current = getAuthSession();
      if (current?.user?.id !== owner.user.id || current.authBackend !== owner.authBackend) {
        throw new YandexImportError("account_changed");
      }
      const imported = await importYandexMusic(login.token, t("settings.yandex_music.playlist_title"), alsoLike, (progress) => {
        useImportStatus.setState({ progress });
      });
      setResult(imported);
      toast(imported.playlistId
        ? t("settings.yandex_music.complete", { added: imported.added, skipped: imported.skipped })
        : t("settings.yandex_music.empty"), imported.playlistId ? "checkmark" : "info");
      if (imported.likesUnavailable || imported.likes?.failed) toast(t("settings.yandex_music.likes_failed"), "error");
    } catch (failure) {
      let message = t("settings.yandex_music.error_import");
      if (isRateLimit(failure) || (failure instanceof YandexSourceError && failure.code === "rate_limited")) {
        message = t("settings.yandex_music.error_rate");
      } else if (failure instanceof YandexSourceError) {
        message = failure.code === "source_unavailable"
          ? t("settings.yandex_music.error_source")
          : t("settings.yandex_music.error_access");
      } else if (failure instanceof YandexImportError && (failure.code === "lane_sign_in" || failure.code === "account_changed")) {
        message = t("settings.yandex_music.error_lane_account");
      }
      setError(message);
      toast(message, "error");
    } finally {
      useImportStatus.setState({ progress: null });
    }
  };

  const progressText = progress?.phase === "signing_in"
    ? t("settings.yandex_music.progress_sign_in")
    : progress?.phase === "matching"
    ? t("settings.yandex_music.progress_matching", { done: progress.done, total: progress.total })
    : progress?.phase === "saving"
      ? t("settings.yandex_music.progress_saving")
      : t("settings.yandex_music.progress_loading");

  return (
    <div className="flex max-w-[560px] flex-col gap-4">
      <p className="m-0 text-[13px] text-text-secondary">{t("settings.yandex_music.sign_in_help")}</p>
      <SettingSection>
        <SettingRow
          title={t("settings.yandex_music.also_like")}
          description={t("settings.yandex_music.also_like_description")}
          control={<ToggleSwitch checked={alsoLike} onChange={setAlsoLike} disabled={Boolean(progress)} ariaLabel={t("settings.yandex_music.also_like")} />}
        />
      </SettingSection>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" disabled={Boolean(progress)} onClick={() => void startImport()}>
          {t("settings.yandex_music.import")}
        </Button>
        {playlistId && (
          <Button type="button" variant="secondary" onClick={() => {
            useModalStore.getState().closeSettings();
            navigate(`/library/playlist?id=${encodeURIComponent(playlistId)}`);
          }}>
            {t("settings.yandex_music.open_playlist")}
          </Button>
        )}
      </div>
      {progress && (
        <div role="status" className="flex flex-col gap-2 text-[13px] text-text-secondary">
          <span>{progressText}</span>
          {progress.phase === "matching" && (
            <progress aria-label={t("settings.yandex_music.import")} className="w-full accent-current" max={progress.total} value={progress.done} />
          )}
        </div>
      )}
      {error && <p role="alert" className="m-0 text-[13px] text-red-500">{error}</p>}
      {result && (
        <div role="status" className="text-[13px] text-text-secondary">
          {result.playlistId ? t("settings.yandex_music.complete", { added: result.added, skipped: result.skipped }) : t("settings.yandex_music.empty")}
          {result.likes && <div>{t("settings.yandex_music.likes_complete", { added: result.likes.added, failed: result.likes.failed })}</div>}
          {result.likesUnavailable && <div>{t("settings.yandex_music.likes_failed")}</div>}
        </div>
      )}
    </div>
  );
}
