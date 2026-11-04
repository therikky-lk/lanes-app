import { useEffect, useState } from "react";
import { fetchYoutubeAccountPlaylists, useYoutubePreferences } from "@/shared/media/youtube";
import { useYoutubeAccount } from "./useYoutubeAccount";
import type { LibraryItemViewModel } from "@/features/library/types";

// Account-scoped snapshots survive navigation; transient failures keep the last
// successful list. Session keys stay in memory and are never written to disk.
type Snapshot = { items: LibraryItemViewModel[]; updatedAt: number };
const snapshots = new Map<string, Snapshot>();
const requests = new Map<string, Promise<Snapshot>>();
const FRESH_MS = 60_000;
const EMPTY: LibraryItemViewModel[] = [];

function load(session: string): Promise<Snapshot> {
  const running = requests.get(session);
  if (running) return running;
  const request = fetchYoutubeAccountPlaylists().then(playlists => {
    const previous = snapshots.get(session)?.items ?? EMPTY;
    const addedAt = new Date().toISOString();
    const snapshot: Snapshot = { updatedAt: Date.now(), items: playlists.map(playlist => ({
      id: playlist.id,
      title: playlist.title,
      subtitle: playlist.subtitle || "YouTube",
      imageUrl: playlist.thumbnailUrl || "",
      kind: "playlist",
      href: `/collection?type=playlist&id=${encodeURIComponent(playlist.id)}`,
      addedAt: previous.find(item => item.id === playlist.id)?.addedAt ?? addedAt,
      isOwned: false,
      source: "youtube",
    })) };
    snapshots.set(session, snapshot);
    while (snapshots.size > 3) snapshots.delete(snapshots.keys().next().value!);
    return snapshot;
  }).finally(() => requests.delete(session));
  requests.set(session, request);
  return request;
}

export function useYoutubeLibraryItems() {
  const { signedIn, session } = useYoutubeAccount();
  const syncLibrary = useYoutubePreferences(state => state.syncLibrary);
  const [loaded, setLoaded] = useState(() => ({ session, items: session ? snapshots.get(session)?.items ?? EMPTY : EMPTY }));

  useEffect(() => {
    if (!signedIn || !syncLibrary || !session) return;
    let active = true;
    const cached = snapshots.get(session);
    if (cached) setLoaded({ session, items: cached.items });
    if (cached && Date.now() - cached.updatedAt < FRESH_MS) return;
    void load(session).then(snapshot => {
      if (active) setLoaded({ session, items: snapshot.items });
    }).catch(() => { /* Keep the last successful library during an outage. */ });
    return () => { active = false; };
  }, [session, signedIn, syncLibrary]);

  if (!signedIn || !syncLibrary || !session) return EMPTY;
  return loaded.session === session ? loaded.items : snapshots.get(session)?.items ?? EMPTY;
}
