// @vitest-environment node
import { expect, it, vi } from "vitest";
import { registerYandexMusicAccount } from "./yandex-music-account";

const mock = vi.hoisted(() => ({ handle: vi.fn(), windows: [] as any[] }));

vi.mock("./ipc-guard.js", () => ({ handleTrusted: mock.handle }));
vi.mock("electron", async () => {
  const { EventEmitter } = await import("node:events");
  class BrowserWindow extends EventEmitter {
    webContents = Object.assign(new EventEmitter(), { setWindowOpenHandler: vi.fn() });
    loadURL = vi.fn(async () => {});
    isDestroyed = vi.fn(() => false);
    destroy = vi.fn(() => this.emit("closed"));
    constructor(readonly options: Record<string, unknown>) {
      super();
      mock.windows.push(this);
    }
  }
  return { BrowserWindow };
});

it("returns a token from the Yandex redirect only to the main window and supports cancellation", async () => {
  const webContents = {};
  const parent = { webContents, isDestroyed: () => false };
  registerYandexMusicAccount(() => parent as never);
  const [channel, handler] = mock.handle.mock.calls[0];
  expect(channel).toBe("yandex-music:sign-in");
  expect(handler({ sender: {} })).toEqual({ status: "failed" });
  expect(mock.windows).toHaveLength(0);

  const result = handler({ sender: webContents });
  const win = mock.windows[0];
  expect(win.options).toMatchObject({ parent, modal: true, webPreferences: { sandbox: true, nodeIntegration: false } });
  const state = new URL(win.loadURL.mock.calls[0][0]).searchParams.get("state");
  const preventDefault = vi.fn();
  const callback = { url: `https://music.yandex.ru/#state=${state}&access_token=test_token_12345`, preventDefault };

  win.webContents.emit("will-redirect", { ...callback, isMainFrame: false });
  expect(preventDefault).not.toHaveBeenCalled();
  win.webContents.emit("will-redirect", { ...callback, isMainFrame: true });
  await expect(result).resolves.toEqual({ status: "success", token: "test_token_12345" });
  expect(preventDefault).toHaveBeenCalledOnce();
  expect(win.destroy).toHaveBeenCalledOnce();

  const cancelled = handler({ sender: webContents });
  mock.windows[1].emit("closed");
  await expect(cancelled).resolves.toEqual({ status: "cancelled" });
});
