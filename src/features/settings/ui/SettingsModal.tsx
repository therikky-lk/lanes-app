import { useLocation, useNavigate, useParams } from "react-router-dom";
import SettingsPageFrame from "./SettingsPageFrame";
import { onAndroidBack } from "@/shared/platform/androidBack";
import { useState, useMemo, useEffect } from "react";
import { motion } from "framer-motion";
import { CloseLine, Search2Line, CloseCircleFill, DiscordFill, KeyboardLine, DeviceLine, Music2Fill, YoutubeFill, RightLine } from "@mingcute/react";
import { ConnectTab } from "./tabs/ConnectTab";
import {
  Play,
  Palette,
  Gallery,
  HeadphonesRound,
  InfoCircle,
  Database,
  Widget5,
} from "@solar-icons/react";
import Dialog from "@/shared/ui/Dialog";
import { useIsMobile } from "@/shared/hooks/useIsMobile";
import { isNativeApp } from "@/shared/platform/native";
import { ArrowLeftLine } from "@mingcute/react";
import SettingsAccount from "./SettingsAccount";
import { useTranslation, getTranslationsForAllLocales } from "@/languages";
import { useModalStore } from "@/features/library";
import {
  PlaybackTab,
  ShortcutsTab,
  AppearanceTab,
  CustomizationTab,
  AudioTab,
  StorageTab,
  AboutTab,
  OverlayTab,
  DiscordTab,
  YoutubeTab,
  YandexMusicTab,
} from "./tabs";

type TabId = "Playback" | "Connect" | "Shortcuts" | "Overlay" | "Discord" | "Youtube" | "YandexMusic" | "Appearance" | "Customization" | "Audio" | "Storage" | "About";

const TAB_ICONS: Record<TabId, React.ComponentType<any>> = {
  Playback: Play,
  Connect: DeviceLine,
  Shortcuts: KeyboardLine,
  Overlay: Widget5,
  Discord: DiscordFill,
  Youtube: YoutubeFill,
  YandexMusic: Music2Fill,
  Appearance: Palette,
  Customization: Gallery,
  Audio: HeadphonesRound,
  Storage: Database,
  About: InfoCircle,
};

// Android has no keyboard shortcuts, desktop overlay or Discord presence
const DESKTOP_ONLY_TABS = new Set<TabId>(["Shortcuts", "Overlay", "Discord"]);
const TAB_GROUPS: { labelKey: "player" | "interface" | "integrations" | "application"; ids: TabId[] }[] = [
  { labelKey: "player", ids: ["Playback", "Audio", "Shortcuts"] },
  { labelKey: "interface", ids: ["Appearance", "Overlay"] },
  { labelKey: "integrations", ids: ["Youtube", "YandexMusic", "Connect", "Discord"] },
  { labelKey: "application", ids: ["Storage", "About"] },
].map((group) => ({
  ...group,
  ids: isNativeApp() ? (group.ids as TabId[]).filter((id) => !DESKTOP_ONLY_TABS.has(id)) : (group.ids as TabId[]),
})) as { labelKey: "player" | "interface" | "integrations" | "application"; ids: TabId[] }[];


