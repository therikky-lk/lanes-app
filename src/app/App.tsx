import { HashRouter } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { ToastProvider, AppleEmojiProvider, RootErrorBoundary, GlobalTooltip, WindowAnimationContainer } from "@/shared/ui";
import { useWindowDrag } from "@/shared/hooks";
import { useAppIconSync } from "@/features/player";
import { I18nProvider } from "@/languages";
import { AuthLock } from "@/features/auth";
import { CoverSwRegistrar } from "@/features/covers";
import { usePresenceSync } from "@/shared/presence";
import { useTouchBarSync } from "@/features/touchbar";
import { useOverlaySync } from "@/features/overlay";
import { useDiscordSync } from "@/features/discord";
import { AppRoutes } from "./routes";
import DeeplinkHandler from "./DeeplinkHandler";
import EnvironmentWarning from "./EnvironmentWarning";
import { LiquidGlassFilter } from "./LiquidGlassFilter";
import { ConnectivityWall } from "@/features/connectivity";
import { ThemeSync } from "./ThemeSync";
import IOSStatusBarSync from "./IOSStatusBarSync";
import "./globals.css";
import "./liquid-glass.css";

function AppIconSync() {
  useAppIconSync();
  return null;
}

function PresenceSync() {
  usePresenceSync();
  return null;
}

function TouchBarSync() {
  useTouchBarSync();
  return null;
}

function OverlaySync() {
  useOverlaySync();
  return null;
}

function DiscordSync() {
  useDiscordSync();
  return null;
}

export default function App() {
  useWindowDrag();

  return (
    <HashRouter>
      <CoverSwRegistrar />
      <ThemeProvider
        attribute="data-theme"
        defaultTheme="system"
        enableSystem={true}
        disableTransitionOnChange
      >
        <GlobalTooltip />
        <LiquidGlassFilter />
        <ThemeSync />
        <IOSStatusBarSync />
        <AppIconSync />
        <PresenceSync />
        {window.linerElectron?.touchbarUpdateState && <TouchBarSync />}
        {window.linerElectron?.discordUpdateState && <DiscordSync />}
        <AppleEmojiProvider>
          <I18nProvider>
            {window.linerElectron?.overlayUpdateState && <OverlaySync />}
            <ToastProvider>
              <RootErrorBoundary>
                <WindowAnimationContainer>
                  <DeeplinkHandler />
                  <EnvironmentWarning />
                  <ConnectivityWall />
                  <AuthLock>
                    <AppRoutes />
                  </AuthLock>
                </WindowAnimationContainer>
              </RootErrorBoundary>
            </ToastProvider>
          </I18nProvider>
        </AppleEmojiProvider>
      </ThemeProvider>
    </HashRouter>
  );
}
