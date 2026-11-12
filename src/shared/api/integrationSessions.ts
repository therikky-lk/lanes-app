import { getAuthSession, getValidAccessToken } from "./auth-session";
import { LANE_LINK_ORIGIN } from "./baseUrl";
import type { YoutubeAuthTokens } from "@/shared/media/youtube/auth/tvTokens";

type Sessions = {
  youtube: YoutubeAuthTokens & { pageId: string | null };
  yandex: { accessToken: string };
};

export type IntegrationSession<T> = { revision: number; session: T | null };

export function integrationOwner(): string | null {
  const auth = getAuthSession();
  return auth?.user?.id ? `${auth.authBackend ?? "liner"}:${auth.user.id}` : null;
}

export class IntegrationSessionError extends Error {
  constructor(readonly status: number) {
    super("Could not sync the integration session.");
  }
}

async function request<T>(provider: keyof Sessions, owner: string, init?: RequestInit, query = ""): Promise<T> {
  const auth = getAuthSession();
  if (integrationOwner() !== owner) throw new IntegrationSessionError(401);
  const token = await getValidAccessToken();
  if (!token || getAuthSession()?.accessToken !== token || integrationOwner() !== owner) throw new IntegrationSessionError(401);
  const response = await fetch(`${LANE_LINK_ORIGIN}/v1/me/integration-sessions/${auth?.authBackend ?? "liner"}/${provider}${query}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, ...(init?.body ? { "content-type": "application/json" } : {}) },
    cache: "no-store",
    credentials: "omit",
    redirect: "error",
    signal: init?.signal
      ? AbortSignal.any([init.signal, AbortSignal.timeout(15_000)])
      : AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new IntegrationSessionError(response.status);
  const result = await response.json() as T;
  if (integrationOwner() !== owner) throw new IntegrationSessionError(401);
  return result;
}

export function readIntegration<P extends keyof Sessions>(provider: P, owner: string, knownRevision = 0, signal?: AbortSignal) {
  return request<IntegrationSession<Sessions[P]>>(provider, owner, { signal }, knownRevision ? `?revision=${knownRevision}` : "");
}

export function writeIntegration<P extends keyof Sessions>(
  provider: P, owner: string, state: IntegrationSession<Sessions[P]>,
) {
  return request<{ revision: number }>(provider, owner, { method: "PUT", body: JSON.stringify(state) });
}

export function readYandexConnection(owner: string) {
  return request<{ connected: boolean }>("yandex", owner, undefined, "?status");
}
