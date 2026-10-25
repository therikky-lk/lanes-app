import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/connect/connectService", () => ({
  useConnectStore: { getState: () => ({ me: { id: "dev-1", name: "PC (Windows)" } }) },
}));

import { DEVICE_ALBUM_PREFIX, localEntryToTrack, withLocalAvailability } from "./localPlaylistTracks";
import { readLocalEntries, withLocalEntries, withCoverMarker, readCoverMarker, stripCoverMarker } from "@/features/library/services/playlistCoverMarker";
import type { Track } from "@/shared/types";
import type { LocalTrackRecord } from "@/shared/media/local/localTracks";

const base = { artists: "Me", coverUrl: "", durationMs: 1000, playCount: 0 };

describe("withLocalAvailability", () => {
  it("marks files from another device and restores our own", () => {
    const tracks: Track[] = [
      { ...base, id: "yt123", title: "Catalog" },
      { ...base, id: "local:mine", title: "Mine", album: { id: `${DEVICE_ALBUM_PREFIX}dev-1`, title: "PC (Windows)" } },
      { ...base, id: "local:theirs", title: "Theirs", album: { id: `${DEVICE_ALBUM_PREFIX}dev-2`, title: "Phone (Pixel 7)" } },
    ];
    const records = [{ id: "local:mine", coverDataUrl: "data:image/jpeg;base64,AA" } as LocalTrackRecord];
    const out = withLocalAvailability(tracks, records);
    expect(out[0]).toBe(tracks[0]);
    expect(out[1]).toMatchObject({ coverUrl: "data:image/jpeg;base64,AA" });
    expect(out[1].onlyOnDevice).toBeUndefined();
    expect(out[2]).toMatchObject({ onlyOnDevice: "Phone (Pixel 7)" });
    expect(out[2].album).toBeUndefined();
  });

  it("returns the same list when there are no local tracks", () => {
    const tracks: Track[] = [{ ...base, id: "yt1", title: "A" }];
    expect(withLocalAvailability(tracks, [])).toBe(tracks);
  });

  it("keeps the files in the description next to the cover, invisibly", () => {
    const entry = { id: "local:abc", title: "Кредитов понабрал", artists: "PWGood", durationMs: 123000, deviceId: "dev-2", deviceName: "Phone (Pixel 7)", addedAt: 1 };
    let description = withCoverMarker("my words", "https://example.com/c.jpg");
    description = withLocalEntries(description, [entry]);
    expect(stripCoverMarker(description)).toBe("my words");
    expect(readCoverMarker(description)).toBe("https://example.com/c.jpg");
    expect(readLocalEntries(description)).toEqual([entry]);
    // changing the cover keeps the files
    description = withCoverMarker(description, "https://example.com/d.jpg");
    expect(readLocalEntries(description)).toEqual([entry]);
    const track = localEntryToTrack(entry);
    const [shown] = withLocalAvailability([track], []);
    expect(shown.onlyOnDevice).toBe("Phone (Pixel 7)");
    expect(withLocalEntries(description, [])).not.toContain("lane-local");
  });
});
