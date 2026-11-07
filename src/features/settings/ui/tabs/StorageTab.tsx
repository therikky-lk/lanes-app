import { AnimatePresence, motion } from "framer-motion";
import lottie from "lottie-web";
import cleanDuck from "@/assets/animations/clean_duck.json";
import { StorageAction } from "./StorageAction";
import { useModalStore } from "@/features/library/store/modalStore";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { FolderOpenLine, HeartFill, MusicLine } from "@mingcute/react";
import { ToggleSwitch, useToast } from "@/shared/ui";
import { useTranslation } from "@/languages";
import { useOfflineLibraryStore } from "@/features/library/offline/offlineLibraryStore";
import { useLocalTracks } from "@/features/local/hooks/useLocalTracks";
import { useNavigate } from "react-router-dom";
import { SettingRow, SettingSection } from "../controls";
import {
  getCachedStorageAnalytics, refreshStorageAnalytics, setStorageTabOpen,
  clearStorageCategories, openCacheFolder, formatStorageBytes,
  getAudioCacheLimitBytes, setAudioCacheLimitBytes, type StorageAnalytics,
} from "@/shared/utils/cacheManager";

function CleaningDuck() {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!container.current) return;
    const animation = lottie.loadAnimation({ container: container.current, renderer: "svg", loop: true, autoplay: true, animationData: cleanDuck });
    return () => animation.destroy();
  }, []);
  return <div ref={container} className="h-[140px] w-[140px]" aria-hidden />;
}

