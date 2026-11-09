export const LANE_LINK_ORIGIN = "https://lane-app.site";
export const DEFAULT_PRIMARY_API = LANE_LINK_ORIGIN;
export const DEFAULT_NEW_ACCOUNT_API = "https://lane-account-api.nidenseekn.workers.dev";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function isSecureBaseUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === "https:" || (protocol === "http:" && LOOPBACK_HOSTS.has(hostname));
  } catch {
    return false;
  }
}

export function resolveApiBaseUrl(envUrl: string | undefined): string {
  const clean = envUrl?.trim().replace(/\/+$/, "");
  if (clean === "https://api.tryliner.fun") return LANE_LINK_ORIGIN;
  return clean && isSecureBaseUrl(clean) ? clean : DEFAULT_PRIMARY_API;
}

const baseUrl = resolveApiBaseUrl(import.meta.env.VITE_API_URL as string | undefined);
const configuredNewAccountUrl = (import.meta.env.VITE_NEW_ACCOUNT_API_URL as string | undefined)?.trim().replace(/\/+$/, "") || DEFAULT_NEW_ACCOUNT_API;
const newAccountBaseUrl = configuredNewAccountUrl && isSecureBaseUrl(configuredNewAccountUrl)
  ? configuredNewAccountUrl
  : "";

export function getApiBaseUrl(): string {
  return baseUrl;
}

export function getNewAccountApiBaseUrl(): string {
  return newAccountBaseUrl;
}

export function getApiBaseUrlForAuthBackend(backend: unknown): string {
  return backend === "hyprr" ? getNewAccountApiBaseUrl() : getApiBaseUrl();
}
