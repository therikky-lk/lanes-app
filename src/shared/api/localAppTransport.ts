import { Capacitor } from "@capacitor/core";
import { getApiBaseUrl } from "./baseUrl";

/** Only the local preview needs the desktop HTTP bridge. */
export function usesLocalAppTransport(): boolean {
  return import.meta.env.DEV && typeof window !== "undefined" && !window.linerElectron &&
    !Capacitor.isNativePlatform() && getApiBaseUrl() === "https://api.tryliner.fun";
}
