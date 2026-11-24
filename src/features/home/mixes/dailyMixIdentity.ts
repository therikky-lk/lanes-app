export interface DailyMixIdentity {
  id: string;
  title: string;
  index?: number;
}

const STORAGE_KEY = "lane_daily_mix_identities_v1:";

export function readDailyMixIdentities(owner: string): DailyMixIdentity[] {
  if (!owner) return [];
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY + owner) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

export function storeDailyMixIdentities(owner: string, mixes: DailyMixIdentity[]): DailyMixIdentity[] {
  const identities = new Map(mixes.map(mix => [mix.id, mix]));
  for (const mix of readDailyMixIdentities(owner)) if (!identities.has(mix.id)) identities.set(mix.id, mix);
  const recent = [...identities.values()].slice(0, 160);
  if (owner) {
    try { localStorage.setItem(STORAGE_KEY + owner, JSON.stringify(recent)); } catch {}
  }
  return recent;
}

export function isDailyMixId(id: string): boolean {
  return id.startsWith("lane-mix-") || id.startsWith("daily-mix") || id.startsWith("mix-");
}

export function dailyMixIndex(id: string): number | undefined {
  const index = Number(/^(?:lane-mix|daily-mix|mix)[-:]?(\d{1,2})$/.exec(id)?.[1]);
  return index > 0 ? index : undefined;
}
