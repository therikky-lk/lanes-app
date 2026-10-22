import { describe, expect, it } from "vitest";
import { buildDailyMixes, primaryArtistKey, rankArtists, spreadArtists, type MixSeedTrack } from "./buildDailyMixes";
import type { Track } from "@/shared/types";

const tr = (id: string, artist: string): Track => ({ id, title: id, artists: artist, coverUrl: "", durationMs: 1, playCount: 0 });
const seed = (id: string, artist: string, weight: number): MixSeedTrack => ({ ...tr(id, artist), weight });

describe("daily mixes", () => {
  it("ranks artists by likes and plays", () => {
    const ranked = rankArtists([seed("a1", "A", 3), seed("b1", "B", 1), seed("b2", "B", 1), seed("a2", "A, X", 3)]);
    expect(ranked.map((r) => r.name)).toEqual(["A", "B"]);
    expect(ranked[0].tracks.map((t) => t.id)).toEqual(["a1", "a2"]);
    expect(primaryArtistKey(tr("x", "Монеточка feat. Кто-то"))).toBe("монеточка");
  });

  it("builds long mixes without repeats across mixes", async () => {
    const seeds: MixSeedTrack[] = [];
    for (const a of ["A", "B", "C", "D", "E", "F", "G", "H"]) for (let i = 0; i < 6; i++) seeds.push(seed(`${a}${i}`, a, a === "A" ? 3 : 1));
    let n = 0;
    const radio = async (s: Track) => Array.from({ length: 30 }, (_, i) => tr(`r-${s.id}-${i}-${n++ % 3 === 0 ? "dup" : i}`, `Sim${i % 7}`));
    const mixes = await buildDailyMixes(seeds, { radio, random: () => 0.42, tracksPerMix: 50 });
    expect(mixes.length).toBe(6);
    const all = mixes.flatMap((m) => m.tracks.map((t) => t.id));
    expect(new Set(all).size).toBe(all.length);
    for (const m of mixes) {
      expect(m.tracks.length).toBeGreaterThanOrEqual(40);
      const familiar = m.tracks.filter((t) => !t.id.startsWith("r-")).length;
      expect(familiar).toBeGreaterThan(0);
      expect(familiar).toBeLessThanOrEqual(m.tracks.length * 0.3);
    }
    expect(mixes[0].artists[0]).toBe("A");
  });

  it("returns nothing without listening data", async () => {
    expect(await buildDailyMixes([], { radio: async () => [] })).toEqual([]);
  });

  it("spreads one artist apart", () => {
    const out = spreadArtists([tr("1", "A"), tr("2", "A"), tr("3", "B"), tr("4", "B")]);
    for (let i = 1; i < out.length; i++) expect(primaryArtistKey(out[i])).not.toBe(primaryArtistKey(out[i - 1]));
  });
});
