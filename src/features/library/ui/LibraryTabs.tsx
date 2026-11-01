import { motion } from "framer-motion";
import type { LibraryTab } from "../types";
import { useTranslation } from "@/languages";
import { useIsContentTransparent } from "@/features/settings/store/customizationStore";

interface LibraryTabsProps {
  activeTab: LibraryTab;
  onChange: (tab: LibraryTab) => void;
}

const tabs: LibraryTab[] = ["all", "playlists", "albums", "artists"];

export default function LibraryTabs({
  activeTab,
  onChange,
}: LibraryTabsProps) {
  const { t } = useTranslation();
  const hasCustomBg = useIsContentTransparent();

  const tabLabels: Record<LibraryTab, string> = {
    all: t("common.all"),
    playlists: t("library.tab_playlists"),
    albums: t("library.tab_albums"),
    artists: t("library.tab_artists"),
  };

  return (
    <div className="inline-flex items-center gap-[8px]">
      {tabs.map((tab) => {
        const isActive = tab === activeTab;
        return (
          <button
            key={tab}
            type="button"
            onClick={() => onChange(tab)}
            className={`relative inline-flex h-[32px] items-center justify-center rounded-[10px] px-[18px] text-[13px] leading-none transition-colors duration-150 border-0 cursor-pointer select-none active:scale-[0.97] ${
              isActive
                ? hasCustomBg
                  ? "text-white dark:text-black font-semibold"
                  : "text-bg-primary"
                : hasCustomBg
                  ? "apple-glass-pill text-white/75 hover:text-white"
                  : "bg-border-alpha-14 text-text-secondary hover:bg-border-alpha-22 hover:text-text-primary"
            }`}
            style={{
              fontFamily: "var(--font-inter), sans-serif",
              fontWeight: isActive ? 500 : 400,
            }}
          >
            {isActive && (
              <motion.div
                layoutId="activeLibraryTab"
                className={`absolute inset-0 rounded-[10px] ${
                  hasCustomBg
                    ? "apple-glass-prominent"
                    : "bg-text-primary"
                }`}
                transition={{
                  type: "spring",
                  stiffness: 450,
                  damping: 35,
                }}
              />
            )}
            <span className="relative z-10">{tabLabels[tab]}</span>
          </button>
        );
      })}
    </div>
  );
}
