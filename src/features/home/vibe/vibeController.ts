import { playerEngine } from "@/features/player";
import type { Track } from "@/shared/types/track";

// "My Vibe": an endless personal stream. It is a radio station seeded from a
// track the listener likes / played recently, so the server + client radio
// engines keep refilling it with similar music forever.

const VIBE_CONTEXT_KEY = "lane_vibe_context";
const RECENT_SEEDS_KEY = "lane_vibe_recent_seeds";

let vibeContext: string | null = (() => {
  try {
    return sessionStorage.getItem(VIBE_CONTEXT_KEY);
  } catch {
    return null;
  }
})();

function recentSeeds(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_SEEDS_KEY) || "[]") as string[];
  } catch {
    return [];
  }
}

function rememberSeed(id: string): void {
  try {
    const next = [id, ...recentSeeds().filter((x) => x !== id)].slice(0, 15);
    localStorage.setItem(RECENT_SEEDS_KEY, JSON.stringify(next));
  } catch {}
}

export function isVibeContext(playbackContext: string | null | undefined): boolean {
  return !!vibeContext && playbackContext === vibeContext;
}

/**
 * Weighted random pick: liked tracks count 3x, recently played 2x, trending 1x.
 * Seeds used for the last few vibes are skipped so every start feels fresh.
 */
export function pickVibeSeed(
  sources: { liked?: Track[]; recent?: Track[]; trending?: Track[] },
  random: () => number = Math.random,
): Track | null {
  const recent = new Set(recentSeeds());
  const pool: { track: Track; weight: number }[] = [];
  const seen = new Set<string>();
  const add = (list: Track[] | undefined, weight: number) => {
    for (const t of list ?? []) {
      if (!t?.id || seen.has(t.id)) continue;
      seen.add(t.id);
      pool.push({ track: t, weight: recent.has(t.id) ? weight * 0.1 : weight });
    }
  };
  add(sources.liked?.slice(0, 200), 3);
  add(sources.recent, 2);
  add(sources.trending, 1);
  if (pool.length === 0) return null;
  const total = pool.reduce((s, p) => s + p.weight, 0);
  let r = random() * total;
  for (const p of pool) {
    r -= p.weight;
    if (r <= 0) return p.track;
  }
  return pool[pool.length - 1].track;
}

export async function startVibe(seed: Track): Promise<void> {
  rememberSeed(seed.id);
  vibeContext = `radio:${seed.id}`;
  try {
    sessionStorage.setItem(VIBE_CONTEXT_KEY, vibeContext);
  } catch {}
  await playerEngine.startRadioStation(seed);
}
