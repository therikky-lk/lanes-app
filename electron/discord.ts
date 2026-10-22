import { Client, StatusDisplayType, type SetActivity } from "@xhayper/discord-rpc";
import { ipcMain } from "electron";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Directories where a Discord-compatible client may expose its RPC socket on
 * Linux/macOS. The stock library only knows a handful of them and ignores the
 * /run/user/<uid> fallback, so on Fedora (Flatpak Discord, Vesktop, Equibop,
 * Legcord, snaps, sessions without XDG_RUNTIME_DIR) it often finds nothing.
 */
export function discordSocketDirs(env: NodeJS.ProcessEnv = process.env): string[] {
  const bases = new Set<string>();
  const add = (p: string | undefined) => {
    if (!p) return;
    try {
      bases.add(fs.realpathSync(p));
    } catch {
      /* dir does not exist */
    }
  };
  add(env.XDG_RUNTIME_DIR);
  if (typeof process.getuid === "function") add(`/run/user/${process.getuid()}`);
  add(env.TMPDIR);
  add(env.TMP);
  add(env.TEMP);
  add(os.tmpdir());
  add("/tmp");

  const dirs: string[] = [];
  for (const base of bases) {
    dirs.push(base);
    // snaps: snap.discord, snap.discord-canary, snap.vesktop, ...
    // flatpaks: app/<app-id> (com.discordapp.Discord, dev.vencord.Vesktop,
    // io.github.equicord.equibop, app.legcord.Legcord, ...)
    try {
      for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
        if (entry.isDirectory() && entry.name.startsWith("snap.")) dirs.push(path.join(base, entry.name));
      }
    } catch {}
    try {
      const appDir = path.join(base, "app");
      for (const entry of fs.readdirSync(appDir, { withFileTypes: true })) {
        if (entry.isDirectory()) dirs.push(path.join(appDir, entry.name));
      }
    } catch {}
  }
  return dirs;
}

/** Existing discord-ipc-N sockets, best candidates first. */
export function findDiscordSockets(env: NodeJS.ProcessEnv = process.env): string[] {
  if (process.platform === "win32") return [];
  const found: string[] = [];
  for (const dir of discordSocketDirs(env)) {
    for (let i = 0; i < 10; i++) {
      const p = path.join(dir, `discord-ipc-${i}`);
      try {
        if (fs.statSync(p).isSocket() && !found.includes(p)) found.push(p);
      } catch {}
    }
  }
  return found;
}

export type DiscordStatusDisplayType =
  | "artist"
  | "title"
  | "artist_title"
  | "title_artist"
  | "app";

export interface DiscordRpcSettings {
  enabled: boolean;
  statusDisplayType: DiscordStatusDisplayType;
  showArtwork: boolean;
  showArtistSmallImage: boolean;
  showTime: boolean;
  showPaused: boolean;
  showButton: boolean;
  showDownloadButton: boolean;
}

export interface DiscordRpcTrackInfo {
  id: string;
  title: string;
  artist: string;
  artistId?: string;
  album?: string;
  coverUrl?: string;
  durationMs: number;
}

export interface DiscordRpcStatePayload {
  status: "playing" | "paused" | "loading" | "buffering" | "idle" | "error";
  track: DiscordRpcTrackInfo | null;
  positionMs: number;
  durationMs: number;
  artistImageUrl?: string;
}

export const LINER_DISCORD_APPLICATION_ID = "1561339119617974362";

function builtInApplicationId(): string {
  return process.env.LINER_DISCORD_CLIENT_ID?.trim() || LINER_DISCORD_APPLICATION_ID;
}

const DEFAULT_SETTINGS: DiscordRpcSettings = {
  enabled: true,
  statusDisplayType: "artist",
  showArtwork: true,
  showArtistSmallImage: true,
  showTime: true,
  showPaused: true,
  showButton: true,
  showDownloadButton: true,
};

const RECONNECT_INTERVAL_MS = 5_000;
const CONNECT_TIMEOUT_MS = 20_000;
const SYNC_DEBOUNCE_MS = 1_000;
const MIN_SYNC_INTERVAL_MS = 4_000;
const MAX_IMAGE_URL_LENGTH = 256;

export function toDiscordImageUrl(url: string | undefined): string | undefined {
  if (!url || url.length > MAX_IMAGE_URL_LENGTH) return undefined;
  try {
    return new URL(url).protocol === "https:" ? url : undefined;
  } catch {
    return undefined;
  }
}

