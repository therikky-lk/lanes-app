// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Rectangle } from "electron";
import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userData: "",
  handlers: new Map<string, (...args: any[]) => void>(),
  workArea: { x: 0, y: 0, width: 1920, height: 1080 },
}));

vi.mock("./ipc-guard.js", () => ({
  confineToApp: vi.fn(),
  handleTrusted: vi.fn(),
  isAppUrl: vi.fn(),
  onTrusted: (channel: string, handler: (...args: any[]) => void) => {
    mocks.handlers.set(channel, handler);
  },
}));

vi.mock("electron", async () => {
  const { EventEmitter } = await import("node:events");
  class BrowserWindow extends EventEmitter {
    webContents = Object.assign(new EventEmitter(), { send: vi.fn() });
    private visible = false;
    private destroyed = false;

    constructor(private bounds: Rectangle) {
      super();
    }

    getBounds() { return this.bounds; }
    setBounds(bounds: Rectangle) {
      this.bounds = bounds;
      this.emit("move");
    }
    showInactive() { this.visible = true; }
    hide() { this.visible = false; }
    isVisible() { return this.visible; }
    isDestroyed() { return this.destroyed; }
    destroy() {
      this.destroyed = true;
      this.emit("closed");
    }
    loadURL() {}
    loadFile() {}
    setOpacity() {}
    setAlwaysOnTop() {}
  }

  const getDisplay = () => ({ workArea: mocks.workArea });
  return {
    BrowserWindow,
    app: { getPath: () => mocks.userData },
    screen: { getPrimaryDisplay: getDisplay, getDisplayMatching: getDisplay },
    globalShortcut: { unregister: vi.fn() },
    shell: {},
  };
});

import { OverlayManager } from "./overlay";

it("remembers a drag through hide, restart and settings sync, and lets a preset reset it", () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "performance"] });
  mocks.userData = mkdtempSync(join(tmpdir(), "lane-overlay-"));
  const settingsFile = join(mocks.userData, "overlay-settings.json");
  const preset = { position: "top-center", alwaysOnTop: false };
  const sync = (settings: object) => mocks.handlers.get("overlay:update-settings")?.({}, settings);
  const open = (manager: OverlayManager) => {
    manager.setAuthenticated(true);
    manager.showOverlay();
    const win = manager.getWindow()!;
    mocks.handlers.get("overlay:ready")?.({ sender: win.webContents });
    return win;
  };

  let manager = new OverlayManager("preload.cjs", "/renderer");
  try {
    sync(preset);
    const win = open(manager);
    const dragged = { ...win.getBounds(), x: 1520, y: 800 };
    win.setBounds(dragged);
    expect(JSON.parse(readFileSync(settingsFile, "utf8")).customPosition).toBeUndefined();

    manager.closeOverlay();
    vi.advanceTimersByTime(100);
    manager.showOverlay();
    expect(win.getBounds()).toEqual(dragged);
    expect(JSON.parse(readFileSync(settingsFile, "utf8")).customPosition).toEqual({ x: 1520, y: 800 });

    manager.destroy();
    manager = new OverlayManager("preload.cjs", "/renderer");
    sync(preset);
    mocks.workArea = { x: 0, y: 0, width: 1280, height: 720 };
    const reopened = open(manager);
    expect(reopened.getBounds()).toMatchObject({ x: 960, y: 664 });

    sync({ position: preset.position, resetCustomPosition: true });
    vi.advanceTimersByTime(200);
    expect(reopened.getBounds()).toMatchObject({ x: 480, y: 20 });
    expect(JSON.parse(readFileSync(settingsFile, "utf8")).customPosition).toBeUndefined();
  } finally {
    manager.destroy();
    vi.useRealTimers();
    rmSync(mocks.userData, { recursive: true, force: true });
  }
});

it("loads on demand, drops hidden windows and restores the latest playback state", () => {
  vi.useFakeTimers();
  mocks.userData = mkdtempSync(join(tmpdir(), "lane-overlay-"));
  const manager = new OverlayManager("preload.cjs", "/renderer");
  const update = (state: object) => mocks.handlers.get("overlay:update-state")?.({}, state);
  const open = () => {
    manager.showOverlay();
    const win = manager.getWindow()!;
    mocks.handlers.get("overlay:ready")?.({ sender: win.webContents });
    return win;
  };

  try {
    manager.setAuthenticated(true);
    vi.advanceTimersByTime(1000);
    expect(manager.getWindow()).toBeNull();

    update({ positionMs: 100 });
    const first = open();
    expect(first.webContents.send).toHaveBeenCalledWith("overlay:state", { positionMs: 100 });

    manager.closeOverlay();
    vi.advanceTimersByTime(100);
    update({ positionMs: 200 });
    expect(first.webContents.send).not.toHaveBeenCalledWith("overlay:state", { positionMs: 200 });

    vi.advanceTimersByTime(60_000);
    expect(open()).toBe(first);
    vi.advanceTimersByTime(120_000);
    expect(first.isDestroyed()).toBe(false);

    manager.closeOverlay();
    vi.advanceTimersByTime(121_000);
    expect(first.isDestroyed()).toBe(true);
    expect(manager.getWindow()).toBeNull();

    update({ positionMs: 300 });
    const next = open();
    expect(next).not.toBe(first);
    expect(next.webContents.send).toHaveBeenCalledWith("overlay:state", { positionMs: 300 });
    manager.setAuthenticated(false);
    expect(next.isDestroyed()).toBe(true);
  } finally {
    manager.destroy();
    vi.useRealTimers();
    rmSync(mocks.userData, { recursive: true, force: true });
  }
});

it("keeps native minimize prewarming temporary", () => {
  vi.useFakeTimers();
  mocks.userData = mkdtempSync(join(tmpdir(), "lane-overlay-"));
  const manager = new OverlayManager("preload.cjs", "/renderer");
  try {
    manager.enablePrewarm();
    vi.advanceTimersByTime(1000);
    expect(manager.getWindow()).toBeNull();

    manager.setAuthenticated(true);
    vi.advanceTimersByTime(1000);
    const warmed = manager.getWindow();
    expect(warmed?.isVisible()).toBe(false);
    vi.advanceTimersByTime(121_000);
    expect(warmed?.isDestroyed()).toBe(true);

    vi.advanceTimersByTime(1000);
    expect(manager.getWindow()).toBeNull();
  } finally {
    manager.dispose();
    vi.useRealTimers();
    rmSync(mocks.userData, { recursive: true, force: true });
  }
});
