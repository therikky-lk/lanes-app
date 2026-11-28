import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useTheme } from "next-themes";
import { SystemBars, SystemBarsStyle } from "@capacitor/core";
import { nativePlatform } from "@/shared/platform/native";
import { usePlayerStore } from "@/features/player/store/playerStore";

export default function IOSStatusBarSync() {
  const { pathname } = useLocation();
  const { resolvedTheme } = useTheme();
  const fullscreen = usePlayerStore((state) => state.fullscreen);
  useEffect(() => {
    if (nativePlatform() !== "ios") return;
    // Router navigation uses pushState/replaceState, not always hashchange.
    const dark = pathname === "/login" || pathname === "/player" || fullscreen ||
      (resolvedTheme ?? document.documentElement.dataset.theme) === "dark";
    void SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light })
      .catch(() => undefined);
  }, [pathname, resolvedTheme, fullscreen]);
  return null;
}
