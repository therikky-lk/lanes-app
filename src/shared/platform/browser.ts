/** Plain browsers cannot use the native YouTube transport or mint PO tokens. */
export function isBrowserRuntime(): boolean {
  if (typeof window === "undefined") return false;
  const runtime = window as Window & {
    Capacitor?: { isNativePlatform?: () => boolean };
  };
  return !runtime.linerElectron && !runtime.Capacitor?.isNativePlatform?.();
}
