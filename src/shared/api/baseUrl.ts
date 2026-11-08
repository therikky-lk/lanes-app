export const LANE_LINK_ORIGIN = "https://lane-app.site";
export const DEFAULT_PRIMARY_API = LANE_LINK_ORIGIN;

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
  if (clean === "https://api.tryliner.fun") return LANE_LINK_ORIGIN;
  return clean && isSecureBaseUrl(clean) ? clean : DEFAULT_PRIMARY_API;
}

const baseUrl = resolveApiBaseUrl(import.meta.env.VITE_API_URL as string | undefined);

export function getApiBaseUrl(): string {
  return baseUrl;
}
