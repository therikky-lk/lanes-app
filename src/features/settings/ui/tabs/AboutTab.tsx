import DiagnosticsBox from "./DiagnosticsBox";
import { isNativeApp } from "@/shared/platform/native";
import { useState, useEffect, useMemo } from "react";
import { FaTelegramPlane, FaGithub } from "react-icons/fa";
import { Refresh1Line } from "@mingcute/react";
import { QuestionCircle } from "@solar-icons/react";
import Button from "@/shared/ui/Button";
import { useToast } from "@/shared/ui";
import { useTranslation, getTranslationsForAllLocales } from "@/languages";
import { APP_VERSION } from "@/shared/config/version";
import logo from "@/assets/logo.svg";
import spotifyLogo from "@/assets/branding/logo-spotify.svg";
import discordLogo from "@/assets/branding/logo-discord.svg";
import telegramLogo from "@/assets/branding/logo-telegram.svg";
import auroraLogo from "@/assets/branding/logo-aurora.svg";
import sunsetLogo from "@/assets/branding/logo-sunset.svg";
import oceanLogo from "@/assets/branding/logo-ocean.svg";
import forestLogo from "@/assets/branding/logo-forest.svg";
import berryLogo from "@/assets/branding/logo-berry.svg";
import carbonLogo from "@/assets/branding/logo-carbon.svg";
import pixelLogo from "@/assets/branding/logo-pixel.svg";
import scanlinesLogo from "@/assets/branding/logo-scanlines.svg";
import vhsLogo from "@/assets/branding/logo-vhs.svg";
import { usePlayerStore, type AccentVariant } from "@/features/player";
import { useUpdaterStore } from "@/features/updater";

const brandingLogos: Record<Exclude<AccentVariant, "default">, string> = {
  spotify: spotifyLogo,
  discord: discordLogo,
  telegram: telegramLogo,
  aurora: auroraLogo,
  sunset: sunsetLogo,
  ocean: oceanLogo,
  forest: forestLogo,
  berry: berryLogo,
  carbon: carbonLogo,
  pixel: pixelLogo,
  scanlines: scanlinesLogo,
  vhs: vhsLogo,
};

