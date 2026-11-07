export const DEFAULT_PRIMARY_API = "https://api.tryliner.fun";
export const LANE_LINK_ORIGIN = "https://lane-app.site";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const HTTP_API_HOST = "lucid-1.ru-west.hyprr.space";
const HTTP_API_PORT = "10262";

export function isSecureBaseUrl(url: string): boolean {
  try {
    const { protocol, hostname, port } = new URL(url);
    return protocol === "https:" || (protocol === "http:" && (LOOPBACK_HOSTS.has(hostname) || (hostname === HTTP_API_HOST && port === HTTP_API_PORT)));
  } catch {
    return false;
  }
}

export function resolveApiBaseUrl(envUrl: string | undefined): string {
  const clean = envUrl?.trim().replace(/\/+$/, "");
  if (clean === LANE_LINK_ORIGIN) return DEFAULT_PRIMARY_API;
  return clean && isSecureBaseUrl(clean) ? clean : DEFAULT_PRIMARY_API;
}

const baseUrl = resolveApiBaseUrl(import.meta.env.VITE_API_URL as string | undefined);

export function getApiBaseUrl(): string {
  return baseUrl;
}