const ALL_SETTING_ITEMS: { tabId: TabId; titleKey: string; descKey?: string }[] = [
  // Playback
  { tabId: "Playback", titleKey: "settings.autoplay_similar.title", descKey: "settings.autoplay_similar.description" },
  { tabId: "Playback", titleKey: "settings.track_double_click.title", descKey: "settings.track_double_click.description" },
  { tabId: "Playback", titleKey: "settings.default_playback_context.title", descKey: "settings.default_playback_context.description" },
  { tabId: "Playback", titleKey: "settings.audio.pause_on_device_change.title", descKey: "settings.audio.pause_on_device_change.description" },

  { tabId: "Audio", titleKey: "player.equalizer", descKey: "player.equalizer_hint" },
  { tabId: "Storage", titleKey: "settings.storage.downloads_limit", descKey: "settings.storage.downloads_limit_hint" },
  { tabId: "Storage", titleKey: "settings.storage.categories.liked", descKey: "settings.storage.liked_toggle" },
  { tabId: "Appearance", titleKey: "library.liked_songs" },
  { tabId: "Appearance", titleKey: "library.cached_songs" },
  { tabId: "Appearance", titleKey: "library.on_device" },
  { tabId: "Appearance", titleKey: "settings.storage.remember_library_view", descKey: "settings.storage.remember_library_view_desc" },
  { tabId: "Appearance", titleKey: "settings.storage.remember_library_layout", descKey: "settings.storage.remember_library_layout_desc" },
  { tabId: "Storage", titleKey: "settings.storage.cache_row_title", descKey: "settings.storage.cache_row_desc" },

  // Shortcuts
  { tabId: "Shortcuts", titleKey: "settings.shortcuts.global_section", descKey: "settings.shortcuts.global_desc" },
  { tabId: "Shortcuts", titleKey: "settings.shortcuts.main_app_section", descKey: "settings.shortcuts.main_app_desc" },
  { tabId: "Shortcuts", titleKey: "settings.shortcuts.miniplayer_section", descKey: "settings.shortcuts.miniplayer_desc" },
  { tabId: "Shortcuts", titleKey: "settings.shortcuts.toggle_overlay", descKey: "settings.shortcuts.toggle_overlay_desc" },
  { tabId: "Shortcuts", titleKey: "settings.shortcuts.quick_like_song", descKey: "settings.shortcuts.quick_like_song_desc" },
  { tabId: "Shortcuts", titleKey: "settings.shortcuts.play_pause", descKey: "settings.shortcuts.play_pause_desc" },
  { tabId: "Shortcuts", titleKey: "settings.shortcuts.next_track", descKey: "settings.shortcuts.next_track_desc" },
  { tabId: "Shortcuts", titleKey: "settings.shortcuts.prev_track", descKey: "settings.shortcuts.prev_track_desc" },
  { tabId: "Shortcuts", titleKey: "settings.shortcuts.like_track", descKey: "settings.shortcuts.like_track_desc" },

  // Overlay
  { tabId: "Overlay", titleKey: "settings.overlay.position.title", descKey: "settings.overlay.position.description" },
  { tabId: "Overlay", titleKey: "settings.overlay.show_lyrics.title", descKey: "settings.overlay.show_lyrics.description" },
  { tabId: "Overlay", titleKey: "settings.overlay.auto_show_on_minimize.title", descKey: "settings.overlay.auto_show_on_minimize.description" },
  { tabId: "Overlay", titleKey: "settings.overlay.always_on_top.title", descKey: "settings.overlay.always_on_top.description" },

  // Discord
  { tabId: "Discord", titleKey: "settings.discord.enable.title", descKey: "settings.discord.enable.description" },
  { tabId: "Discord", titleKey: "settings.discord.show_timeline.title", descKey: "settings.discord.show_timeline.description" },
  { tabId: "Discord", titleKey: "settings.discord.show_artwork.title", descKey: "settings.discord.show_artwork.description" },
  { tabId: "Discord", titleKey: "settings.discord.show_artist_image.title", descKey: "settings.discord.show_artist_image.description" },
  { tabId: "Discord", titleKey: "settings.discord.show_paused.title", descKey: "settings.discord.show_paused.description" },
  { tabId: "Discord", titleKey: "settings.discord.show_button.title", descKey: "settings.discord.show_button.description" },
  { tabId: "Discord", titleKey: "settings.discord.show_download_button.title", descKey: "settings.discord.show_download_button.description" },

  // YouTube
  { tabId: "Youtube", titleKey: "settings.youtube.description" },
  { tabId: "Youtube", titleKey: "settings.youtube.account_playback.title", descKey: "settings.youtube.account_playback.description" },
  { tabId: "Youtube", titleKey: "settings.youtube.prompt_sign_in.title", descKey: "settings.youtube.prompt_sign_in.description" },
  { tabId: "Youtube", titleKey: "settings.youtube.sync_library.title", descKey: "settings.youtube.sync_library.description" },
  { tabId: "YandexMusic", titleKey: "settings.yandex_music.import", descKey: "settings.yandex_music.also_like_description" },

  // Appearance
  { tabId: "Appearance", titleKey: "settings.language.label", descKey: "settings.language.description" },
  { tabId: "Appearance", titleKey: "settings.theme.title", descKey: "settings.theme.description" },

  // Customization
  { tabId: "Appearance", titleKey: "settings.customization.wallpaper_title", descKey: "settings.customization.wallpaper_description" },
  { tabId: "Appearance", titleKey: "settings.customization.blocks_title", descKey: "settings.customization.blocks_description" },
  { tabId: "Appearance", titleKey: "settings.customization.reset_all", descKey: "settings.customization.reset_all_desc" },

  // Audio
  { tabId: "Audio", titleKey: "settings.audio.title", descKey: "settings.audio.description" },
  { tabId: "Audio", titleKey: "settings.connection.checks_title" },

  // Storage
  { tabId: "Storage", titleKey: "settings.storage.title", descKey: "settings.storage.description" },
  { tabId: "Storage", titleKey: "settings.storage.usage_title" },
  { tabId: "Storage", titleKey: "settings.storage.open_folder", descKey: "settings.storage.open_folder_description" },

  // About
  { tabId: "About", titleKey: "settings.about.liner", descKey: "common.app.version" },
  { tabId: "About", titleKey: "settings.notifications.test_button" },
];

