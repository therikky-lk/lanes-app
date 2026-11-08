import { app, ipcMain, shell, type IpcMainEvent, type IpcMainInvokeEvent, type WebContents } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

export function isAppUrl(
  url: string | undefined,
  devServerUrl = process.env.VITE_DEV_SERVER_URL,
  fileRoots: string[] = [
    path.join(app.getAppPath(), "dist"),
    path.join(app.getPath("userData"), "bundles"),
  ],
): boolean {
  if (!url) return false;
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return false;
  }
  if (devServerUrl) {
    try {
      return target.origin === new URL(devServerUrl).origin;
    } catch {
      return false;
    }
  }
  if (target.protocol !== "file:") return false;
  try {
    const filePath = fileURLToPath(target);
    return fileRoots.some((root) => isWithin(root, filePath));
  } catch {
    return false;
  }
}

export function isTrustedSender(event: IpcMainEvent | IpcMainInvokeEvent): boolean {
  const frame = event.senderFrame;
  return Boolean(frame && frame === event.sender.mainFrame && isAppUrl(frame.url));
}

export function handleTrusted(
  channel: string,
  handler: (event: IpcMainInvokeEvent, ...args: any[]) => unknown,
): void {
  ipcMain.handle(channel, (event, ...args) => {
    if (!isTrustedSender(event)) throw new Error(`untrusted sender for ${channel}`);
    return handler(event, ...args);
  });
}

export function onTrusted(
  channel: string,
  listener: (event: IpcMainEvent, ...args: any[]) => void,
): void {
  ipcMain.on(channel, (event, ...args) => {
    if (!isTrustedSender(event)) {
      event.returnValue = null;
      return;
    }
    listener(event, ...args);
  });
}

export function isSafeExternalUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && Boolean(url.hostname);
  } catch {
    return false;
  }
}

export function confineToApp(
  contents: WebContents,
  openExternal: (url: string) => void = (url) => { void shell.openExternal(url); },
  isTrustedUrl: (url: string) => boolean = (url) => isAppUrl(url),
): void {
  contents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) openExternal(url);
    return { action: "deny" };
  });
  contents.on("will-navigate", (event, url) => {
    if (isTrustedUrl(url)) return;
    event.preventDefault();
    if (isSafeExternalUrl(url)) openExternal(url);
  });
  contents.on("will-redirect", (event, url) => {
    if (!isTrustedUrl(url)) event.preventDefault();
  });
}
