import { describe, expect, it, vi } from "vitest";
import type { Track } from "@/shared/contracts";
import type { ClientImportedTrack } from "../importTypes";
import {
  BATCH_SIZE,
  countItems,
  LikedImportRunner,
  newImportState,
  requeue,
  type LikedImportState,
  type MatchOutcome,
  type RunnerDeps,
} from "./likedImportRunner";

function sp(n: number): ClientImportedTrack {
  return { sourceId: `sp${n}`, title: `Song ${n}`, artists: [`Artist ${n}`], durationMs: 180_000 };
}

function yt(id: string): Track {
  return { id, title: id, artists: [{ id: "a", name: "A" }], durationMs: 180_000 };
}

class RateLimited extends Error {
  status = 429;
}

/** Spotify serves newest first: sp<total> … sp1 */
function spotify(total: number, extra: ClientImportedTrack[] = []) {
  const all = [...Array.from({ length: total }, (_, i) => sp(total - i)), ...extra];
  return vi.fn(async (offset: number, limit: number) => {
    const page = all.slice(offset, offset + limit);
    return { total: all.length, count: page.length, tracks: page };
  });
}

function setup(overrides: Partial<RunnerDeps> = {}, total = 3) {
  const likedOrder: string[] = [];
  const saved: LikedImportState[] = [];
  const deps: RunnerDeps = {
    fetchSpotifyPage: spotify(total),
    match: vi.fn(async (t: ClientImportedTrack): Promise<MatchOutcome> => ({ status: "approved", track: yt(`yt_${t.sourceId}`), score: 90 })),
    like: vi.fn(async (t) => {
      likedOrder.push(t.id);
    }),
    likedIds: vi.fn(async () => new Set<string>()),
    save: vi.fn(async (s: LikedImportState) => {
      saved.push(JSON.parse(JSON.stringify(s)));
    }),
    sleep: vi.fn(async () => {}),
    isRateLimit: (e) => (e as { status?: number })?.status === 429,
    ...overrides,
  };
  return { deps, likedOrder, saved, runner: new LikedImportRunner(deps) };
}

