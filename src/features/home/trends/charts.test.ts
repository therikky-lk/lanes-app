import { beforeEach, describe, expect, it } from "vitest";
import { withMovement } from "./charts";

const tr = (id: string) => ({ id, title: id, artists: "A", coverUrl: "", durationMs: 1, playCount: 0 });

describe("chart movement", () => {
  beforeEach(() => localStorage.clear());

  it("compares with the previous day's list", () => {
    const first = withMovement("russia", [tr("a"), tr("b"), tr("c")], "2026-10-23");
    expect(first.every((e) => e.movement === "same")).toBe(true);
    const next = withMovement("russia", [tr("b"), tr("a"), tr("d")], "2026-10-24");
    expect(next.map((e) => [e.track.id, e.movement, e.delta])).toEqual([
      ["b", "up", 1],
      ["a", "down", -1],
      ["d", "new", 0],
    ]);
    // a second load the same day still compares with the day before
    const again = withMovement("russia", [tr("b"), tr("a"), tr("d")], "2026-10-24");
    expect(again[0].movement).toBe("up");
  });
});
