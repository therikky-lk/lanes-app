import { beforeEach, describe, expect, it, vi } from "vitest";

const electronMock = vi.hoisted(() => ({
  app: {
    getAppPath: vi.fn(() => "/app/resources/app.asar"),
    getPath: vi.fn(() => "/user-data"),
  },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  shell: { openExternal: vi.fn() },
}));
vi.mock("electron", () => electronMock);

import { confineToApp, isAppUrl, isSafeExternalUrl, isTrustedSender } from "./ipc-guard";

beforeEach(() => {
  vi.stubEnv("VITE_DEV_SERVER_URL", "");
  electronMock.ipcMain.handle.mockReset();
  electronMock.ipcMain.on.mockReset();
});

describe("Electron app URL policy", () => {
  it("trusts only app renderer and installed bundle files", () => {
    expect(isAppUrl("file:///app/resources/app.asar/dist/index.html", "", ["/app/resources/app.asar/dist", "/user-data/bundles"])).toBe(true);
    expect(isAppUrl("file:///user-data/bundles/active/index.html", "", ["/app/resources/app.asar/dist", "/user-data/bundles"])).toBe(true);
    expect(isAppUrl("file:///etc/passwd", "", ["/app/resources/app.asar/dist", "/user-data/bundles"])).toBe(false);
    expect(isAppUrl("file:///app/resources/app.asar/dist-evil/index.html", "", ["/app/resources/app.asar/dist"])).toBe(false);
  });

  it("trusts only the configured dev origin", () => {
    expect(isAppUrl("http://localhost:5173/#/", "http://localhost:5173")).toBe(true);
    expect(isAppUrl("http://localhost:5174/", "http://localhost:5173")).toBe(false);
    expect(isAppUrl("https://attacker.example/", "http://localhost:5173")).toBe(false);
  });

  it("rejects IPC from non-main or untrusted frames", () => {
    const mainFrame = { url: "file:///app/resources/app.asar/dist/index.html" };
    const sender = { mainFrame };
    expect(isTrustedSender({ senderFrame: mainFrame, sender } as never)).toBe(true);
    expect(isTrustedSender({ senderFrame: { url: "file:///etc/passwd" }, sender } as never)).toBe(false);
    expect(isTrustedSender({ senderFrame: null, sender } as never)).toBe(false);
    expect(isTrustedSender({ senderFrame: { url: mainFrame.url }, sender: { mainFrame: {} } } as never)).toBe(false);
  });

  it("wraps invoke and event handlers with the trusted sender check", async () => {
    const { handleTrusted, onTrusted } = await import("./ipc-guard");
    const handler = vi.fn(() => "ok");
    handleTrusted("example:invoke", handler);
    const invoke = electronMock.ipcMain.handle.mock.calls[0][1] as Function;
    const trustedFrame = { url: "file:///app/resources/app.asar/dist/index.html" };
    const trustedEvent = { senderFrame: trustedFrame, sender: { mainFrame: trustedFrame } };
    expect(invoke(trustedEvent)).toBe("ok");
    expect(handler).toHaveBeenCalledOnce();
    expect(() => invoke({ senderFrame: { url: "https://attacker.example" }, sender: { mainFrame: {} } })).toThrow("untrusted sender");

    const listener = vi.fn();
    onTrusted("example:event", listener);
    const on = electronMock.ipcMain.on.mock.calls[0][1] as Function;
    const untrustedEvent = { senderFrame: null, sender: { mainFrame: {} }, returnValue: undefined };
    on(untrustedEvent);
    expect(listener).not.toHaveBeenCalled();
    expect(untrustedEvent.returnValue).toBeNull();
  });

  it("opens only valid HTTP(S) URLs and blocks navigation outside the app", () => {
    expect(isSafeExternalUrl("https://example.com/path")).toBe(true);
    expect(isSafeExternalUrl("javascript:alert(1)")).toBe(false);
    const listeners: Record<string, Function> = {};
    const contents = {
      setWindowOpenHandler: vi.fn(),
      on: vi.fn((name: string, listener: Function) => { listeners[name] = listener; }),
    };
    const openExternal = vi.fn();
    confineToApp(contents as never, openExternal, (url) => url.startsWith("file:///app/"));
    const event = { preventDefault: vi.fn() };
    listeners["will-navigate"](event, "https://example.com/");
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(openExternal).toHaveBeenCalledWith("https://example.com/");
    expect(contents.setWindowOpenHandler).toHaveBeenCalledOnce();
  });
});
