// The listener's likes and plays, for daily mixes and My Vibe.
//
// The server pages these 100 at a time (a bigger `limit` is refused), so the
// lists are read page by page up to the wanted size.
import { likedTracksForSignals } from "@/features/library/hooks/useLikedTracks";
import { api, getAuthSession, toClientTrack } from "@/shared/api";
import type { Track } from "@/shared/types";

const PAGE = 100;
const SIGNAL_CACHE_TTL_MS = 5 * 60_000;
let cachedSignals: { liked: Track[]; history: Track[]; loadedAt: number; owner: string } | null = null;
let signalRequest: { owner: string; promise: Promise<{ liked: Track[]; history: Track[] }> } | null = null;

type Entry = { track?: unknown };
type Page = { items?: Entry[]; nextCursor?: string | null };

async function collect(fetchPage: (cursor?: string) => Promise<Page>, max: number, owner: string): Promise<Track[]> {
  const out: Track[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < Math.ceil(max / PAGE) && ownerKey() === owner; i++) {
    let page: Page;
    try {
      page = await fetchPage(cursor);
    } catch {
      break;
    }
    for (const entry of page.items ?? []) {
      if (entry.track) out.push(toClientTrack(entry.track as Parameters<typeof toClientTrack>[0]));
    }
    cursor = page.nextCursor ?? undefined;
    if (!cursor || !(page.items?.length)) break;
  }
  return out.slice(0, max);
}

function ownerKey(): string | undefined {
  const session = getAuthSession();
  if (session?.user?.id) return `${session.authBackend ?? "legacy"}:${session.user.id}`;
}

export async function loadListeningSignals(maxLiked = 300, maxHistory = 200): Promise<{ liked: Track[]; history: Track[] }> {
  const owner = ownerKey();
  if (!owner) {
    cachedSignals = null;
    signalRequest = null;
    return { liked: [], history: [] };
  }
  if (cachedSignals?.owner === owner && Date.now() - cachedSignals.loadedAt < SIGNAL_CACHE_TTL_MS) {
    return { liked: cachedSignals.liked.slice(0, maxLiked), history: cachedSignals.history.slice(0, maxHistory) };
  }

  if (signalRequest?.owner !== owner) {
    const promise = Promise.all([
      likedTracksForSignals(300) ?? collect((cursor) => api.listLikedTracks(PAGE, cursor) as Promise<Page>, 300, owner),
      collect((cursor) => api.getHistory(cursor, PAGE) as Promise<Page>, 200, owner),
    ]).then(([liked, history]) => {
      if (signalRequest?.promise === promise && ownerKey() === owner) {
        cachedSignals = { liked, history, loadedAt: Date.now(), owner };
      }
      return { liked, history };
    }).finally(() => {
      if (signalRequest?.promise === promise) signalRequest = null;
    });
    signalRequest = { owner, promise };
  }
  const signals = await signalRequest.promise;
  if (ownerKey() !== owner) return { liked: [], history: [] };
  return { liked: signals.liked.slice(0, maxLiked), history: signals.history.slice(0, maxHistory) };
}
