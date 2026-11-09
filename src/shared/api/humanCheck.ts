import { getApiBaseUrl, LANE_LINK_ORIGIN } from "./baseUrl";

export type HumanCheckAction = "login" | "register";
export type HumanCheckMode = "off" | "optional" | "required";

export interface HumanCheckRequest {
  action: HumanCheckAction;
  mode: Exclude<HumanCheckMode, "off">;
  apiBaseUrl?: string;
}

export type HumanCheckPrompt = (request: HumanCheckRequest) => Promise<string | null>;

export class HumanCheckCancelledError extends Error {
  constructor() {
    super("The human check was closed.");
    this.name = "HumanCheckCancelledError";
  }
}

let prompt: HumanCheckPrompt | null = null;

// Turnstile's hostname allowlist is configured on the account service's
// original hostname. lane-app.site proxies the API, but Turnstile still sees
// lane-app.site as the browser hostname and rejects its sitekey (110200).
function humanCheckBaseUrl(apiBaseUrl = getApiBaseUrl()): string {
  return apiBaseUrl === LANE_LINK_ORIGIN ? "https://api.tryliner.fun" : apiBaseUrl;
}

export function setHumanCheckPrompt(next: HumanCheckPrompt | null): void {
  prompt = next;
}

export function humanCheckPageUrl(action: HumanCheckAction, apiBaseUrl = getApiBaseUrl()): string {
  return `${humanCheckBaseUrl(apiBaseUrl)}/v1/auth/verify?action=${action}`;
}

export function humanCheckOrigin(apiBaseUrl = getApiBaseUrl()): string {
  return new URL(humanCheckBaseUrl(apiBaseUrl)).origin;
}

export function isHumanCheckMode(value: unknown): value is HumanCheckMode {
  return value === "off" || value === "optional" || value === "required";
}

export async function runHumanCheck(
  action: HumanCheckAction,
  mode: HumanCheckMode,
  apiBaseUrl?: string,
): Promise<string | undefined> {
  if (mode === "off") return undefined;
  const token = prompt ? await prompt({ action, mode: mode as Exclude<HumanCheckMode, "off">, apiBaseUrl }) : null;
  if (token) return token;
  if (mode === "required") throw new HumanCheckCancelledError();
  return undefined;
}