const GB = 1024 ** 3;
function LimitPills({ value, options, onChange, label, disabled }: {
  value: number; options: number[]; onChange: (bytes: number) => void; label: string; disabled?: boolean;
}) {
  const { t } = useTranslation();
  const selectedId = useId();
  // Keep older, custom cache limits visible after upgrading.
  const values = options.includes(value / GB) ? options : [value / GB, ...options];
  return <div role="group" aria-label={label} className="lane-storage-limit-pills flex flex-nowrap gap-1 overflow-x-auto [scrollbar-width:none]">
    {values.map(size => <button key={size} type="button" disabled={disabled} aria-pressed={value === size * GB}
      onClick={() => onChange(size * GB)}
      className={`relative isolate h-[26px] shrink-0 overflow-hidden whitespace-nowrap rounded-[9px] border-0 px-[9px] text-[11px] font-medium transition-colors duration-200 disabled:opacity-50 ${value === size * GB ? "bg-transparent text-bg-primary" : "bg-black/[0.06] dark:bg-white/[0.07] text-text-secondary hover:bg-black/10 dark:hover:bg-white/10"}`}>
      {value === size * GB && <motion.span layoutId={selectedId} className="absolute inset-0 -z-10 rounded-[9px] bg-text-primary" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
      {size === 0 ? t("settings.storage.no_limit") : `${Number(size.toFixed(2))} GB`}
    </button>)}
  </div>;
}

export function StorageTab({ searchQuery }: { searchQuery?: string }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const offline = useOfflineLibraryStore();
  const { records: local } = useLocalTracks();
  const [analytics, setAnalytics] = useState<StorageAnalytics | null>(() => getCachedStorageAnalytics());
  const [cacheLimit, setCacheLimit] = useState(getAudioCacheLimitBytes);
  const [busy, setBusy] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [freedBytes, setFreedBytes] = useState<number | null>(null);
  const refresh = useCallback(async () => { setAnalytics(await refreshStorageAnalytics(true)); }, []);
  useEffect(() => {
    setStorageTabOpen(true);
    let active = true;
    const update = () => { void refreshStorageAnalytics().then(data => { if (active) setAnalytics(data); }).catch(() => {
      if (active) toast(t("settings.cache.local_cache.error"), "error");
    }); };
    update();
    window.addEventListener("lane:storage-changed", update);
    const timer = setInterval(update, 10_000);
    return () => { active = false; setStorageTabOpen(false); clearInterval(timer); window.removeEventListener("lane:storage-changed", update); };
  }, [t, toast]);

  const downloadedBytes = offline.downloads.reduce((sum, entry) => sum + entry.byteSize, 0);
  const localBytes = local.reduce((sum, entry) => sum + entry.size, 0);
  const musicBytes = downloadedBytes + localBytes;
  const cacheCategories = analytics?.categories.filter(category => category.id !== "liked" && category.id !== "local") ?? [];
  const cacheBytes = cacheCategories.reduce((sum, entry) => sum + entry.bytes, 0);
  const total = musicBytes + cacheBytes;
  const average = offline.downloads.length ? Math.max(2 * 1024 ** 2, downloadedBytes / offline.downloads.length) : 4 * 1024 ** 2;
  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    try { await work(); await offline.refresh(); await refresh(); }
    catch { toast(t("settings.cache.local_cache.error"), "error"); }
    finally { setBusy(false); }
  };
  const remove = async (bytes: number, work: () => Promise<unknown>) => {
    setBusy(true);
    setCleaning(true);
    try {
      await Promise.all([work(), new Promise(resolve => setTimeout(resolve, 900))]);
      await offline.refresh();
      await refresh();
      setFreedBytes(bytes);
    } catch { toast(t("settings.cache.local_cache.error"), "error"); }
    finally { setCleaning(false); setBusy(false); }
  };
  const likedDescription = !offline.enabled ? t("settings.storage.liked_status.disabled")
    : offline.phase === "saving" ? t("settings.storage.liked_status.saving", { count: offline.pending })
    : offline.phase === "limit" ? t("settings.storage.liked_status.limit", { count: offline.pending })
    : offline.phase === "offline" ? t("settings.storage.liked_status.offline")
    : offline.phase === "error" ? t("settings.storage.download_failed")
    : t("settings.storage.liked_desc", { songs: t("common.songs", { count: offline.downloads.length }) });
  const folderButton = window.linerElectron?.openCacheFolder ? <button type="button" title={t("settings.storage.open_folder")} aria-label={t("settings.storage.open_folder")}
    className="border-0 bg-transparent text-text-tertiary hover:text-text-primary cursor-pointer"
    onClick={() => { void openCacheFolder().then(opened => { if (!opened) toast(t("settings.connection.open_folder"), "info"); }); }}><FolderOpenLine size={18} /></button> : undefined;

  return <AnimatePresence mode="wait" initial={false}>
    {cleaning || freedBytes !== null ? <motion.div key="cleanup" role="status" aria-live="polite"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="min-h-[400px] flex flex-col items-center justify-center gap-4 text-center">
      {cleaning ? <CleaningDuck /> : <span className="text-[48px] text-text-primary" aria-hidden>✓</span>}
      <h3 className="text-[17px] font-semibold text-text-primary">{t(cleaning ? "settings.storage.clearing_title" : "settings.storage.cleared_title")}</h3>
      <p className="text-[13px] text-text-tertiary">{cleaning ? t("settings.storage.clearing_subtitle") : formatStorageBytes(freedBytes ?? 0)}</p>
      {cleaning ? <div className="w-[200px] h-1 rounded-full overflow-hidden bg-black/10 dark:bg-white/10"><motion.div className="h-full bg-text-primary" initial={{ width: "10%" }} animate={{ width: "90%" }} transition={{ duration: 8, ease: "easeOut" }} /></div>
        : <button type="button" className="rounded-full border-0 px-5 py-2 bg-black/10 dark:bg-white/10 text-text-primary" onClick={() => setFreedBytes(null)}>{t("settings.storage.done_button")}</button>}
    </motion.div> : <motion.div key="storage" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="lane-storage-settings flex flex-col gap-[24px] py-2">
    {!searchQuery?.trim() && <div className="pt-1 pb-0.5" aria-busy={!analytics}>
      <div className="flex items-baseline justify-between gap-4 mb-3">
        <span className="text-[30px] font-semibold tracking-tight text-text-primary tabular-nums">
          {analytics ? formatStorageBytes(total).split(" ")[0] : "…"}
          <span className="ml-1.5 text-[14px] font-normal text-text-tertiary">{analytics ? formatStorageBytes(total).split(" ")[1] : ""}</span>
        </span>
        {analytics?.freeBytes !== undefined && <span className="text-[12px] text-text-tertiary">{t("settings.storage.free_space", { size: formatStorageBytes(analytics.freeBytes) })}</span>}
      </div>
      <div className="flex h-[8px] gap-[3px] overflow-hidden rounded-full bg-black/10 dark:bg-white/10" aria-label={t("settings.storage.usage_title")}>
        {total > 0 && <><span className="rounded-full bg-text-primary min-w-[3px] transition-all" style={{ width: `${100 * musicBytes / total}%` }} />
          <span className="rounded-full bg-text-tertiary min-w-[3px] transition-all" style={{ width: `${100 * cacheBytes / total}%` }} /></>}
      </div>
      <div className="mt-3 flex flex-wrap gap-5 text-[12px] text-text-tertiary">
        <span className="flex items-center gap-2"><span className="h-[7px] w-[7px] rounded-full bg-text-primary" />{t("settings.storage.your_music")} {formatStorageBytes(musicBytes)}</span>
        <span className="flex items-center gap-2"><span className="h-[7px] w-[7px] rounded-full bg-text-tertiary" />{t("settings.storage.cache_title")} {formatStorageBytes(cacheBytes)}</span>
      </div>
    </div>}
    <SettingSection label={t("settings.storage.downloads_title")}>
      <SettingRow title={t("settings.storage.categories.liked")} titleKey="settings.storage.categories.liked" searchQuery={searchQuery}
        description={likedDescription} icon={<HeartFill />}
        control={<div className="flex items-center gap-2"><StorageAction label={formatStorageBytes(downloadedBytes)}
          action={t("settings.storage.remove")} confirmation={t("settings.storage.remove_size", { size: formatStorageBytes(downloadedBytes) })}
          disabled={busy || downloadedBytes === 0} onConfirm={() => void remove(downloadedBytes, offline.removeDownloads)} /><ToggleSwitch size="medium" checked={offline.enabled} onChange={offline.setEnabled} disabled={busy} ariaLabel={t("settings.storage.liked_toggle")} /></div>} />
      <SettingRow title={t("settings.storage.categories.local")} titleKey="settings.storage.categories.local" searchQuery={searchQuery}
        description={t("settings.storage.local_desc", { songs: t("common.songs", { count: local.length }) })} icon={<MusicLine />}
        control={<button type="button" onClick={() => { useModalStore.getState().closeSettings(); navigate("/local"); }} className="inline-flex h-[26px] w-[88px] items-center justify-center rounded-full bg-black/[0.06] dark:bg-white/[0.06] border-0 px-2 text-[11px] text-text-secondary cursor-pointer">{formatStorageBytes(localBytes)}</button>} />
      <SettingRow title={t("settings.storage.downloads_limit")} titleKey="settings.storage.downloads_limit" searchQuery={searchQuery}
        description={offline.limitBytes ? t("settings.storage.downloads_limit_hint", { count: Math.floor(offline.limitBytes / average) }) : t("settings.storage.downloads_limit_unlimited")}
        control={<LimitPills value={offline.limitBytes} options={[2, 5, 20, 0]} onChange={offline.setLimitBytes} disabled={busy} label={t("settings.storage.downloads_limit")} />} />
    </SettingSection>
    <SettingSection label={t("settings.storage.cache_title")} action={folderButton}>
      <SettingRow title={t("settings.storage.cache_row_title")} titleKey="settings.storage.cache_row_title" searchQuery={searchQuery}
        description={`${t("common.songs", { count: offline.cached.length })} · ${t("settings.storage.cache_row_desc")}`}
        control={<StorageAction label={formatStorageBytes(cacheBytes)} action={t("settings.storage.clear")}
          confirmation={t("settings.storage.clear_size", { size: formatStorageBytes(cacheBytes) })}
          disabled={busy || !analytics || cacheBytes === 0}
          onConfirm={() => void remove(cacheBytes, () => clearStorageCategories(cacheCategories.map(category => category.id)))} />} />
      <SettingRow title={t("settings.storage.cache_limit")} titleKey="settings.storage.cache_limit" searchQuery={searchQuery}
        description={cacheLimit ? t("settings.storage.cache_limit_hint", { count: Math.floor(cacheLimit / average) }) : t("settings.storage.cache_limit_unlimited")}
        control={<LimitPills value={cacheLimit} options={[1, 3, 10, 0]} label={t("settings.storage.cache_limit")} disabled={busy}
          onChange={value => { void run(async () => { await setAudioCacheLimitBytes(value); setCacheLimit(value); }); }} />} />
      <SettingRow title={t("settings.storage.cached_in_library")} titleKey="settings.storage.cached_in_library" searchQuery={searchQuery}
        description={t("settings.storage.cached_in_library_desc")}
        control={<ToggleSwitch size="medium" checked={offline.visibleOnline} onChange={offline.setVisibleOnline} ariaLabel={t("settings.storage.cached_in_library")} />} />
    </SettingSection>
  </motion.div>}
  </AnimatePresence>;
}
