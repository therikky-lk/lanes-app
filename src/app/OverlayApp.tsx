import { ThemeProvider } from "next-themes";
import GlobalTooltip from "@/shared/ui/GlobalTooltip";
import { OverlayPlayer } from "@/features/overlay/ui/OverlayPlayer";
import { getAuthSession } from "@/shared/api/auth-session";
import { I18nProvider } from "@/languages";
import "./globals.css";

export default function OverlayApp() {
  if (!getAuthSession()) {
    window.linerElectron?.closeOverlay?.();
    return null;
  }

  return (
    <ThemeProvider attribute="data-theme" defaultTheme="dark" enableSystem={false} forcedTheme="dark">
      <GlobalTooltip />
      <I18nProvider>
        <OverlayPlayer />
      </I18nProvider>
    </ThemeProvider>
  );
}
