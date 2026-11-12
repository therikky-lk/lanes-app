import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { create } from "zustand";
import { useTranslation } from "@/languages";
import { useModalStore } from "@/features/library/store/modalStore";
import {
  importYandexMusic, YandexImportError, type YandexImportProgress, type YandexImportResult,
} from "@/features/library/services/import/sources/yandexMusic/yandexMusicImport";
import { YandexSourceError } from "@/features/library/services/import/sources/yandexMusic/yandexMusicSource";
import { signInToYandexMusic } from "@/features/library/services/import/sources/yandexMusic/yandexMusicAccount";
import { IntegrationSessionError, integrationOwner, readIntegration, readYandexConnection, writeIntegration } from "@/shared/api/integrationSessions";
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
  const [connectedOwner, setConnectedOwner] = useState<string | null>(null);
  const owner = integrationOwner();
  const connected = owner !== null && connectedOwner === owner;
  const playlistId = result?.playlistId;

  useEffect(() => {
    if (!owner || isBrowserRuntime()) return;
    let active = true;
    const refresh = () => {
      if (document.visibilityState === "hidden" || useImportStatus.getState().progress) return;
      void readYandexConnection(owner).then(({ connected }) => {
        if (active && !useImportStatus.getState().progress) setConnectedOwner(connected ? owner : null);
      }).catch(() => undefined);
    };
    refresh();
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [owner]);

  if (isBrowserRuntime()) return <p className="text-[14px] text-text-secondary">{t("settings.yandex_music.native_only")}</p>;

  const disconnect = async () => {
    if (!owner || useImportStatus.getState().progress) return;
    useImportStatus.setState({ progress: { phase: "saving", done: 0, total: 0 } });
    setError(null);
    try {
      const { revision } = await readIntegration("yandex", owner);
      await writeIntegration("yandex", owner, { revision, session: null });
      setConnectedOwner(null);
      setResult(null);
    } catch {
      setError(t("common.error_network"));
    } finally {
      useImportStatus.setState({ progress: null });
    }
  };

  const startImport = async () => {
    if (useImportStatus.getState().progress) return;
    setResult(null);
    setError(null);
    useImportStatus.setState({ progress: { phase: "loading", done: 0, total: 0 } });
    let revision: number | undefined;
    try {
      if (!owner) throw new YandexImportError("lane_sign_in");
      const remote = await readIntegration("yandex", owner).catch((failure) => {
        if (failure instanceof IntegrationSessionError && failure.status === 404) return null;
        throw failure;
      });
      revision = remote?.revision;
      let token = remote?.session?.accessToken;
      let shared = Boolean(token);
      if (!token) {
        setConnectedOwner(null);
        useImportStatus.setState({ progress: { phase: "signing_in" } });
        const login = await signInToYandexMusic();
        if (login.status === "cancelled") return;
        if (login.status !== "success") {
          setError(t("settings.yandex_music.error_sign_in"));
          return;
        }
        token = login.token;
        if (revision !== undefined) {
          const saved = await writeIntegration("yandex", owner, { revision, session: { accessToken: token } }).catch((failure) => {
            if (failure instanceof IntegrationSessionError && failure.status === 503) return null;
            throw failure;
          });
          revision = saved?.revision;
          shared = Boolean(saved);
        }
        if (!shared) toast(t("common.error_network"), "info");
      }
      if (integrationOwner() !== owner) throw new YandexImportError("account_changed");
      setConnectedOwner(shared ? owner : null);
      const imported = await importYandexMusic(token, t("settings.yandex_music.playlist_title"), alsoLike, (progress) => {
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
        if (failure.code === "access_denied" && owner && revision !== undefined) {
          await writeIntegration("yandex", owner, { revision, session: null })
            .then(() => setConnectedOwner(null))
            .catch(() => undefined);
        }
        message = failure.code === "source_unavailable"
          ? t("settings.yandex_music.error_source")
          : t("settings.yandex_music.error_access");
      } else if (failure instanceof YandexImportError && (failure.code === "lane_sign_in" || failure.code === "account_changed")) {
        message = t("settings.yandex_music.error_lane_account");
      } else if (failure instanceof IntegrationSessionError || useImportStatus.getState().progress?.phase === "signing_in") {
        message = t("common.error_network");
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
      <p className="m-0 text-[13px] text-text-secondary">{t(connected ? "settings.youtube.signed_in" : "settings.yandex_music.sign_in_help")}</p>
      <SettingSection>
        <SettingRow
          title={t("settings.yandex_music.also_like")}
          description={t("settings.yandex_music.also_like_description")}
          control={<ToggleSwitch checked={alsoLike} onChange={setAlsoLike} disabled={Boolean(progress)} ariaLabel={t("settings.yandex_music.also_like")} />}
        />
      </SettingSection>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" disabled={Boolean(progress)} onClick={() => void startImport()}>
          {t(connected ? "common.import" : "settings.yandex_music.import")}
        </Button>
        {connected && (
          <Button type="button" variant="outline" disabled={Boolean(progress)} onClick={() => void disconnect()}>
            {t("settings.youtube.sign_out")}
          </Button>
        )}
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
