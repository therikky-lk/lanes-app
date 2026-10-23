import { Link, useLocation } from "react-router-dom";
import { Home7Fill, Search3Fill, BookmarksFill, Settings4Fill, MusicFill } from "@mingcute/react";
import { useTranslation } from "@/languages";
import { useModalStore } from "@/features/library/store/modalStore";

interface MobileNavProps {
  searchOpen: boolean;
  onSearchToggle: () => void;
}

/** bottom tab bar of the phone layout */
export default function MobileNav({ searchOpen, onSearchToggle }: MobileNavProps) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const settingsOpen = useModalStore((s) => s.settingsOpen);
  const toggleSettings = useModalStore((s) => s.toggleSettings);

  const item = (active: boolean) =>
    `flex flex-1 flex-col items-center justify-center gap-[3px] h-full border-0 bg-transparent p-0 cursor-pointer select-none no-underline transition-opacity ${
      active ? "text-text-primary opacity-100" : "text-text-primary opacity-50"
    }`;
  const label = "text-[10.5px] font-[500] leading-none";
  const onRoute = (href: string) => !searchOpen && !settingsOpen && (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <nav
      className="shrink-0 w-full flex items-stretch bg-bg-primary/95 backdrop-blur-xl border-t border-border-primary/40"
      style={{
        height: "calc(58px + env(safe-area-inset-bottom, 0px))",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        fontFamily: "var(--font-inter), sans-serif",
      }}
    >
      <Link to="/" className={item(onRoute("/"))}>
        <Home7Fill size={23} />
        <span className={label}>{t("common.sidebar.home") || "Home"}</span>
      </Link>
      <button type="button" onClick={onSearchToggle} className={item(searchOpen)}>
        <Search3Fill size={23} />
        <span className={label}>{t("common.sidebar.search") || "Search"}</span>
      </button>
      <Link to="/library" className={item(onRoute("/library"))}>
        <BookmarksFill size={23} />
        <span className={label}>{t("common.sidebar.library") || "Library"}</span>
      </Link>
      <Link to="/local" className={item(onRoute("/local"))}>
        <MusicFill size={23} />
        <span className={label}>{t("local.title") || "My tracks"}</span>
      </Link>
      <button type="button" onClick={toggleSettings} className={item(settingsOpen)}>
        <Settings4Fill size={23} />
        <span className={label}>{t("common.sidebar.settings") || "Settings"}</span>
      </button>
    </nav>
  );
}
