import { randomUUID } from "node:crypto";
import { BrowserWindow } from "electron";
import {
  isYandexMusicSignInUrl,
  readYandexMusicOAuthCallback,
  yandexMusicAuthorizeUrl,
  type YandexMusicSignInResult,
} from "../src/shared/media/yandexMusicOAuth";
import { handleTrusted } from "./ipc-guard.js";

const TIMEOUT_MS = 10 * 60_000;

function signIn(parent: BrowserWindow): Promise<YandexMusicSignInResult> {
  const state = randomUUID();
  return new Promise((resolve) => {
    const win = new BrowserWindow({
      parent,
      modal: true,
      width: 520,
      height: 680,
      title: "Yandex ID",
      autoHideMenuBar: true,
      webPreferences: {
        partition: "lane-yandex-music-sign-in",
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        devTools: false,
      },
    });
    let settled = false;
    const finish = (result: YandexMusicSignInResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
      queueMicrotask(() => {
        if (!win.isDestroyed()) win.destroy();
      });
    };
    const timer = setTimeout(() => finish({ status: "failed" }), TIMEOUT_MS);
    const onNavigate = (event: { url: string; isMainFrame: boolean; preventDefault(): void }) => {
      if (!event.isMainFrame) return;
      const result = readYandexMusicOAuthCallback(event.url, state);
      if (result || !isYandexMusicSignInUrl(event.url)) event.preventDefault();
      if (result) finish(result);
    };
    win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    win.webContents.on("will-frame-navigate", onNavigate);
    win.webContents.on("will-redirect", onNavigate);
    win.webContents.on("did-navigate-in-page", (_event, url, isMainFrame) => {
      if (!isMainFrame) return;
      const result = readYandexMusicOAuthCallback(url, state);
      if (result) finish(result);
    });
    win.webContents.once("render-process-gone", () => finish({ status: "failed" }));
    win.once("closed", () => finish({ status: "cancelled" }));
    void win.loadURL(yandexMusicAuthorizeUrl(state)).catch(() => finish({ status: "failed" }));
  });
}

export function registerYandexMusicAccount(getWindow: () => BrowserWindow | null): void {
  let pending: Promise<YandexMusicSignInResult> | null = null;
  handleTrusted("yandex-music:sign-in", (event) => {
    const win = getWindow();
    if (!win || win.isDestroyed() || event.sender !== win.webContents) return { status: "failed" };
    pending ??= signIn(win).finally(() => { pending = null; });
    return pending;
  });
}