function sanitizeText(text: string | undefined | null, maxLen = 128): string | undefined {
  if (!text) return undefined;
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  if (trimmed.length === 1) return trimmed + " ";
  return trimmed.slice(0, maxLen);
}

export class DiscordRpcManager {
  private client: Client | null = null;
  private settings: DiscordRpcSettings = { ...DEFAULT_SETTINGS };
  private latestPayload: DiscordRpcStatePayload | null = null;
  private latestPayloadReceivedAt = 0;
  private isConnecting = false;
  private isConnected = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private syncTimer: NodeJS.Timeout | null = null;
  private lastSyncAt = 0;
  private isDestroyed = false;
  private connectWatchdog: NodeJS.Timeout | null = null;
  private lastError: string | undefined;

  constructor() {
    this.registerIpcHandlers();
    this.connect();
  }

  private registerIpcHandlers(): void {
    ipcMain.on("discord:update-state", (_event, payload: DiscordRpcStatePayload) => {
      this.updateState(payload);
    });

    ipcMain.on("discord:update-settings", (_event, patch: Partial<DiscordRpcSettings>) => {
      this.updateSettings(patch);
    });

    ipcMain.handle("discord:get-status", () => {
      return {
        connected: this.isConnected,
        username: this.client?.user?.username,
        error: this.isConnected ? undefined : this.lastError,
      };
    });
  }

  private scheduleSync(): void {
    if (this.syncTimer) clearTimeout(this.syncTimer);
    const wait = Math.max(SYNC_DEBOUNCE_MS, MIN_SYNC_INTERVAL_MS - (Date.now() - this.lastSyncAt));
    this.syncTimer = setTimeout(() => {
      this.syncTimer = null;
      this.lastSyncAt = Date.now();
      void this.syncActivity();
    }, wait);
  }

