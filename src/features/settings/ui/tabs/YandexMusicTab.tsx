import { useEffect, useState } from "react";
import { EyeCloseLine, HeartLine } from "@mingcute/react";
import { useNavigate } from "react-router-dom";
import { create } from "zustand";
import { useTranslation } from "@/languages";
import { useYandexMusicPreferences } from "@/features/library/store/yandexMusicPreferences";
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
import YandexMusicIcon from "@/shared/ui/YandexMusicIcon";
import { ToggleSwitch, useToast } from "@/shared/ui";
import { SettingRow, SettingSection } from "../controls";

const useImportStatus = create<{
  progress: YandexImportProgress | null;
  controller: AbortController | null;
  cancelling: boolean;
  accountAction: "connecting" | "disconnecting" | null;
  connectedOwner: string | null;
}>(() => ({ progress: null, controller: null, cancelling: false, accountAction: null, connectedOwner: null }));

function setConnectedOwner(connectedOwner: string | null) {
  useImportStatus.setState({ connectedOwner });
}

function isBusy() {
  const { controller, accountAction } = useImportStatus.getState();
  return Boolean(controller || accountAction);
}

export function YandexMusicTab() {
  const { t, locale } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { progress, controller, cancelling, accountAction, connectedOwner } = useImportStatus();
  const busy = Boolean(controller || accountAction);
  const { alsoLike, setAlsoLike, hideImportedPlaylist, setHideImportedPlaylist } = useYandexMusicPreferences();
  const [result, setResult] = useState<YandexImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const owner = integrationOwner();
  const connected = owner !== null && connectedOwner === owner;
  const playlistId = result?.playlistId;

  useEffect(() => {
    if (!owner || busy || isBrowserRuntime()) return;
    let active = true;
    const refresh = () => {
      if (document.visibilityState === "hidden" || isBusy()) return;
      void readYandexConnection(owner).then(({ connected }) => {
        if (active && !isBusy()) setConnectedOwner(connected ? owner : null);
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
  }, [busy, owner]);

  if (isBrowserRuntime()) return <p className="text-[14px] text-text-secondary">{t("settings.yandex_music.native_only")}</p>;

  const connect = async () => {
    if (!owner || isBusy()) return;
    setError(null);
    useImportStatus.setState({ accountAction: "connecting" });
    try {
      const remote = await readIntegration("yandex", owner);
      if (!remote.session) {
        const login = await signInToYandexMusic();
        if (login.status === "cancelled") return;
        if (login.status !== "success") {
          setError(t("settings.yandex_music.error_sign_in"));
          return;
        }
        await writeIntegration("yandex", owner, { revision: remote.revision, session: { accessToken: login.token } });
      }
      setConnectedOwner(owner);
    } catch {
      setError(t("common.error_network"));
    } finally {
      useImportStatus.setState({ accountAction: null });
    }
  };

  const disconnect = async () => {
    if (!owner || isBusy()) return;
    setError(null);
    useImportStatus.setState({ accountAction: "disconnecting" });
    try {
      const { revision } = await readIntegration("yandex", owner);
      await writeIntegration("yandex", owner, { revision, session: null });
      setConnectedOwner(null);
      setResult(null);
    } catch {
      setError(t("common.error_network"));
    } finally {
      useImportStatus.setState({ accountAction: null });
    }
  };

  const startImport = async () => {
    if (!owner || !connected || isBusy()) return;
    const operation = new AbortController();
    const { signal } = operation;
    setResult(null);
    setError(null);
    useImportStatus.setState({ controller: operation, progress: { phase: "loading", done: 0, total: 0 } });
    let revision: number | undefined;
    try {
      const remote = await readIntegration("yandex", owner, 0, signal);
      signal.throwIfAborted();
      if (!remote.session) {
        setConnectedOwner(null);
        setError(t("settings.yandex_music.error_access"));
        return;
      }
      revision = remote.revision;
      const imported = await importYandexMusic(remote.session.accessToken, t("settings.yandex_music.playlist_title"), alsoLike, (progress) => {
        useImportStatus.setState({ progress });
      }, signal);
      setResult(imported);
      toast(imported.playlistId
        ? t("settings.yandex_music.complete", { added: imported.added, skipped: imported.skipped })
        : t("settings.yandex_music.empty"), imported.playlistId ? "checkmark" : "info");
      if (imported.likesUnavailable || imported.likes?.failed) toast(t("settings.yandex_music.likes_failed"), "error");
    } catch (failure) {
      if (signal.aborted) return;
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
      } else if (failure instanceof IntegrationSessionError) {
        message = t("common.error_network");
      }
      setError(message);
      toast(message, "error");
    } finally {
      useImportStatus.setState({ progress: null, controller: null, cancelling: false });
    }
  };

  const cancelImport = () => {
    const operation = useImportStatus.getState().controller;
    if (!operation || operation.signal.aborted) return;
    useImportStatus.setState({ cancelling: true });
    operation.abort();
  };

  const progressText = progress?.phase === "matching"
    ? t("settings.yandex_music.progress_matching", { done: progress.done, total: progress.total })
    : progress?.phase === "saving"
      ? t("settings.yandex_music.progress_saving")
      : t("settings.yandex_music.progress_loading");
  const matching = progress?.phase === "matching" ? progress : null;
  const completion = matching && matching.total > 0 ? Math.min(100, matching.done * 100 / matching.total) : 0;
  const percentage = new Intl.NumberFormat(locale, { style: "percent" }).format(Math.floor(completion) / 100);

  return (
    <div className="flex flex-col gap-[28px]">
      <div className="lane-setting-status rounded-[16px] bg-white/[0.09] px-[14px] py-[14px]">
        <div className="flex flex-wrap items-center gap-x-[16px] gap-y-[12px]">
          <div className="flex min-w-0 flex-[1_1_210px] items-center gap-[16px]">
            <div className="flex size-[64px] shrink-0 items-center justify-center rounded-[14px] bg-white dark:bg-[#171717]">
              <YandexMusicIcon size={28} />
            </div>
            <div className="min-w-0">
              <div className="text-[15px] font-[600] text-text-primary">{t("settings.yandex_music.title")}</div>
              <p role="status" className="m-0 mt-[3px] text-[13px] leading-snug text-text-secondary">
                {t(accountAction === "connecting" ? "settings.yandex_music.progress_sign_in" : connected ? "settings.youtube.signed_in" : "settings.youtube.signed_out_title")}
              </p>
            </div>
          </div>
          <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-2">
            {connected ? (
              <>
                <Button type="button" className="!h-[42px] !rounded-[12px] !px-[16px]" disabled={busy} onClick={() => void startImport()}>
                  {t("common.import")}
                </Button>
                {controller ? (
                  <Button type="button" className="!h-[42px] !rounded-[12px] !px-[16px]" variant="outline" disabled={cancelling} onClick={cancelImport}>
                    {t("common.cancel")}
                  </Button>
                ) : (
                  <Button type="button" className="!h-[42px] !rounded-[12px] !px-[16px]" variant="outline" disabled={busy} onClick={() => void disconnect()}>
                    {t("settings.youtube.sign_out")}
                  </Button>
                )}
              </>
            ) : (
              <Button type="button" className="!h-[42px] !rounded-[12px] !px-[16px]" disabled={!owner || busy} onClick={() => void connect()}>
                {t("settings.youtube.sign_in")}
              </Button>
            )}
          </div>
        </div>
        {progress && (
          <div role={matching ? undefined : "status"} className="mt-[14px] flex flex-col gap-2 text-[13px] text-text-secondary">
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 tabular-nums">{progressText}</span>
              {matching && <span aria-hidden="true" className="shrink-0 font-medium tabular-nums text-text-primary">{percentage}</span>}
            </div>
            {matching && (
              <div
                role="progressbar"
                aria-label={t("common.import")}
                aria-valuemin={0}
                aria-valuemax={matching.total}
                aria-valuenow={matching.done}
                aria-valuetext={progressText}
                className="h-[6px] overflow-hidden rounded-full bg-border-alpha-14"
              >
                <div
                  className="h-full rounded-full bg-text-primary transition-[width] duration-300 ease-out motion-reduce:transition-none"
                  style={{ width: `${completion}%` }}
                />
              </div>
            )}
          </div>
        )}
        {error && <p role="alert" className="m-0 mt-[14px] text-[13px] text-red-500">{error}</p>}
        {result && (
          <div className="mt-[14px] flex flex-wrap items-center justify-between gap-2">
            <div role="status" className="min-w-0 text-[13px] text-text-secondary">
              {playlistId ? t("settings.yandex_music.complete", { added: result.added, skipped: result.skipped }) : t("settings.yandex_music.empty")}
              {result.likes && <div>{t("settings.yandex_music.likes_complete", { added: result.likes.added, failed: result.likes.failed })}</div>}
              {result.likesUnavailable && <div>{t("settings.yandex_music.likes_failed")}</div>}
            </div>
            {playlistId && (
              <Button type="button" variant="outline" size="sm" onClick={() => {
                useModalStore.getState().closeSettings();
                navigate(`/library/playlist?id=${encodeURIComponent(playlistId)}`);
              }}>
                {t("settings.yandex_music.open_playlist")}
              </Button>
            )}
          </div>
        )}
      </div>
      <SettingSection label={t("common.import")}>
        <SettingRow
          title={t("settings.yandex_music.also_like")}
          description={t("settings.yandex_music.also_like_description")}
          icon={<HeartLine size={20} />}
          control={<ToggleSwitch checked={alsoLike} onChange={setAlsoLike} disabled={busy} ariaLabel={t("settings.yandex_music.also_like")} />}
        />
        <SettingRow
          title={t("settings.yandex_music.hide_imported_playlist")}
          icon={<EyeCloseLine size={20} />}
          control={<ToggleSwitch checked={hideImportedPlaylist} onChange={setHideImportedPlaylist} ariaLabel={t("settings.yandex_music.hide_imported_playlist")} />}
        />
      </SettingSection>
    </div>
  );
}
