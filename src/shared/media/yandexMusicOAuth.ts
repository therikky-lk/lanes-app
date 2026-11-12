// This public client ID uses the Yandex Music web OAuth callback. No OAuth
// client secret is needed for this provider's browser flow.
const CLIENT_ID = "23cabbbdc6cd418abb4b39c32c41195d";
const CALLBACK_ORIGIN = "https://music.yandex.ru";
const AUTH_HOSTS = new Set([
  "oauth.yandex.ru", "passport.yandex.ru", "id.yandex.ru", "music.yandex.ru",
  "oauth.yandex.com", "passport.yandex.com", "id.yandex.com",
  "smartcaptcha.yandexcloud.net",
]);

export type YandexMusicSignInResult =
  | { status: "success"; token: string }
  | { status: "cancelled" | "failed" };

function parseUrl(rawUrl: string): URL | undefined {
  try { return new URL(rawUrl); } catch { return undefined; }
}

export function yandexMusicAuthorizeUrl(state: string): string {
  const url = new URL("https://oauth.yandex.ru/authorize");
  url.search = new URLSearchParams({
    response_type: "token", client_id: CLIENT_ID, state, force_confirm: "yes",
  }).toString();
  return url.href;
}

export function isYandexMusicSignInUrl(rawUrl: string): boolean {
  const url = parseUrl(rawUrl);
  return Boolean(url && url.protocol === "https:" && !url.username && !url.password && !url.port && AUTH_HOSTS.has(url.hostname));
}

export function readYandexMusicOAuthCallback(rawUrl: string, state: string): YandexMusicSignInResult | undefined {
  const url = parseUrl(rawUrl);
  if (!url || url.origin !== CALLBACK_ORIGIN || url.pathname !== "/" || url.username || url.password) return;
  const fragment = new URLSearchParams(url.hash.slice(1));
  if (!fragment.has("access_token") && !fragment.has("error")) return;
  if (!state || fragment.getAll("state").length !== 1 || fragment.get("state") !== state
    || fragment.getAll("access_token").length !== 1 || fragment.has("error")) return { status: "failed" };
  const token = fragment.get("access_token") ?? "";
  return isYandexMusicToken(token) ? { status: "success", token } : { status: "failed" };
}

export function isYandexMusicToken(token: string): boolean {
  return /^[a-z\d._~+/-]{8,2048}={0,2}$/i.test(token);
}
