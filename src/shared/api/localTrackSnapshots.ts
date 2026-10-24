import type { Track } from "@/shared/contracts";

// The user's own audio files live on one device. When one goes into a
// playlist, the server keeps a snapshot of it; the device that owns the file
// registers how that snapshot is built (title, artist, which device it's on).

type Resolver = (trackId: string) => Promise<Track | undefined>;

let resolver: Resolver | null = null;

export function registerLocalTrackSnapshotResolver(next: Resolver): void {
  resolver = next;
}

export async function resolveLocalTrackSnapshot(trackId: string): Promise<Track | undefined> {
  if (!resolver) return undefined;
  try {
    return await resolver(trackId);
  } catch {
    return undefined;
  }
}
