import {
  AddLine,
  Search2Line,
  GridLine,
  GridFill,
  ListCheckLine,
  ListCheckFill,
} from "@mingcute/react";
import { motion } from "framer-motion";
import TextInput from "@/shared/ui/TextInput";
import type { LibraryTab, LibraryViewMode } from "../types";
import { useTranslation } from "@/languages";
import { useModalStore } from "../store/modalStore";
import { useIsContentTransparent } from "@/features/settings/store/customizationStore";

interface LibraryControlsProps {
  activeTab: LibraryTab;
  query: string;
  onQueryChange: (query: string) => void;
  viewMode: LibraryViewMode;
  onViewModeChange: (mode: LibraryViewMode) => void;
}

export default function LibraryControls({
  activeTab,
  query,
  onQueryChange,
  viewMode,
  onViewModeChange,
}: LibraryControlsProps) {
  const { t } = useTranslation();
  const hasCustomBg = useIsContentTransparent();
  const openCreatePlaylist = useModalStore((state) => state.openCreatePlaylist);

  const placeholderByTab: Record<LibraryTab, string> = {
    all: t("library.title"),
    playlists: t("library.search_playlists"),
    albums: t("library.search_albums"),
    artists: t("library.search_artists"),
  };

  return (
    <div className="flex flex-wrap items-center gap-[10px]">
      <button
        type="button"
        title={t("library.create_playlist")}
        aria-label={t("library.create_playlist")}
        onClick={() => openCreatePlaylist()}
        className={`inline-flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] border-0 cursor-pointer transition-colors duration-150 active:scale-[0.97] ${hasCustomBg ? "apple-glass-pill text-white/65 hover:text-white" : "bg-border-alpha-14 text-text-tertiary hover:bg-border-alpha-22 hover:text-text-primary"}`}
      >
        <AddLine size={20} />
      </button>
      <TextInput
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder={placeholderByTab[activeTab]}
        icon={<Search2Line size={16} className={hasCustomBg ? "!text-white/60 dark:!text-white/60" : undefined} />}
        className={`!h-[34px] w-[220px] md:w-[260px] rounded-lg ${
          hasCustomBg
            ? "apple-glass-pill !border-none [&_input]:placeholder:!text-white/50 dark:[&_input]:placeholder:!text-white/50"
            : "border-border-primary bg-bg-elevated"
        }`}
      />

      <div className="inline-flex items-center gap-[8px]">
        <button
          type="button"
          data-no-tooltip="true"
          aria-label={t("library.view_grid")}
          onClick={() => onViewModeChange("grid")}
          className={`relative inline-flex items-center justify-center h-[32px] w-[36px] rounded-[10px] border-0 transition-colors duration-150 cursor-pointer select-none active:scale-[0.97] ${
            viewMode === "grid"
              ? hasCustomBg
                ? "text-white dark:text-black"
                : "text-bg-primary"
              : hasCustomBg
                ? "apple-glass-pill text-white/65 hover:text-white"
                : "bg-border-alpha-14 text-text-tertiary hover:bg-border-alpha-22 hover:text-text-primary"
          }`}
        >
          {viewMode === "grid" && (
            <motion.div
              layoutId="activeLibraryView"
              className={`absolute inset-0 rounded-[10px] ${
                hasCustomBg ? "apple-glass-prominent" : "bg-text-primary"
              }`}
              transition={{ type: "spring", stiffness: 450, damping: 35 }}
            />
          )}
          <span className="relative z-10">{viewMode === "grid" ? (
            <GridFill size={16} />
          ) : (
            <GridLine size={16} />
          )}</span>
        </button>
        <button
          type="button"
          data-no-tooltip="true"
          aria-label={t("library.view_list")}
          onClick={() => onViewModeChange("list")}
          className={`relative inline-flex items-center justify-center h-[32px] w-[36px] rounded-[10px] border-0 transition-colors duration-150 cursor-pointer select-none active:scale-[0.97] ${
            viewMode === "list"
              ? hasCustomBg
                ? "text-white dark:text-black"
                : "text-bg-primary"
              : hasCustomBg
                ? "apple-glass-pill text-white/65 hover:text-white"
                : "bg-border-alpha-14 text-text-tertiary hover:bg-border-alpha-22 hover:text-text-primary"
          }`}
        >
          {viewMode === "list" && (
            <motion.div
              layoutId="activeLibraryView"
              className={`absolute inset-0 rounded-[10px] ${
                hasCustomBg ? "apple-glass-prominent" : "bg-text-primary"
              }`}
              transition={{ type: "spring", stiffness: 450, damping: 35 }}
            />
          )}
          <span className="relative z-10">{viewMode === "list" ? (
            <ListCheckFill size={16} />
          ) : (
            <ListCheckLine size={16} />
          )}</span>
        </button>
      </div>
    </div>
  );
}
