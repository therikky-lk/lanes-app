import { getAuthSession } from "@/shared/api";

type Removal = {
  owner: string;
  id: string;
  owned: boolean;
  committedAt: number | null;
  ownedAbsent: boolean;
  savedAbsent: boolean;
};
const removals = new Set<Removal>();
const listeners = new Set<() => void>();
let generation = 0;
let revision = 0;

export function playlistLibraryOwner() {
  const session = getAuthSession();
  return session?.user?.id ? `${session.authBackend ?? "liner"}:${session.user.id}` : null;
}
export const playlistRemovalGeneration = () => generation;
export const playlistRemovalSnapshot = () => revision;
export function subscribePlaylistRemovals(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
function emit() {
  revision++;
  listeners.forEach(listener => listener());
}
export function isPlaylistRemoved(id: string, owner = playlistLibraryOwner()) {
  return [...removals].some(removal => removal.owner === owner && removal.id === id);
}

/** Hide immediately, but restore the original cached item if the server rejects deletion. */
export function beginPlaylistRemoval(id: string, owned: boolean) {
  const owner = playlistLibraryOwner();
  if (!owner) throw new Error("No signed-in account");
  const removal: Removal = { owner, id, owned, committedAt: null, ownedAbsent: false, savedAbsent: false };
  removals.add(removal);
  generation++;
  emit();
  return {
    commit() {
      removal.committedAt = ++generation;
      emit();
    },
    rollback() {
      removals.delete(removal);
      generation++;
      emit();
    },
  };
}

/** Retire the barrier only after fresh lists confirm both references are gone. */
export function confirmPlaylistRemovals(source: "owned" | "saved", ids: Set<string>, readGeneration: number, owner: string | null) {
  let changed = false;
  for (const removal of removals) {
    if (removal.owner !== owner || removal.committedAt === null || readGeneration < removal.committedAt || ids.has(removal.id)) continue;
    if (source === "owned") removal.ownedAbsent = true;
    else removal.savedAbsent = true;
    if ((!removal.owned || removal.ownedAbsent) && removal.savedAbsent) {
      removals.delete(removal);
      changed = true;
    }
  }
  if (changed) emit();
}
