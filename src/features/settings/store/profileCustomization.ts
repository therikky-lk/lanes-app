import { getAuthSession, getValidAccessToken } from "@/shared/api/auth-session";
import { LANE_LINK_ORIGIN } from "@/shared/api/baseUrl";
import type { Track } from "@/shared/types";

export type ProfileArtist = { id: string; name: string; coverUrl: string };
export type ProfileCustomization = { banner: string | null; links: string[]; artist: ProfileArtist | null; tracks: Track[] };
export const emptyProfile: ProfileCustomization = { banner: null, links: [], artist: null, tracks: [] };
export function profileOwner(expectedUserId?: string) {
  const session = getAuthSession();
  const userId = session?.user?.id;
  return session && userId && (expectedUserId === undefined || expectedUserId === userId)
    ? `${session.authBackend ?? "liner"}:${userId}` : null;
}
export async function profileRequest(owner: string, patch?: Partial<ProfileCustomization>, signal?: AbortSignal): Promise<ProfileCustomization> {
  if (profileOwner() !== owner) throw new Error("Account changed");
  const backend = getAuthSession()?.authBackend ?? "liner";
  const token = await getValidAccessToken();
  if (!token || profileOwner() !== owner) throw new Error("Unauthorized");
  const response = await fetch(`${LANE_LINK_ORIGIN}/v1/me/profile-customization/${backend}`, {
    method: patch ? "PATCH" : "GET", cache: "no-store", credentials: "omit", redirect: "error",
    headers: { authorization: `Bearer ${token}`, ...(patch ? { "content-type": "application/json" } : {}) },
    body: patch ? JSON.stringify(patch) : undefined,
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error("Profile storage unavailable");
  const result = await response.json();
  if (profileOwner() !== owner) throw new Error("Account changed");
  return { ...emptyProfile, ...result };
}
