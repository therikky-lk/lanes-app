// Spotify account link for importing the user's Liked Songs: a login window in
// its own persistent session; requests that need the login go through that
// session so its cookies are attached (the page itself never sees them).
import { BrowserWindow, ipcMain, session } from "electron";

const PARTITION = "persist:lane-spotify";
const ALLOWED_HOSTS = new Set(["open.spotify.com", "api.spotify.com", "clienttoken.spotify.com", "api-partner.spotify.com"]);

function spotifySession() {
  return session.fromPartition(PARTITION);
}

async function hasLogin(): Promise<boolean> {
  const cookies = await spotifySession().cookies.get({ name: "sp_dc" });
  return cookies.length > 0;
}

function login(parent: BrowserWindow | null): Promise<boolean> {
  return new Promise((resolve) => {
    const win = new BrowserWindow({
      width: 480,
      height: 720,
      parent: parent ?? undefined,
      modal: Boolean(parent),
      title: "Spotify",
      autoHideMenuBar: true,
      webPreferences: { partition: PARTITION, sandbox: true, contextIsolation: true, nodeIntegration: false },
    });
    let done = false;
    const finish = async () => {
      if (done) return;
      const ok = await hasLogin();
      if (!ok) return;
      done = true;
      resolve(true);
      if (!win.isDestroyed()) win.close();
    };
    win.webContents.on("did-navigate", () => void finish());
    win.webContents.on("did-navigate-in-page", () => void finish());
    win.on("closed", () => {
      if (!done) void hasLogin().then(resolve);
    });
    void win.loadURL("https://accounts.spotify.com/login?continue=https%3A%2F%2Fopen.spotify.com%2F");
  });
}

export function registerSpotifyAccount(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle("spotify:has-login", () => hasLogin());
  ipcMain.handle("spotify:login", () => login(getWindow()));
  ipcMain.handle("spotify:logout", async () => {
    await spotifySession().clearStorageData();
    return true;
  });
  ipcMain.handle(
    "spotify:fetch",
    async (_event, request: { url: string; method?: string; headers?: Record<string, string>; body?: string }) => {
      const target = new URL(request.url);
      if (target.protocol !== "https:" || !ALLOWED_HOSTS.has(target.hostname)) throw new Error("host not allowed");
      const response = await spotifySession().fetch(target.toString(), {
        method: request.method ?? "GET",
        headers: request.headers,
        body: request.body,
      });
      return { status: response.status, body: await response.text() };
    },
  );
}
