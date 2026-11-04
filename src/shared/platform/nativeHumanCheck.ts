import { registerPlugin } from "@capacitor/core";
import { appApiUserAgent } from "@/shared/api/appIdentity";
import { getApiBaseUrl } from "@/shared/api/baseUrl";

export const nativeHumanCheck = registerPlugin<{
  verify(options: { id: string; url: string; action: string; userAgent: string; title: string; cancel: string }): Promise<{ token?: string }>;
  close(options: { id: string }): Promise<void>;
}>("LaneHumanCheck");

/** Use the same browser identity as the challenge and login requests. */
export function humanCheckUserAgent(): string {
  return new URL(getApiBaseUrl()).origin === "https://api.tryliner.fun"
    ? appApiUserAgent(navigator.userAgent)
    : navigator.userAgent;
}
