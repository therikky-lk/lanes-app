import { handleTrusted, onTrusted } from "./ipc-guard.js";
import { BrowserWindow, TouchBar } from "electron";
import type { TouchBarStatePayload } from "../src/features/touchbar/contracts.js";

export interface TouchBarAction {
  type:
    | "togglePlay"
    | "play"
    | "pause"
    | "next"
    | "prev"
    | "seek"
    | "like"
    | "volume"
    | "adjustOffset"
    | "navigate"
    | "toggleShuffle"
    | "toggleFullscreen"
    | "restoreMainWindow";
  payload?: any;
}

export class TouchBarManager {
  private mainWindow: BrowserWindow | null = null;
  private latestState: TouchBarStatePayload | null = null;

  private nativeTouchBar: any = null;
  private nativePlayBtn: any = null;
  private nativeTrackLabel: any = null;
  private nativeLyricsLabel: any = null;

  constructor(_preloadPath?: string, _rendererDist?: string) {
    this.registerIpcHandlers();
  }

  public setMainWindow(win: BrowserWindow | null) {
    this.mainWindow = win;
    if (this.mainWindow && process.platform === "darwin") {
      this.initNativeTouchBar();
    }
  }

  private initNativeTouchBar() {
    if (!TouchBar) return;
    const { TouchBarButton, TouchBarLabel, TouchBarSpacer } = TouchBar;

    this.nativePlayBtn = new TouchBarButton({
      label: "▶",
      click: () => {
        this.forwardAction({ type: "togglePlay" });
      },
    });

    const prevBtn = new TouchBarButton({
      label: "⏮",
      click: () => {
        this.forwardAction({ type: "prev" });
      },
    });

    const nextBtn = new TouchBarButton({
      label: "⏭",
      click: () => {
        this.forwardAction({ type: "next" });
      },
    });

    this.nativeTrackLabel = new TouchBarLabel({
      label: "Lane",
    });

    this.nativeLyricsLabel = new TouchBarLabel({
      label: "",
    });

    this.nativeTouchBar = new TouchBar({
      items: [
        this.nativeTrackLabel,
        new TouchBarSpacer({ size: "small" }),
        prevBtn,
        this.nativePlayBtn,
        nextBtn,
        new TouchBarSpacer({ size: "flexible" }),
        this.nativeLyricsLabel,
      ],
    });

    if (this.latestState) this.updateNativeLabels(this.latestState);
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.setTouchBar(this.nativeTouchBar);
    }
  }

  private updateNativeLabels(state: TouchBarStatePayload) {
    const play = state.status === "playing" ? "⏸" : "▶";
    const track = state.track ? `${state.track.title} - ${state.track.artist}` : "Lane";
    const lyrics = state.activeLyricText || "";
    if (this.nativePlayBtn.label !== play) this.nativePlayBtn.label = play;
    if (this.nativeTrackLabel.label !== track) this.nativeTrackLabel.label = track;
    if (this.nativeLyricsLabel.label !== lyrics) this.nativeLyricsLabel.label = lyrics;
  }

  private registerIpcHandlers() {
    onTrusted("touchbar:update-state", (_event, state: TouchBarStatePayload) => {
      this.latestState = state;

      if (process.platform === "darwin" && this.nativeTouchBar) {
        this.updateNativeLabels(state);
      }
    });

    onTrusted("touchbar:send-action", (_event, action: TouchBarAction) => {
      if (action.type === "restoreMainWindow") {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          if (this.mainWindow.isMinimized()) {
            this.mainWindow.restore();
          }
          this.mainWindow.show();
          this.mainWindow.focus();
        }
        return;
      }
      this.forwardAction(action);
    });

    handleTrusted("touchbar:get-initial-state", () => {
      return this.latestState;
    });

    handleTrusted("touchbar:toggle-simulator", () => {
      return false;
    });

    handleTrusted("touchbar:is-simulator-open", () => {
      return false;
    });

    onTrusted("touchbar:close-simulator", () => {});
    onTrusted("touchbar:update-settings", () => {});
  }

  public registerShortcut() {
    // Simulator shortcuts removed
  }

  public unregisterShortcut() {
    // Simulator shortcuts removed
  }

  private forwardAction(action: TouchBarAction) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send("touchbar:action", action);
    }
  }
}
