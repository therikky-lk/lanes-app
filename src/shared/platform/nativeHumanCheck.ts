import { registerPlugin } from "@capacitor/core";

export const nativeHumanCheck = registerPlugin<{
  verify(options: { id: string; url: string; action: string; userAgent: string; title: string; cancel: string }): Promise<{ token?: string }>;
  close(options: { id: string }): Promise<void>;
}>("LaneHumanCheck");

/**
 * Turnstile runs in Android System WebView and must see its real browser
 * identity. API requests keep the app-specific UA in native.ts; adding an
 * Electron suffix to WebView itself makes Cloudflare reject the widget.
 */
export function humanCheckUserAgent(): string {
  return navigator.userAgent;
}