  private clearSyncTimer(): void {
    if (this.syncTimer) clearTimeout(this.syncTimer);
    this.syncTimer = null;
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.isDestroyed || !this.settings.enabled || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.isConnected && !this.isConnecting && this.settings.enabled) {
        this.connect();
      }
    }, RECONNECT_INTERVAL_MS);
  }

  private connect(): void {
    if (this.isDestroyed || !this.settings.enabled || this.isConnecting || this.isConnected) {
      return;
    }

    const clientId = builtInApplicationId();
    if (!clientId) return;
    this.isConnecting = true;

    try {
      if (this.client) {
        try {
          void Promise.resolve(this.client.destroy()).catch(() => {});
        } catch {}
        this.client = null;
      }

      let transport: { type: "ipc"; pathList: Array<{ platform: NodeJS.Platform[]; format: (id: number) => string }> } | undefined;
      if (process.platform !== "win32") {
        const dirs = discordSocketDirs();
        transport = {
          type: "ipc",
          pathList: dirs.map((dir) => ({
            platform: [process.platform],
            format: (id: number) => path.join(dir, `discord-ipc-${id}`),
          })),
        };
      }

      const client = new Client({ clientId, transport: transport as any });
      this.client = client;
      if (process.env.LINER_DISCORD_DEBUG) client.on("debug", (...a: unknown[]) => console.log("[discord-rpc]", ...a));

      // never let a stuck handshake block reconnects forever
      if (this.connectWatchdog) clearTimeout(this.connectWatchdog);
      this.connectWatchdog = setTimeout(() => {
        this.connectWatchdog = null;
        if (this.client !== client || this.isConnected) return;
        this.isConnecting = false;
        try {
          void Promise.resolve(client.destroy()).catch(() => {});
        } catch {}
        if (this.client === client) this.client = null;
        this.scheduleReconnect();
      }, CONNECT_TIMEOUT_MS);

      client.on("ready", () => {
        if (this.client !== client || this.isDestroyed) return;
        if (this.connectWatchdog) clearTimeout(this.connectWatchdog);
        this.connectWatchdog = null;
        this.isConnecting = false;
        this.isConnected = true;
        this.lastError = undefined;
        this.clearReconnectTimer();
        // a late EPIPE/ECONNRESET on the raw socket must not crash the main process
        const sock = (client as any).transport?.socket as import("node:net").Socket | undefined;
        sock?.on("error", (err) => {
          this.lastError = String(err?.message ?? err);
        });
        // When Discord quits, the library never emits "disconnected" (its close()
        // bails out because the socket is no longer open), so presence would stay
        // dead until the player restarts. Handle the raw socket close ourselves.
        sock?.once("close", () => {
          if (this.client !== client || this.isDestroyed) return;
          this.isConnected = false;
          this.isConnecting = false;
          this.lastError = "Discord closed the connection";
          try {
            void Promise.resolve(client.destroy()).catch(() => {});
          } catch {}
          this.client = null;
          this.scheduleReconnect();
        });

        // Push latest state if available
        if (this.latestPayload) {
          this.scheduleSync();
        }
      });

      client.on("disconnected", () => {
        if (this.client !== client) return;
        this.isConnecting = false;
        this.isConnected = false;
        this.scheduleReconnect();
      });

      client.login().catch((err) => {
        if (this.client !== client) return;
        this.lastError = String(err?.message ?? err);
        this.isConnecting = false;
        this.isConnected = false;
        this.scheduleReconnect();
      });
    } catch (err) {
      this.lastError = String((err as any)?.message ?? err);
      if (process.env.LINER_DISCORD_DEBUG) console.log("[discord-rpc] connect failed", err);
      this.isConnecting = false;
      this.isConnected = false;
      this.scheduleReconnect();
    }
  }

  public updateSettings(patch: Partial<DiscordRpcSettings>): void {
    if (!patch || typeof patch !== "object") return;

    const validatedPatch: Partial<DiscordRpcSettings> = {};

    const booleanFields: (keyof DiscordRpcSettings)[] = [
      "enabled",
      "showArtwork",
      "showArtistSmallImage",
      "showTime",
      "showPaused",
      "showButton",
      "showDownloadButton",
    ];
    for (const key of booleanFields) {
      if (typeof patch[key] === "boolean") {
        (validatedPatch as any)[key] = patch[key];
      }
    }

    const validStatusTypes: DiscordStatusDisplayType[] = [
      "artist",
      "title",
      "artist_title",
      "title_artist",
      "app",
    ];
    if (patch.statusDisplayType && validStatusTypes.includes(patch.statusDisplayType)) {
      validatedPatch.statusDisplayType = patch.statusDisplayType;
    }

    const oldEnabled = this.settings.enabled;

    this.settings = { ...this.settings, ...validatedPatch };

    // If enabled state toggled
    if (this.settings.enabled !== oldEnabled) {
      if (this.settings.enabled) {
        this.connect();
      } else {
        this.clearReconnectTimer();
        this.clearSyncTimer();
        this.clearActivity();
        try {
          if (this.client) void Promise.resolve(this.client.destroy()).catch(() => {});
        } catch {}
        this.client = null;
        this.isConnected = false;
        this.isConnecting = false;
      }
      return;
    }

    // If flags like showTime, showArtwork changed, refresh current activity
    if (this.isConnected && this.latestPayload) {
      this.scheduleSync();
    }
  }

  public updateState(payload: DiscordRpcStatePayload): void {
    this.latestPayload = payload;
    this.latestPayloadReceivedAt = Date.now();

    if (!this.settings.enabled) {
      return;
    }

    if (!this.isConnected && !this.isConnecting) {
      this.connect();
      return;
    }

    if (this.isConnected) {
      this.scheduleSync();
    }
  }

  private async syncActivity(): Promise<void> {
    if (!this.isConnected || !this.client?.user || !this.settings.enabled) {
      return;
    }

    const payload = this.latestPayload;
    if (!payload || !payload.track || payload.status === "idle" || payload.status === "error") {
      this.clearActivity();
      return;
    }

    const isPlaying = payload.status === "playing";
    const isPaused = payload.status === "paused";

    if (isPaused && !this.settings.showPaused) {
      this.clearActivity();
      return;
    }

    try {
      const track = payload.track;
      const title = sanitizeText(track.title) || "Unknown Title";
      const artist = sanitizeText(track.artist) || "Unknown Artist";

      const dur = Math.max(0, payload.durationMs || track.durationMs || 0);

      let activityName = "Lane";
      let detailsText = title;
      let stateText = isPaused ? `${artist} (Paused)` : artist;
      let rpcStatusDisplayType = StatusDisplayType.STATE; // 1 -> "Listening to [Artist]"

      switch (this.settings.statusDisplayType) {
        case "title":
          activityName = title;
          rpcStatusDisplayType = StatusDisplayType.DETAILS; // 2 -> "Listening to [Title]"
          detailsText = isPaused ? `${title} (Paused)` : title;
          stateText = artist;
          break;
        case "app":
          activityName = "Lane";
          rpcStatusDisplayType = StatusDisplayType.NAME; // 0 -> "Listening to Lane"
          detailsText = title;
          stateText = isPaused ? `${artist} (Paused)` : artist;
          break;
        case "artist_title":
          activityName = `${artist} - ${title}`;
          rpcStatusDisplayType = StatusDisplayType.STATE; // 1 -> "Listening to [Artist - Title]"
          detailsText = title;
          stateText = isPaused ? `${artist} - ${title} (Paused)` : `${artist} - ${title}`;
          break;
        case "title_artist":
          activityName = `${title} - ${artist}`;
          rpcStatusDisplayType = StatusDisplayType.DETAILS; // 2 -> "Listening to [Title - Artist]"
          detailsText = isPaused ? `${title} - ${artist} (Paused)` : `${title} - ${artist}`;
          stateText = artist;
          break;
        case "artist":
        default:
          activityName = artist;
          rpcStatusDisplayType = StatusDisplayType.STATE; // 1 -> "Listening to [Artist]"
          detailsText = title;
          stateText = isPaused ? `${artist} (Paused)` : artist;
          break;
      }

      const activity: SetActivity & { status_display_type?: number } = {
        name: sanitizeText(activityName) || "Lane",
        type: 2, // 2 = ActivityType.Listening -> renders "Listening to" + live progress bar
        details: sanitizeText(detailsText),
        state: sanitizeText(stateText),
        statusDisplayType: rpcStatusDisplayType,
        status_display_type: rpcStatusDisplayType,
      };

      // Timestamps (media timeline / live progress bar like Spotify)
      if (isPlaying && this.settings.showTime && dur > 0) {
        const now = Date.now();
        const elapsedSincePayload = Math.max(0, now - (this.latestPayloadReceivedAt || now));
        const currentPos = Math.min(dur, Math.max(0, (payload.positionMs || 0) + elapsedSincePayload));
        activity.startTimestamp = new Date(now - currentPos);
        activity.endTimestamp = new Date(now - currentPos + dur);
      }

      // Large artwork (Album/Track cover)
      const coverImage = toDiscordImageUrl(track.coverUrl);
      if (this.settings.showArtwork && coverImage) {
        activity.largeImageKey = coverImage;
        activity.largeImageText = sanitizeText(track.album || track.title) || "Lane";
      }

      // Small artwork (Artist photo badge)
      const artistImage = toDiscordImageUrl(payload.artistImageUrl);
      if (this.settings.showArtistSmallImage && artistImage) {
        activity.smallImageKey = artistImage;
        activity.smallImageText = sanitizeText(track.artist) || "Artist";
      }

      // Action buttons linking to song or tryliner.fun (Discord allows up to 2 buttons)
      const buttons: Array<{ label: string; url: string }> = [];

      if (this.settings.showButton && track.id) {
        buttons.push({
          label: "Listen on Lane",
          url: `https://link.tryliner.fun/track?id=${encodeURIComponent(track.id)}`,
        });
      }

      if (this.settings.showDownloadButton) {
        buttons.push({
          label: "Download Lane",
          url: "https://tryliner.fun",
        });
      }

      if (buttons.length > 0) {
        activity.buttons = buttons;
      }

      await this.client.user.setActivity(activity);
    } catch (err) {
      this.lastError = String((err as any)?.message ?? err);
      // Activity update dropped or rate-limited; gracefully ignored
    }
  }

  private clearActivity(): void {
    if (this.isConnected && this.client?.user) {
      try {
        void this.client.user.clearActivity().catch(() => {});
      } catch {}
    }
  }

  public destroy(): void {
    this.isDestroyed = true;
    if (this.connectWatchdog) clearTimeout(this.connectWatchdog);
    this.connectWatchdog = null;
    this.clearReconnectTimer();
    this.clearSyncTimer();
    this.clearActivity();
    try {
      if (this.client) void Promise.resolve(this.client.destroy()).catch(() => {});
    } catch {}
    this.client = null;
    this.isConnected = false;
    this.isConnecting = false;
  }
}
