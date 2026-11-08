import { app, BrowserWindow, ipcMain, net, safeStorage, type IpcMainEvent, type IpcMainInvokeEvent } from "electron";
import path from "node:path";
import { AuthSessionStore } from "./auth-session-store.js";
import { syncServerTime } from "./crypto.js";
import { isAppUrl, isTrustedSender } from "./ipc-guard.js";

function fromApp(event: IpcMainEvent | IpcMainInvokeEvent): boolean {
  return isTrustedSender(event);
}

export function registerAuthSessionIpc(): AuthSessionStore {
  const cipher = {
    available: () => safeStorage.isEncryptionAvailable(),
    encrypt: (plain: string) => safeStorage.encryptString(plain),
    decrypt: (data: Buffer) => safeStorage.decryptString(data),
  };
  const deps = {
    fetch: (url: string, init: RequestInit) => net.fetch(url, init),
    syncClock: (dateHeader: string) => {
      syncServerTime(dateHeader);
    },
  };
  const store = new AuthSessionStore(
    path.join(app.getPath("userData"), "auth", "session.json"),
    cipher,
    deps,
  );
  const youtubeStore = new AuthSessionStore(
    path.join(app.getPath("userData"), "auth", "youtube-session.json"),
    cipher,
    deps,
  );

  store.onChange((session, origin) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.isDestroyed()) continue;
      const contents = win.webContents;
      if (contents.id === origin || !isAppUrl(contents.getURL())) continue;
      contents.send("auth:session-changed", session);
    }
  });

  ipcMain.on("auth:get-session", (event) => {
    event.returnValue = fromApp(event) ? store.get() : null;
  });

  ipcMain.handle("auth:set-session", (event, next: unknown) => {
    if (!fromApp(event)) return null;
    return store.set(next, event.sender.id);
  });

  ipcMain.handle(
    "auth:refresh",
    (event, input: { apiBaseUrl?: unknown; refreshToken?: unknown } | undefined) => {
      if (!fromApp(event)) return { outcome: "no_session", session: null };
      const apiBaseUrl = typeof input?.apiBaseUrl === "string" ? input.apiBaseUrl : "";
      const refreshToken = typeof input?.refreshToken === "string" ? input.refreshToken : undefined;
      return store.refresh(apiBaseUrl, refreshToken, event.sender.id);
    },
  );

  ipcMain.on("youtube-auth:get-session", (event) => {
    event.returnValue = fromApp(event) ? youtubeStore.get() : null;
  });
  ipcMain.handle("youtube-auth:set-session", (event, next: unknown) => {
    if (!fromApp(event)) return null;
    return youtubeStore.set(next);
  });

  return store;
}
