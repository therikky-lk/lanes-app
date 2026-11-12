import { expect, test, vi } from "vitest";
import { getYoutubePageId, isYoutubeSignedIn, syncYoutubeAuthState } from "./youtubeAuthSession";

const state = vi.hoisted(() => ({
  id: "lane-user",
  read: vi.fn(),
  write: vi.fn(),
}));

vi.mock("@/shared/api/auth-session", () => ({
  getAuthSession: () => ({ user: { id: state.id }, authBackend: "hyprr" }),
}));

vi.mock("@/shared/api/integrationSessions", () => ({
  integrationOwner: () => `hyprr:${state.id}`,
  readIntegration: state.read,
  writeIntegration: state.write,
  IntegrationSessionError: Error,
}));

const youtube = {
  accessToken: "access-token", refreshToken: "refresh-token",
  tokenType: "Bearer", expiresAt: Number.MAX_SAFE_INTEGER, pageId: "12345",
};

test("restores the connected YouTube channel and clears it on a remote sign-out", async () => {
  state.read.mockResolvedValueOnce({ revision: 1, session: youtube });
  await syncYoutubeAuthState();
  expect(isYoutubeSignedIn()).toBe(true);
  expect(getYoutubePageId()).toBe("12345");

  state.read.mockResolvedValueOnce({ revision: 2, session: null });
  await syncYoutubeAuthState();
  expect(isYoutubeSignedIn()).toBe(false);
  expect(getYoutubePageId()).toBeNull();
  expect(state.write).not.toHaveBeenCalled();
});

test("does not apply an in-flight connection to a different Lane account", async () => {
  state.id = "first-user";
  let respond: (value: unknown) => void = () => {};
  state.read.mockReturnValueOnce(new Promise(resolve => { respond = resolve; }));
  const pending = syncYoutubeAuthState();

  state.id = "second-user";
  state.read.mockResolvedValueOnce({ revision: 0, session: null });
  await syncYoutubeAuthState();
  respond({ revision: 1, session: youtube });
  await pending;
  expect(isYoutubeSignedIn()).toBe(false);
  expect(getYoutubePageId()).toBeNull();
});
