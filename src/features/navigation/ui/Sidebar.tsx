import { memo } from "react";
import { LuChevronLeft, LuChevronRight } from "react-icons/lu";
import AppImage from "@/features/covers/ui/AppImage";
import { Link, useLocation } from "react-router-dom";
import { navSectionOf, sidebarNavItems } from "../data/navigation";
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
import { useTranslation } from "@/languages";
import { useTheme } from "next-themes";
import { usePlayerStore, type AccentVariant } from "@/features/player";
import { useModalStore } from "@/features/library";
import { useCustomizationStore, getBlockStyle } from "@/features/settings";
import { Tooltip } from "@/shared/ui";
import SidebarPins from "./SidebarPins";


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

interface SidebarProps {
  searchOpen: boolean;
  onSearchToggle: () => void;
  isEdgeToEdge?: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
  hasMacWindowControls?: boolean;
}

function Sidebar({ searchOpen, onSearchToggle, isEdgeToEdge = false, expanded, onToggleExpanded, hasMacWindowControls }: SidebarProps) {
  const { pathname, search } = useLocation();
  const { t } = useTranslation();
  const accentVariant = usePlayerStore((state) => state.accentVariant);
  const settingsOpen = useModalStore((state) => state.settingsOpen);
  const toggleSettings = useModalStore((state) => state.toggleSettings);
  const toggleLabel = t(expanded ? "common.sidebar.collapse" : "common.sidebar.expand");
  const rowWrapperClass = expanded ? "w-full min-w-0" : undefined;
  const slotClass = `group flex h-[36px] shrink-0 items-center rounded-lg border-0 bg-transparent text-text-primary cursor-pointer hover:bg-border-alpha-14 active:scale-[0.96] transition-transform duration-100 ${
    expanded ? "w-full min-w-0 justify-start gap-3 pl-[5px] pr-2" : "w-[36px] justify-center p-0"
  }`;

  const section = navSectionOf(pathname, search);
  const isItemActive = (id: string, href?: string) => {
    if (id === "search") {
      return searchOpen;
    }
    if (id === "settings") {
      return settingsOpen;
    }
    return href ? section === id : false;
  };

  const renderNavItems = () =>
    sidebarNavItems
      .filter((item) => item.id !== "settings")
      .map((item) => {
        const active = isItemActive(item.id, item.href);
        const Icon = item.Icon;
        const tooltipLabel = item.id === "liked"
          ? (t("library.liked_songs") || t(`common.sidebar.${item.id}`) || item.label)
          : (t(`common.sidebar.${item.id}`) || item.label);
        const content = (
          <>
            <Icon
              size={26}
              className={`shrink-0 transition-opacity duration-150 ${active ? "opacity-100" : "opacity-55 group-hover:opacity-90"}`}
            />
            {expanded && <span className="truncate text-[13px] font-medium">{tooltipLabel}</span>}
          </>
        );

        return (
          <Tooltip key={item.id} content={tooltipLabel} side="right" sideOffset={12} wrapperClassName={rowWrapperClass}>
            {item.id === "search" ? (
              <button
                type="button"
                aria-label={tooltipLabel}
                aria-pressed={searchOpen}
                onClick={onSearchToggle}
                className={slotClass}
              >
                {content}
              </button>
            ) : (
              <Link
                to={item.href!}
                aria-label={tooltipLabel}
                aria-current={active ? "page" : undefined}
                className={slotClass}
              >
                {content}
              </Link>
            )}
          </Tooltip>
        );
      });

  const renderSettingsButton = () => {
    const settingsItem = sidebarNavItems.find((item) => item.id === "settings");
    if (!settingsItem) return null;
    const Icon = settingsItem.Icon;
    const tooltipLabel = t("common.sidebar.settings") || settingsItem.label;
    return (
      <Tooltip
        content={tooltipLabel}
        side="right"
        sideOffset={12}
        wrapperClassName={rowWrapperClass}
      >
        <button
          type="button"
          aria-label={tooltipLabel}
          aria-pressed={settingsOpen}
          onClick={toggleSettings}
          className={slotClass}
        >
          <Icon
            size={26}
            className={`shrink-0 transition-opacity duration-150 ease-out ${
              settingsOpen ? "opacity-100" : "opacity-55 group-hover:opacity-90"
            }`}
          />
          {expanded && <span className="truncate text-[13px] font-medium">{tooltipLabel}</span>}
        </button>
      </Tooltip>
    );
  };

  const { resolvedTheme } = useTheme();
  const isDark =
    resolvedTheme
      ? resolvedTheme === "dark"
      : typeof document !== "undefined" &&
        (document.documentElement.getAttribute("data-theme") === "dark" ||
          (!document.documentElement.getAttribute("data-theme") &&
            window.matchMedia?.("(prefers-color-scheme: dark)")?.matches));
  const backgroundImage = useCustomizationStore((state) => state.backgroundImage);
  const sidebarConfig = useCustomizationStore((state) => state.sidebar);
  const hasCustomBg = Boolean(backgroundImage && isDark);
  const sidebarStyle = getBlockStyle(sidebarConfig, isDark, hasCustomBg);

  return (
      <div
        data-liquid-glass="sidebar"
        data-sidebar-expanded={expanded ? "" : undefined}
        data-keep-keyboard-focus
        className={`h-full w-full ${
          isEdgeToEdge ? "rounded-l-none" : "rounded-l-xl"
        } rounded-r-sm ${
          hasCustomBg || expanded ? "" : "bg-bg-primary"
        } flex flex-col overflow-hidden`}
        style={sidebarStyle}
      >
        <div className={`flex justify-center items-center pb-[16px] shrink-0 ${hasMacWindowControls ? "pt-[34px]" : "pt-[16px]"} ${expanded ? "px-[11px]" : ""}`}>
          <Tooltip content={toggleLabel} side="right" sideOffset={12} wrapperClassName={rowWrapperClass}>
            <button
              type="button"
              aria-label={toggleLabel}
              aria-expanded={expanded}
              onClick={onToggleExpanded}
              className={`group relative flex h-[36px] items-center rounded-lg border-0 bg-transparent text-text-primary cursor-pointer ${expanded ? "w-full gap-2 py-0 pl-px pr-2 hover:bg-border-alpha-14" : "w-[36px] justify-center p-0"}`}
            >
              <AppImage
                src={logo}
                alt=""
                width={34}
                height={34}
                className="w-[34px] h-[34px] shrink-0 theme-logo"
                draggable={false}
              />
              {expanded ? (
                <>
                  <span className="text-[14px] font-semibold">Lane</span>
                  <LuChevronLeft size={13} aria-hidden className="ml-auto shrink-0 opacity-60" />
                </>
              ) : (
                <LuChevronRight size={11} aria-hidden className="absolute -right-[8px] opacity-0 transition-opacity group-hover:opacity-60 group-focus-visible:opacity-60" />
              )}
            </button>
          </Tooltip>
        </div>

        <nav className={`relative shrink-0 flex flex-col items-center gap-[12px] py-[12px] ${expanded ? "px-[11px]" : ""}`}>
          {renderNavItems()}
        </nav>

        {/* pinned playlists / artists, under a line, filling the space down to settings */}
        <div className="flex min-h-0 flex-1 flex-col items-center">
          <SidebarPins expanded={expanded} />
        </div>

        <div className={`py-[16px] shrink-0 flex justify-center items-center ${expanded ? "px-[11px]" : ""}`}>
          {renderSettingsButton()}
        </div>
      </div>
  );
}

export default memo(Sidebar);
