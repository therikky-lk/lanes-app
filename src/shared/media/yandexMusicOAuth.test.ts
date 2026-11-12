import { expect, it } from "vitest";
import { isYandexMusicSignInUrl, readYandexMusicOAuthCallback, yandexMusicAuthorizeUrl } from "./yandexMusicOAuth";

const state = "lane-sign-in-state";
const callback = "https://music.yandex.ru/#access_token=valid_test_token&state=" + state;

it("opens Yandex OAuth and accepts the matching callback fragment", () => {
  const url = new URL(yandexMusicAuthorizeUrl(state));
  expect(url.origin + url.pathname).toBe("https://oauth.yandex.ru/authorize");
  expect(url.searchParams.get("state")).toBe(state);
  expect(url.searchParams.get("response_type")).toBe("token");
  expect(isYandexMusicSignInUrl("https://passport.yandex.ru/auth")).toBe(true);
  expect(readYandexMusicOAuthCallback(callback, state)).toEqual({ status: "success", token: "valid_test_token" });
});

it("rejects callbacks from another session, another origin or ambiguous parameters", () => {
  expect(readYandexMusicOAuthCallback(callback, "another-state")).toEqual({ status: "failed" });
  expect(readYandexMusicOAuthCallback(callback + "&state=another", state)).toEqual({ status: "failed" });
  expect(readYandexMusicOAuthCallback("https://music.yandex.ru/#error=access_denied&state=" + state, state)).toEqual({ status: "failed" });
  expect(readYandexMusicOAuthCallback(callback.replace("/#", "/?"), state)).toBeUndefined();
  expect(readYandexMusicOAuthCallback(callback.replace("music.yandex.ru", "music.yandex.ru.example.test"), state)).toBeUndefined();
  expect(isYandexMusicSignInUrl("http://oauth.yandex.ru/authorize")).toBe(false);
  expect(isYandexMusicSignInUrl("https://oauth.yandex.ru@untrusted.test")).toBe(false);
  expect(isYandexMusicSignInUrl("https://oauth.yandex.ru:8443")).toBe(false);
});
