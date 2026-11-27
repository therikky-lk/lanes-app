import type { UserProfile } from "@/shared/contracts/users";
import type { ProfileCustomization } from "./profileCustomization";

export type ProfileStatsSnapshot = Pick<UserProfile, "followersCount" | "listenedDurationMs" | "likedTracksCount">;

type ProfileCacheSections = {
  customization: ProfileCustomization;
  stats: ProfileStatsSnapshot;
};
type Section = keyof ProfileCacheSections;

const keys: Record<Section, string> = {
  customization: "liner:query:own-profile-customization:v1",
  stats: "liner:query:own-profile-stats:v1",
};

export function readProfileCache<K extends Section>(owner: string | null, section: K): ProfileCacheSections[K] | null {
  if (!owner) return null;
  try {
    const entry = JSON.parse(localStorage.getItem(keys[section]) ?? "null");
    if (entry?.owner !== owner || !entry.data || typeof entry.data !== "object") return null;
    if (section === "customization" && (!Array.isArray(entry.data.tracks) || !Array.isArray(entry.data.links))) return null;
    return entry.data;
  } catch {
    return null;
  }
}

export function writeProfileCache<K extends Section>(owner: string, section: K, data: ProfileCacheSections[K]): void {
  try {
    localStorage.setItem(keys[section], JSON.stringify({ owner, data }));
  } catch { /* Storage may be unavailable or full. */ }
}

export function clearProfileCache(): void {
  try {
    for (const key of Object.values(keys)) localStorage.removeItem(key);
  } catch { /* Storage may be unavailable. */ }
}
