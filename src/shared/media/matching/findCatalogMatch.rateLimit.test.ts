import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ searchRaw: vi.fn() }));
vi.mock("@/shared/media/innertube", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/media/innertube")>();
  return { ...actual, searchRaw: mocks.searchRaw };
});

import { InnertubeError } from "@/shared/media/innertube/innertubeClient";
import { findCatalogMatch } from "./findCatalogMatch";

afterEach(() => mocks.searchRaw.mockReset());

describe("findCatalogMatch", () => {
  it("passes a rate limit on to the caller instead of calling the track not found", async () => {
    mocks.searchRaw.mockRejectedValue(new InnertubeError("YouTube Music search failed with HTTP 429.", 429));
    await expect(
      findCatalogMatch({ sourceId: "x", title: "Song", artists: ["Artist"] }),
    ).rejects.toMatchObject({ status: 429 });
  });

  it("still reports other search failures as a failed lookup", async () => {
    mocks.searchRaw.mockRejectedValue(new InnertubeError("YouTube Music is unreachable.", 0));
    await expect(findCatalogMatch({ sourceId: "x", title: "Song", artists: ["Artist"] })).resolves.toMatchObject({
      status: "pending",
      reason: "catalog_lookup_failed",
    });
  });
});
