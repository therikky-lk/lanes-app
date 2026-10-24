import { afterEach, describe, expect, it, vi } from "vitest";
import { audiusCatalog, audiusStreamUrl, isAudiusId, mapAudiusTrack } from "./audius";
import { trackSource } from "@/shared/ui/SourceBadge";

describe("audius", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("maps tracks and builds stream urls", () => {
    const t = mapAudiusTrack({
      id: "D7KyD",
      title: "Song",
      duration: 201,
      user: { id: "u1", name: "Artist" },
      artwork: { "480x480": "https://img/480.jpg" },
    });
    expect(t).toMatchObject({ id: "au:D7KyD", title: "Song", durationMs: 201000, artists: [{ name: "Artist" }] });
    expect(t.cover?.url).toBe("https://img/480.jpg");
    expect(isAudiusId(t.id)).toBe(true);
    expect(audiusStreamUrl(t.id)).toBe("https://api.audius.co/v1/tracks/D7KyD/stream?app_name=Lane");
    expect(trackSource(t.id)).toBe("audius");
    expect(trackSource("sc:1")).toBe("soundcloud");
    expect(trackSource("dQw4w9WgXcQ")).toBe("youtube");
  });

  it("search keeps only full, free tracks", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: [
              { id: "a", title: "Free", user: { name: "X" }, duration: 100 },
              { id: "b", title: "Gated", user: { name: "X" }, stream_conditions: { usdc_purchase: {} } },
              { id: "c", title: "Off", user: { name: "X" }, is_streamable: false },
            ],
          }),
        ),
      ),
    );
    const items = await audiusCatalog.search("x");
    expect(items.map((i) => i.id)).toEqual(["au:a"]);
  });
});