export function AboutTab({ searchQuery }: { searchQuery?: string }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const accentVariant = usePlayerStore((state) => state.accentVariant);

  const [appVersion, setAppVersion] = useState(APP_VERSION);
  const [bundleInfo, setBundleInfo] = useState<{
    bundleVersion: string;
    isOta: boolean;
    sha256: string | null;
  } | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  const compareVersions = (a: string, b: string) => {
    const left = a.replace(/^v/i, "").split(".").map(Number);
    const right = b.replace(/^v/i, "").split(".").map(Number);
    for (let i = 0; i < 3; i += 1) {
      const delta = (left[i] || 0) - (right[i] || 0);
      if (delta !== 0) return delta;
    }
    return 0;
  };

  const checkAndroidRelease = async (): Promise<boolean> => {
    const response = await fetch("https://api.github.com/repos/therikky-lk/lanes-app/releases/tags/releases", {
      cache: "no-store",
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!response.ok) throw new Error(`GitHub release check failed (${response.status})`);
    const release = (await response.json()) as {
      tag_name?: string;
      name?: string;
      assets?: Array<{ name?: string; browser_download_url?: string }>;
    };
    const latest = (release.name?.match(/(\d+\.\d+\.\d+)/)?.[1] || release.tag_name || "").replace(/^v/i, "");
    const apk = release.assets?.find((asset) => asset.name?.toLowerCase() === "lane-latest.apk") ||
      release.assets?.find((asset) => asset.name?.toLowerCase().endsWith(".apk"));
    if (latest && compareVersions(latest, appVersion) > 0 && apk?.browser_download_url) {
      window.open(apk.browser_download_url, "_blank");
      toast(`Доступна версия v${latest}. Открываю загрузку APK`, "checkmark");
      return true;
    }
    return false;
  };

  useEffect(() => {
    // dynamically query electron runtime version & bundle status
    if (window.linerElectron) {
      window.linerElectron
        .getAppVersion?.()
        .then((ver) => {
          if (ver) setAppVersion(ver);
        })
        .catch(() => {});

      window.linerElectron
        .bundleGetStatus?.()
        .then((status) => {
          if (status) {
            setBundleInfo({
              bundleVersion: status.bundleVersion,
              isOta: status.isOta,
              sha256: status.sha256,
            });
          }
        })
        .catch(() => {});
    }
  }, []);

  const openUrl = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleCheckUpdates = async () => {
    if (checkingUpdate) return;
    setCheckingUpdate(true);
    try {
      if (isNativeApp() && !window.linerElectron) {
        const opened = await checkAndroidRelease();
        if (!opened) toast(t("settings.about.latest_version_toast", { version: appVersion }), "info");
        return;
      }
      await useUpdaterStore.getState().checkForUpdates();
      const status = useUpdaterStore.getState().status;
      const updateInfo = useUpdaterStore.getState().updateInfo;
      if (status === "available" && updateInfo) {
        useUpdaterStore.getState().openDialog();
      } else {
        toast(t("settings.about.latest_version_toast", { version: appVersion }), "info");
      }
    } catch {
      toast(t("settings.about.latest_version_toast", { version: appVersion }), "info");
    } finally {
      setCheckingUpdate(false);
    }
  };

  // search query filter matching
  const isMatch = useMemo(() => {
    if (!searchQuery?.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    const searchableKeys = [
      "settings.about.liner",
      "settings.about.tagline",
      "settings.about.updates_title",
      "settings.about.build_info",
    ];
    return searchableKeys.some((k) =>
      getTranslationsForAllLocales(k).some((txt) => txt.toLowerCase().includes(q)),
    );
  }, [searchQuery]);

  if (!isMatch) return null;

  return (
    <div className="flex w-full flex-col items-center py-[8px]">
      <div
        className="relative flex min-h-[340px] w-full max-w-[604px] flex-col justify-between overflow-hidden rounded-[20px] bg-white/[0.08] p-[28px] text-left"
        style={{
          backgroundImage:
            "repeating-linear-gradient(58deg, transparent 0 70px, rgba(255,255,255,.018) 70px 140px, transparent 140px 220px)",
          fontFamily: "var(--font-inter), sans-serif",
        }}
      >
        <div className="flex items-start justify-between gap-[16px]">
          <div className="flex flex-col items-start">
            <img
              src={logo}
              alt="Lane Logo"
              width={48}
              height={48}
              className="h-[48px] w-[48px] theme-logo"
              draggable={false}
            />
            <span className="mt-[2px] text-[22px] font-[600] leading-none text-text-primary">
              {t("settings.about.liner")}
            </span>
          </div>
          <div className="inline-flex h-[34px] items-center gap-[8px] rounded-full bg-white/[0.10] px-[14px] text-[14px] font-[600] text-text-primary select-none">
            <span className="h-[8px] w-[8px] rounded-full bg-emerald-400" />
            <span>v{bundleInfo?.bundleVersion || appVersion}</span>
          </div>
        </div>

        <div className="flex flex-col items-start gap-[12px]">
          <Button
            variant="primary"
            size="sm"
            onClick={handleCheckUpdates}
            disabled={checkingUpdate}
            className="!h-[42px] !rounded-[12px] !px-[18px] !text-[14px] !font-[500] !gap-[10px]"
          >
            <Refresh1Line size={17} className={checkingUpdate ? "animate-spin" : ""} />
            {checkingUpdate
              ? t("settings.about.checking_updates")
              : t("settings.about.check_updates")}
          </Button>

          <div className="mt-[16px] flex w-full flex-wrap items-center gap-[8px]">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => openUrl("https://t.me/therikky_ls")}
              className="min-w-[104px] flex-1 !h-[38px] !rounded-[12px] !bg-white/[0.08] !px-[14px] !text-[13px] !gap-[8px]"
            >
              <FaTelegramPlane size={14} />
              {t("settings.about.telegram")}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => openUrl("https://discord.gg/D5saRWxcUx")}
              className="min-w-[104px] flex-1 !h-[38px] !rounded-[12px] !bg-white/[0.08] !px-[14px] !text-[13px] !gap-[8px]"
            >
              <QuestionCircle size={15} />
              {t("settings.about.support")}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => openUrl("https://github.com/therikky-lk/lanes-app")}
              className="min-w-[104px] flex-1 !h-[38px] !rounded-[12px] !bg-white/[0.08] !px-[14px] !text-[13px] !gap-[8px]"
            >
              <FaGithub size={14} />
              {t("settings.about.github")}
            </Button>
          </div>
        </div>
      </div>
      {isNativeApp() && <DiagnosticsBox />}
    </div>
  );
}

