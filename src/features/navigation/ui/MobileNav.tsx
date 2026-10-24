import { Link, useLocation } from "react-router-dom";
import { Home7Fill, SearchLine, BookmarksFill, HeartFill, Settings4Fill } from "@mingcute/react";
import { LIKED_HREF, navSectionOf } from "../data/navigation";
import { useTranslation } from "@/languages";
import { useModalStore } from "@/features/library/store/modalStore";

interface MobileNavProps {
  searchOpen: boolean;
  onSearchToggle: () => void;
}

/** bottom tab bar of the phone layout */
export default function MobileNav({ searchOpen, onSearchToggle }: MobileNavProps) {
  const { t } = useTranslation();
  const { pathname, search } = useLocation();
  const settingsOpen = useModalStore((s) => s.settingsOpen);
  const toggleSettings = useModalStore((s) => s.toggleSettings);

  const item = (active: boolean) =>
    `flex flex-1 flex-col items-center justify-center gap-[3px] h-full border-0 bg-transparent p-0 cursor-pointer select-none no-underline transition-opacity ${
      active ? "text-text-primary opacity-100" : "text-text-primary opacity-50"
    }`;
  const label = "text-[10.5px] font-[500] leading-none";
  const section = navSectionOf(pathname, search);
  const onSection = (id: "home" | "library" | "liked") => !searchOpen && !settingsOpen && section === id;

  return (
    <nav
      className="shrink-0 w-full flex items-stretch bg-bg-primary/55 backdrop-blur-2xl backdrop-saturate-150 border-t border-white/[0.06]"
      style={{
        height: "calc(58px + var(--lane-safe-bottom, 0px))",
        paddingBottom: "var(--lane-safe-bottom, 0px)",
        fontFamily: "var(--font-inter), sans-serif",
      }}
    >
      <Link to="/" className={item(onSection("home"))}>
        <Home7Fill size={23} />
        <span className={label}>{t("common.sidebar.home") || "Home"}</span>
      </Link>
      <button type="button" onClick={onSearchToggle} className={item(searchOpen)}>
        <SearchLine size={23} />
        <span className={label}>{t("common.sidebar.search") || "Search"}</span>
      </button>
      <Link to="/library" className={item(onSection("library"))}>
        <BookmarksFill size={23} />
        <span className={label}>{t("common.sidebar.library") || "Library"}</span>
      </Link>
      <Link to={LIKED_HREF} className={item(onSection("liked"))}>
        <HeartFill size={23} />
        <span className={label}>{t("common.sidebar.liked") || "Liked"}</span>
      </Link>
      <button type="button" onClick={toggleSettings} className={item(settingsOpen)}>
        <Settings4Fill size={23} />
        <span className={label}>{t("common.sidebar.settings") || "Settings"}</span>
      </button>
    </nav>
  );
}