const SETTING_ITEMS = ALL_SETTING_ITEMS.filter((item) => !isNativeApp() || !DESKTOP_ONLY_TABS.has(item.tabId));

const font = { fontFamily: "var(--font-inter), sans-serif" } as const;

export default function SettingsModal({ page = false }: { page?: boolean }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { tab } = useParams();
  const routeTab = tab && tab in TAB_ICONS ? tab as TabId : undefined;
  const { t } = useTranslation();
  const modalOpen = useModalStore((state) => state.settingsOpen);
  const open = page || modalOpen;
  const close = useModalStore((state) => state.closeSettings);

  const [selectedTab, setSelectedTab] = useState<TabId>("Playback");
  const activeTab = page ? routeTab ?? selectedTab : selectedTab;
  const setActiveTab = (id: TabId) => {
    setSelectedTab(id);
    if (page) navigate(`/settings/${id}`, { state: { settingsParent: true } });
  };
  const [searchQuery, setSearchQuery] = useState("");

  const handleClose = () => {
    setSearchQuery("");
    if (page) {
      if (window.history.length > 1) navigate(-1);
      else navigate("/");
    } else close();
  };

  const tabLabels: Record<TabId, string> = {
    Playback: t("settings.tabs.playback"),
    Connect: "Lane Connect",
    Shortcuts: t("settings.tabs.shortcuts") || "Shortcuts",
    Overlay: t("settings.tabs.overlay") || "Overlay",
    Discord: t("settings.tabs.discord") || "Discord RPC",
    Youtube: t("settings.tabs.youtube") || "YouTube",
    YandexMusic: t("settings.yandex_music.title"),
    Appearance: t("settings.tabs.appearance"),
    Customization: t("settings.tabs.customization") || "Customization",
    Audio: t("settings.tabs.audio"),
    Storage: t("settings.tabs.storage"),
    About: t("settings.tabs.about"),
  };

  const tabDescriptions: Record<TabId, string> = {
    Playback: t("settings.playback.description"),
    Connect: t("connect.description"),
    Shortcuts: t("settings.shortcuts.description") || "System-wide and player keyboard shortcuts.",
    Overlay: t("settings.overlay.description") || "Desktop overlay behavior, position and lyrics display.",
    Discord: t("settings.discord.description") || "Show what you're listening to on Discord with artwork, artist badge and progress bar.",
    Youtube: t("settings.youtube.description") || "Sign in to your YouTube account to prevent playback errors.",
    YandexMusic: t("settings.yandex_music.description"),
    Appearance: t("settings.theme.description"),
    Customization: t("settings.customization.description") || "Window background wallpaper, transparency and block blur effects.",
    Audio: t("settings.audio.description"),
    Storage: t("settings.storage.description"),
    About: t("settings.about.tagline"),
  };

  const matchingTabIds = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const query = searchQuery.toLowerCase().trim();
    const set = new Set<TabId>();

    const TAB_LABEL_KEYS: Record<TabId, string> = {
      Playback: "settings.tabs.playback",
      Connect: "connect.tab",
      Shortcuts: "settings.tabs.shortcuts",
      Overlay: "settings.tabs.overlay",
      Discord: "settings.tabs.discord",
      Youtube: "settings.tabs.youtube",
      YandexMusic: "settings.yandex_music.title",
      Appearance: "settings.theme.title",
      Customization: "settings.tabs.customization",
      Audio: "settings.tabs.audio",
      Storage: "settings.tabs.storage",
      About: "settings.tabs.about",
    };

    const TAB_DESC_KEYS: Record<TabId, string> = {
      Playback: "settings.playback.description",
      Connect: "connect.description",
      Shortcuts: "settings.shortcuts.description",
      Overlay: "settings.overlay.description",
      Discord: "settings.discord.description",
      Youtube: "settings.youtube.description",
      YandexMusic: "settings.yandex_music.description",
      Appearance: "settings.theme.description",
      Customization: "settings.customization.description",
      Audio: "settings.audio.description",
      Storage: "settings.storage.description",
      About: "settings.about.tagline",
    };


    (Object.keys(TAB_LABEL_KEYS) as TabId[]).forEach((tabId) => {
      const texts = [
        ...getTranslationsForAllLocales(TAB_LABEL_KEYS[tabId]),
        ...getTranslationsForAllLocales(TAB_DESC_KEYS[tabId]),
      ];
      if (texts.some((txt) => txt.toLowerCase().includes(query))) {
        set.add(tabId);
      }
    });

    SETTING_ITEMS.forEach((item) => {
      const texts = [
        ...getTranslationsForAllLocales(item.titleKey),
        ...(item.descKey ? getTranslationsForAllLocales(item.descKey) : []),
      ];
      if (texts.some((txt) => txt.toLowerCase().includes(query))) {
        set.add(item.tabId);
      }
    });

    return set;
  }, [searchQuery]);

  const filteredGroups = useMemo(() => {
    if (!matchingTabIds) return TAB_GROUPS;

    return TAB_GROUPS.map((group) => {
      const ids = group.ids.filter((id) => matchingTabIds.has(id));
      return { ...group, ids };
    }).filter((group) => group.ids.length > 0);
  }, [matchingTabIds]);

  useEffect(() => {
    if (!searchQuery.trim()) return;
    if (matchingTabIds && matchingTabIds.size > 0 && !matchingTabIds.has(activeTab)) {
      const firstMatch = TAB_GROUPS.flatMap((g) => g.ids).find((id) => matchingTabIds.has(id));
      if (firstMatch) {
        setActiveTab(firstMatch);
      }
    }
  }, [searchQuery, matchingTabIds, activeTab]);

  // phone: the tab list and a tab's page are two screens
  const isMobile = useIsMobile();
  const [mobilePanel, setMobilePanel] = useState(false);
  const mobilePage = page ? !!routeTab : mobilePanel;
  const setMobilePage = (next: boolean) => {
    if (!page) setMobilePanel(next);
    else if (!next) {
      if (location.state?.settingsParent) navigate(-1);
      else navigate("/settings", { replace: true, state: { settingsDirection: -1 } });
    }
  };
  const Container = page ? SettingsPageFrame : Dialog;
  useEffect(() => {
    if (!open) setMobilePage(false);
  }, [open]);
  // Android Back on a settings page returns to the list first
  useEffect(() => {
    if (!open || !mobilePage) return;
    return onAndroidBack(() => {
      setMobilePage(false);
      return true;
    });
  }, [open, mobilePage]);


  return (
    <Container
      open={open}
      onOpenChange={(next) => (!next ? handleClose() : undefined)}
      maxWidth={900}
      maxHeight="92vh"
      backdropClassName={`lane-settings-backdrop ${isMobile ? "lane-settings-mobile-backdrop" : ""}`}
      className={`lane-settings-shell p-0 h-[700px] !flex-row overflow-hidden ${isMobile ? "lane-settings-mobile" : ""}`}
    >
      <aside className={`${isMobile ? (mobilePage ? "hidden" : "flex-1 w-full") : "w-[248px] shrink-0"} flex flex-col min-h-0 bg-transparent`}>
        {isMobile && (
          <div className="flex items-center gap-[8px] px-[10px] pt-[10px]">
            <button
              type="button"
              aria-label={t("common.back") || "Back"}
              onClick={handleClose}
              className="w-[36px] h-[36px] shrink-0 inline-flex items-center justify-center rounded-md text-text-secondary hover:text-white transition-colors border-0 bg-transparent p-0 cursor-pointer"
            >
              <ArrowLeftLine size={21} />
            </button>
            <h2 className="m-0 text-[20px] font-[600] tracking-[-0.01em] text-text-primary" style={font}>
              {t("common.sidebar.settings") || "Settings"}
            </h2>
            <div className="ml-auto flex items-center"><SettingsAccount compact onSignOut={handleClose} /></div>
          </div>
        )}
        {!isMobile && <div className="flex justify-start px-[12px] pt-[12px]"><SettingsAccount onSignOut={handleClose} /></div>}
        <div className="px-[12px] pt-[14px] pb-[8px]">
          <div className="relative flex items-center">
            <Search2Line
              size={15}
              className="absolute left-[10px] text-text-tertiary pointer-events-none"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("settings.search_placeholder")}
              className="w-full h-[40px] pl-[30px] pr-[26px] bg-border-alpha-14 text-text-primary text-[13px] rounded-[8px] border-0 outline-none placeholder:text-text-tertiary focus:bg-border-alpha-20 transition-colors"
              style={font}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-[6px] p-0 border-0 bg-transparent text-text-tertiary hover:text-text-primary cursor-pointer flex items-center justify-center"
              >
                <CloseCircleFill size={14} />
              </button>
            )}
          </div>
        </div>

        <nav
          className="flex-1 min-h-0 overflow-y-auto px-[12px] pb-[12px] flex flex-col gap-[14px]"
          role="tablist"
          aria-label={t("settings.title")}
        >
          {filteredGroups.length === 0 ? (
            <p className="text-text-tertiary text-[12px] px-[10px] py-[8px] m-0" style={font}>
              {t("search.no_results") || "Ничего не найдено"}
            </p>
          ) : (
            filteredGroups.map((group) => (
            <div key={group.labelKey} className="lane-settings-nav-group flex flex-col gap-[2px]">
              <p
                className="text-text-tertiary text-[12px] font-[500] m-0 px-[10px] pb-[6px] pt-[2px]"
                style={font}
              >
                {t(`settings.groups.${group.labelKey}`)}
              </p>
              <div className="lane-settings-nav-items flex flex-col gap-[2px] rounded-xl p-[4px]">
              {group.ids.map((id) => {
                const isActive = id === activeTab;
                const Icon = TAB_ICONS[id];
                return (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => {
                      setActiveTab(id);
                      setMobilePage(true);
                    }}
                    className={`w-full flex items-center gap-[10px] px-[10px] py-[8px] rounded-[8px] border-0 cursor-pointer text-left transition-colors ${
                      isActive && !isMobile
                        ? "relative text-text-primary"
                        : "bg-transparent text-text-secondary"
                    }`}
                    style={{ ...font, fontSize: "14.5px", fontWeight: isActive && !isMobile ? 500 : 400 }}
                  >
                    {isActive && !isMobile && (
                      <motion.span
                        layoutId="settings-nav-active"
                        transition={{ type: "spring", stiffness: 520, damping: 40 }}
                        className="absolute inset-0 rounded-[8px] bg-black/[0.07] dark:bg-white/[0.12]"
                        aria-hidden="true"
                      />
                    )}
                    <Icon
                      size={18}
                      weight="Bold"
                      className={`relative shrink-0 ${isActive ? "text-text-primary" : "text-text-tertiary"}`}
                    />
                    <span className="relative truncate leading-none">{tabLabels[id]}</span>
                    {isMobile && <RightLine size={16} className="ml-auto shrink-0 text-text-tertiary" />}
                  </button>
                );
              })}
              </div>
            </div>
          )))}

        </nav>


      </aside>

      {/* Mount only the active phone screen. */}
      {(!isMobile || mobilePage) && <div className={`flex-1 min-w-0 min-h-0 p-[2px] ${isMobile && !mobilePage ? "hidden" : "flex"}`}>
        <div className="lane-settings-content flex-1 min-w-0 min-h-0 flex flex-col rounded-[20px] overflow-hidden">
        <div className="flex items-start justify-between gap-[16px] px-[24px] pt-[24px] pb-[14px] shrink-0">
          {isMobile && (
            <button
              type="button"
              aria-label={t("common.back") || "Back"}
              onClick={() => setMobilePage(false)}
              className="-ml-[6px] w-[32px] h-[32px] shrink-0 inline-flex items-center justify-center rounded-md text-text-primary hover:text-text-secondary border-0 bg-transparent p-0 cursor-pointer transition-colors"
            >
              <ArrowLeftLine size={20} />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <h3
              className="text-text-primary text-[20px] m-0 font-[650] tracking-[-0.02em]"
              style={font}
            >
              {tabLabels[activeTab]}
            </h3>
            <p
              className="text-text-tertiary text-[13px] m-0 mt-[3px] leading-snug"
              style={font}
            >
              {tabDescriptions[activeTab]}
            </p>
          </div>
          {!isMobile && (
            <button
              type="button"
              aria-label={t("common.close") || "Close"}
              onClick={handleClose}
              className="w-[28px] h-[28px] shrink-0 inline-flex items-center justify-center rounded-md text-text-tertiary hover:text-text-primary transition-colors border-0 bg-transparent p-0 cursor-pointer"
            >
              <CloseLine size={17} />
            </button>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-[24px] pb-[16px] flex flex-col">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 7 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
            className="flex-1 flex flex-col"
          >
            {activeTab === "Playback" && <PlaybackTab searchQuery={searchQuery} />}
            {activeTab === "Connect" && <ConnectTab searchQuery={searchQuery} />}
            {activeTab === "Shortcuts" && <ShortcutsTab searchQuery={searchQuery} />}
            {activeTab === "Overlay" && <OverlayTab searchQuery={searchQuery} />}
            {activeTab === "Discord" && <DiscordTab searchQuery={searchQuery} />}
            {activeTab === "Youtube" && <YoutubeTab searchQuery={searchQuery} />}
            {activeTab === "YandexMusic" && <YandexMusicTab />}
            {(activeTab === "Appearance" || activeTab === "Customization") && (
              <div className="flex flex-col gap-[28px]">
                <AppearanceTab searchQuery={searchQuery} />
                <CustomizationTab searchQuery={searchQuery} />
              </div>
            )}
            {activeTab === "Audio" && <AudioTab searchQuery={searchQuery} />}
            {activeTab === "Storage" && <StorageTab searchQuery={searchQuery} />}
            {activeTab === "About" && <AboutTab searchQuery={searchQuery} />}

          </motion.div>
        </div>
        </div>
      </div>}
    </Container>
  );
}