describe("LikedImportRunner", () => {
  it("likes oldest first so Lane keeps the Spotify order", async () => {
    const { runner, likedOrder } = setup();
    const state = newImportState("me", "spot");
    await runner.run(state);
    expect(likedOrder).toEqual(["yt_sp1", "yt_sp2", "yt_sp3"]);
    expect(state.finished).toBe(true);
    expect(countItems(state).liked).toBe(3);
  });

  it("does not like twice: already liked in Lane, the same song listed twice, two songs matching one track", async () => {
    const { runner, likedOrder, deps } = setup({
      fetchSpotifyPage: spotify(3, [sp(2)]),
      likedIds: vi.fn(async () => new Set(["yt_sp1"])),
      match: vi.fn(async (t: ClientImportedTrack): Promise<MatchOutcome> => ({
        status: "approved",
        // sp3 is the same recording as sp2 on YouTube Music
        track: yt(t.sourceId === "sp3" ? "yt_sp2" : `yt_${t.sourceId}`),
        score: 90,
      })),
    });
    const state = newImportState("me", "spot");
    await runner.run(state);
    expect(state.items).toHaveLength(3);
    expect(likedOrder).toEqual(["yt_sp2"]);
    expect(deps.like).toHaveBeenCalledTimes(1);
    expect(countItems(state)).toMatchObject({ liked: 1, duplicate: 2 });
  });

  it("keeps unsure matches for review and not found tracks in their own list", async () => {
    const { runner, likedOrder } = setup({
      match: vi.fn(async (t: ClientImportedTrack): Promise<MatchOutcome> =>
        t.sourceId === "sp1"
          ? { status: "pending", reason: "low_confidence_match", score: 50, proposedTrack: yt("maybe") }
          : t.sourceId === "sp2"
            ? { status: "pending", reason: "no_catalog_candidates" }
            : { status: "approved", track: yt("yt_sp3"), score: 95 },
      ),
    });
    const state = newImportState("me", "spot");
    await runner.run(state);
    expect(likedOrder).toEqual(["yt_sp3"]);
    expect(state.items[0]).toMatchObject({ status: "review", proposed: { id: "maybe" } });
    expect(state.items[1].status).toBe("not_found");
  });

  it("waits out a rate limit instead of marking the track as not found", async () => {
    let calls = 0;
    const events: string[] = [];
    const { runner, likedOrder, deps } = setup({
      match: vi.fn(async (t: ClientImportedTrack): Promise<MatchOutcome> => {
        if (t.sourceId === "sp2" && calls++ < 2) throw new RateLimited("429");
        return { status: "approved", track: yt(`yt_${t.sourceId}`), score: 90 };
      }),
      onEvent: (e) => events.push(e.type),
    });
    const state = newImportState("me", "spot");
    await runner.run(state);
    expect(likedOrder).toContain("yt_sp2");
    expect(countItems(state).notFound).toBe(0);
    expect(events.filter((e) => e === "waiting")).toHaveLength(2);
    expect(deps.sleep).toHaveBeenCalledWith(5_000, undefined);
  });

  it("goes in batches, saves after each, and a stopped import continues without liking anything twice", async () => {
    const total = BATCH_SIZE * 2 + 5;
    const controller = new AbortController();
    const first = setup(
      {
        onEvent: (e) => {
          if (e.type === "batch_done" && e.log.n === 1) controller.abort();
        },
      },
      total,
    );
    const state = newImportState("me", "spot");
    await expect(first.runner.run(state, controller.signal)).rejects.toThrow();
    expect(first.likedOrder).toHaveLength(BATCH_SIZE);
    const stored = first.saved.at(-1)!;
    expect(stored.batches).toHaveLength(1);
    expect(stored.batches[0]).toMatchObject({ n: 1, of: 3, from: 1, to: BATCH_SIZE, liked: BATCH_SIZE });

    // the app is opened again: go on from the saved state
    const second = setup({ likedIds: vi.fn(async () => new Set(first.likedOrder)) }, total);
    await second.runner.run(stored);
    expect(second.deps.fetchSpotifyPage).not.toHaveBeenCalled();
    expect(second.likedOrder).toHaveLength(total - BATCH_SIZE);
    expect(new Set([...first.likedOrder, ...second.likedOrder]).size).toBe(total);
    expect(stored.batches.map((b) => b.n)).toEqual([1, 2, 3]);
    expect(stored.finished).toBe(true);
  });

  it("treats 409 as already liked, retries server errors, and failed tracks can be retried", async () => {
    let fails = 0;
    const { runner, deps } = setup({
      like: vi.fn(async (t) => {
        if (t.id === "yt_sp1") throw Object.assign(new Error("conflict"), { status: 409 });
        if (t.id === "yt_sp2" && fails++ < 1) throw Object.assign(new Error("oops"), { status: 503 });
        if (t.id === "yt_sp3") throw Object.assign(new Error("bad"), { status: 400 });
      }),
    });
    const state = newImportState("me", "spot");
    await runner.run(state);
    expect(state.items.map((i) => i.status)).toEqual(["duplicate", "liked", "failed"]);

    (deps.like as ReturnType<typeof vi.fn>).mockImplementation(async () => {});
    expect(requeue(state, false)).toBe(1);
    await runner.run(state);
    expect(state.items[2].status).toBe("liked");
    expect(state.batches.at(-1)).toMatchObject({ pass: 2, n: 1, of: 1 });
  });

  it("pauses with an error when YouTube Music can't be reached at all, leaving the batch to redo", async () => {
    const { runner } = setup({
      match: vi.fn(async (): Promise<MatchOutcome> => ({ status: "pending", reason: "catalog_lookup_failed" })),
    });
    const state = newImportState("me", "spot");
    await expect(runner.run(state)).rejects.toThrow(/unreachable/);
    expect(state.items.every((i) => !i.status)).toBe(true);
    expect(state.finished).toBe(false);
  });
});
