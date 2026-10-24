import type { ComponentType } from "react";
import {
  Home7Fill,
  SearchLine,
  BookmarksFill,
  HeartFill,
  Settings4Fill,
} from "@mingcute/react";

export interface NavItem {
  id: string;
  label: string;
  href?: string;
  Icon: ComponentType<{ size?: number; className?: string }>;
}

export const LIKED_HREF = "/library/playlist?id=likes";

/** which bottom/side menu entry a page belongs to */
export function navSectionOf(pathname: string, search: string): "home" | "library" | "liked" | null {
  if (pathname === "/" || pathname === "/home") return "home";
  if (pathname === "/library/playlist" && new URLSearchParams(search).get("id") === "likes") return "liked";
  if (pathname === "/library" || pathname.startsWith("/library/") || pathname === "/local" || pathname === "/recent") return "library";
  return null;
}

export const sidebarNavItems: NavItem[] = [
  { id: "home", label: "Home", href: "/", Icon: Home7Fill },
  { id: "search", label: "Search", Icon: SearchLine },
  { id: "library", label: "Library", href: "/library", Icon: BookmarksFill },
  { id: "liked", label: "Liked", href: LIKED_HREF, Icon: HeartFill },
  { id: "settings", label: "Settings", Icon: Settings4Fill },
];
