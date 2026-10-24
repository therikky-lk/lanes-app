// Daily mixes built on the client from the listener's own taste: liked tracks
// and history are clustered by artist, and each cluster is grown into a long
// mix with the radio engine (similar tracks), keeping a share of familiar songs.
import type { Track } from "@/shared/types";

export interface MixSeedTrack extends Track {
  /** listening weight: likes count more than plays */
  weight: number;
}

export interface BuiltMix {
  id: string;
  index: number;
  artists: string[];
  tracks: Track[];
}

export interface BuildMixesOptions {
  mixCount?: number;
  tracksPerMix?: number;
  familiarShare?: number;
  /** similar tracks for a seed (the radio engine) */
  radio: (seed: Track) => Promise<Track[]>;
  /** more tracks by an artist, to fill a mix the radio left short */
  artistTracks?: (artistName: string) => Promise<Track[]>;
  random?: () => number;
}

export function primaryArtistKey(track: Track): string {
  const name = track.artistList?.[0]?.name || track.artists.split(/\s*(?:,|&|feat\.?|ft\.?)\s*/i)[0] || "";
  return name.trim().toLowerCase();
}

function primaryArtistName(track: Track): string {
  return (track.artistList?.[0]?.name || track.artists.split(/\s*(?:,|&|feat\.?|ft\.?)\s*/i)[0] || "").trim();
}

/** artists ranked by how much the listener plays and likes them */
export function rankArtists(seeds: MixSeedTrack[]): { key: string; name: string; weight: number; tracks: MixSeedTrack[] }[] {
  const byArtist = new Map<string, { key: string; name: string; weight: number; tracks: MixSeedTrack[] }>();
  for (const t of seeds) {
    const key = primaryArtistKey(t);
    if (!key || key === "unknown") continue;
    const entry = byArtist.get(key) ?? { key, name: primaryArtistName(t), weight: 0, tracks: [] };
    entry.weight += t.weight;
    if (!entry.tracks.some((x) => x.id === t.id)) entry.tracks.push(t);
    byArtist.set(key, entry);
  }
  return [...byArtist.values()].sort((a, b) => b.weight - a.weight);
}

function shuffle<T>(list: T[], random: () => number): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** spread tracks so the same artist rarely plays twice in a row */
export function spreadArtists(tracks: Track[]): Track[] {
  const out: Track[] = [];
  const pool = [...tracks];
  while (pool.length) {
    const last = out.length ? primaryArtistKey(out[out.length - 1]) : "";
    const idx = pool.findIndex((t) => primaryArtistKey(t) !== last);
    out.push(pool.splice(idx === -1 ? 0 : idx, 1)[0]);
  }
  return out;
}

export async function buildDailyMixes(seeds: MixSeedTrack[], options: BuildMixesOptions): Promise<BuiltMix[]> {
  const mixCount = options.mixCount ?? 6;
  const perMix = options.tracksPerMix ?? 50;
  const familiarShare = options.familiarShare ?? 0.2;
  const random = options.random ?? Math.random;

  const ranked = rankArtists(seeds).slice(0, mixCount * 3);
  if (ranked.length === 0) return [];

  // each mix is anchored on one top artist plus up to two smaller ones
  const groups: (typeof ranked)[] = [];
  for (let i = 0; i < Math.min(mixCount, ranked.length); i++) groups.push([ranked[i]]);
  ranked.slice(groups.length).forEach((artist, i) => {
    const group = groups[i % groups.length];
    if (group.length < 3) group.push(artist);
  });

  const used = new Set<string>();
  const mixes: BuiltMix[] = [];
  for (const [i, group] of groups.entries()) {
    const familiar = shuffle(group.flatMap((a) => a.tracks), random)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, Math.max(3, Math.round(perMix * familiarShare)));
    // seeds from every artist of the group; a failed radio call is retried once
    const radioSeeds = [...new Map(familiar.map((t) => [primaryArtistKey(t), t])).values(), ...familiar].slice(0, 4);
    const radioOnce = (seed: Track) =>
      options.radio(seed).catch(() => options.radio(seed)).catch(() => [] as Track[]);
    const similar = (await Promise.all(radioSeeds.map(radioOnce))).flat();
    // radio came back thin: top up with more songs by the mix's artists
    if (similar.length < perMix && options.artistTracks) {
      const extra = await Promise.all(group.map((a) => options.artistTracks!(a.name).catch(() => [] as Track[])));
      similar.push(...extra.flat());
    }

    const picked: Track[] = [];
    const take = (t: Track) => {
      if (!t?.id || used.has(t.id) || picked.some((p) => p.id === t.id)) return;
      picked.push(t);
    };
    // interleave: about one familiar song per four new ones
    const fresh = shuffle(similar, random);
    let f = 0;
    let n = 0;
    while (picked.length < perMix && (f < familiar.length || n < fresh.length)) {
      if (f < familiar.length && (picked.length % 5 === 0 || n >= fresh.length)) take(familiar[f++]);
      else if (n < fresh.length) take(fresh[n++]);
      else break;
    }
    // still short of a full mix: grow it from its own new songs (radio of
    // radio), a few seeds per round, until it's full or nothing new comes back
    const seeded = new Set<string>(radioSeeds.map((t) => t.id));
    for (let round = 0; picked.length < perMix && round < 4; round++) {
      const nextSeeds = shuffle(picked.filter((t) => !seeded.has(t.id)), random).slice(0, 3);
      if (nextSeeds.length === 0) break;
      nextSeeds.forEach((t) => seeded.add(t.id));
      const more = shuffle((await Promise.all(nextSeeds.map(radioOnce))).flat(), random);
      const before = picked.length;
      for (const t of more) {
        if (picked.length >= perMix) break;
        take(t);
      }
      if (picked.length === before) break;
    }
    if (picked.length < 5) continue; // not enough material for a real mix
    picked.forEach((t) => used.add(t.id));
    mixes.push({
      id: `lane-mix-${i + 1}`,
      index: mixes.length + 1,
      artists: group.map((a) => a.name),
      tracks: spreadArtists(picked),
    });
  }
  return mixes;
}
