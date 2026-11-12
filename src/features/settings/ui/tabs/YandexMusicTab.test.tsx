import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { YandexMusicTab } from "./YandexMusicTab";

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  status: vi.fn(),
  write: vi.fn(),
  signIn: vi.fn(),
  importMusic: vi.fn(),
}));

vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/languages", () => ({ useTranslation: () => ({ t: (key: string) => key, locale: "en" }) }));
vi.mock("@/shared/ui", () => ({ ToggleSwitch: () => null, useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/shared/ui/YandexMusicIcon", () => ({ default: () => null }));
vi.mock("../controls", () => ({ SettingSection: () => null, SettingRow: () => null }));
vi.mock("@/features/library/store/modalStore", () => ({ useModalStore: {} }));
vi.mock("@/shared/media/matching", () => ({ isRateLimit: () => false }));
vi.mock("@/shared/platform/browser", () => ({ isBrowserRuntime: () => false }));
vi.mock("@/shared/api/integrationSessions", () => ({
  integrationOwner: () => "liner:lane-user",
  readIntegration: mocks.read,
  readYandexConnection: mocks.status,
  writeIntegration: mocks.write,
  IntegrationSessionError: class extends Error {},
}));
vi.mock("@/features/library/services/import/sources/yandexMusic/yandexMusicAccount", () => ({
  signInToYandexMusic: mocks.signIn,
}));
vi.mock("@/features/library/services/import/sources/yandexMusic/yandexMusicImport", () => ({
  importYandexMusic: mocks.importMusic,
  YandexImportError: class extends Error {},
}));

it("connects without importing and cancels a manually started import", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const session = { accessToken: "test-token" };
  let connected = false;
  mocks.read.mockImplementation(async () => ({ revision: Number(connected), session: connected ? session : null }));
  mocks.status.mockImplementation(async () => ({ connected }));
  mocks.signIn.mockResolvedValue({ status: "success", token: session.accessToken });
  mocks.write.mockImplementation(async () => {
    connected = true;
    return { revision: 1 };
  });
  mocks.importMusic.mockImplementation((_token, _title, _likes, _progress, signal: AbortSignal) =>
    new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true })),
  );

  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const button = (key: string) => Array.from(container.querySelectorAll("button")).find(node => node.textContent?.trim() === key);
  try {
    await act(async () => root.render(<YandexMusicTab />));
    await act(async () => button("settings.youtube.sign_in")!.click());
    expect(mocks.write).toHaveBeenCalledWith("yandex", "liner:lane-user", { revision: 0, session });
    expect(mocks.importMusic).not.toHaveBeenCalled();

    await act(async () => button("common.import")!.click());
    const signal = mocks.importMusic.mock.calls[0][4] as AbortSignal;
    expect(signal.aborted).toBe(false);
    await act(async () => button("common.cancel")!.click());
    expect(signal.aborted).toBe(true);
    expect(button("common.cancel")).toBeUndefined();
    expect(button("common.import")?.disabled).toBe(false);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
