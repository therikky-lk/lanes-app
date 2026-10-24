import { describe, expect, it } from "vitest";
import type { Track } from "@/shared/types/track";
import { affinity, buildTaste, pickWeighted, selectFresh } from "./vibeTaste";

const tr = (id: string, artist: string): Track => ({ id, title: id, artists: artist, coverUrl: "", durationMs: 1, playCount: 0 });

describe("my vibe taste", () => {
  it("weighs likes and plays, and early skips count against an artist", () => {
    const taste = buildTaste({
      liked: [tr("a1", "A"), tr("a2", "A")],
      history: [tr("b1", "B"), tr("b1", "B"), tr("c1", "C")],
      sessionSkipped: [tr("c2", "C")],
    });
    expect(affinity(taste, tr("x", "A"))).toBe(1);
    expect(affinity(taste, tr("x", "B"))).toBeGreaterThan(0);
    expect(affinity(taste, tr("x", "C"))).toBeLessThan(0);
    expect(taste.known.has("c2")).toBe(true);
  });

  it("prefers new tracks and keeps only a small familiar share", () => {
    const taste = buildTaste({ liked: [tr("k1", "A"), tr("k2", "A"), tr("k3", "B")], history: [] });
    const candidates = [tr("k1", "A"), tr("k2", "A"), tr("k3", "B"), ...Array.from({ length: 30 }, (_, i) => tr(`n${i}`, `N${i % 5}`))];
    const out = selectFresh(candidates, taste, { count: 20, exclude: new Set(["n0"]), familiarShare: 0.1, random: () => 0.5 });
    expect(out).toHaveLength(20);
    expect(out.filter((t) => taste.known.has(t.id)).length).toBe(2);
    expect(out.some((t) => t.id === "n0")).toBe(false);
    for (let i = 1; i < out.length; i++) {
      // the same artist twice in a row only when nothing else is left
      if (out[i].artists === out[i - 1].artists) expect(out.slice(i).every((t) => t.artists === out[i].artists)).toBe(true);
    }
  });

  it("picks seeds from different artists", () => {
    const pool = [tr("a1", "A"), tr("a2", "A"), tr("b1", "B"), tr("c1", "C")].map((track) => ({ track, weight: 1 }));
    const seeds = pickWeighted(pool, 3, new Set(), () => 0);
    expect(new Set(seeds.map((s) => s.artists)).size).toBe(3);
  });
});
