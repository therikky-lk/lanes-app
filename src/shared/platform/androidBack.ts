import { isNativeApp } from "./native";

type BackHandler = () => boolean;
const handlers: BackHandler[] = [];

/** register a "close me on Back" handler; return true when it consumed the press */
export function onAndroidBack(handler: BackHandler): () => void {
  handlers.push(handler);
  return () => {
    const i = handlers.lastIndexOf(handler);
    if (i >= 0) handlers.splice(i, 1);
  };
}

export async function installAndroidBackButton(): Promise<void> {
  if (!isNativeApp()) return;
  const { App } = await import("@capacitor/app");
  await App.addListener("backButton", () => {
    // newest overlay first (fullscreen player, search, settings...)
    for (let i = handlers.length - 1; i >= 0; i--) {
      if (handlers[i]()) return;
    }
    const atHome = !location.hash || location.hash === "#/" || location.hash === "#";
    if (!atHome && window.history.length > 1) window.history.back();
    else void App.minimizeApp();
  });
}
