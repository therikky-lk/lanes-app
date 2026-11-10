// The listener's likes and plays, for daily mixes and My Vibe.
//
// The server pages these 100 at a time (a bigger `limit` is refused), so the
// lists are read page by page up to the wanted size.
import { api, toClientTrack } from "@/shared/api";
import type { Track } from "@/shared/types";

const PAGE = 100;
const SIGNAL_CACHE_TTL_MS = 5 * 60_000;
let cachedSignals: { liked: Track[]; history: Track[]; loadedAt: number } | null = null;
let signalRequest: Promise<{ liked: Track[]; history: Track[] }> | null = null;

type Entry = { track?: unknown };
type Page = { items?: Entry[]; nextCursor?: string | null };

async function collect(fetchPage: (cursor?: string) => Promise<Page>, max: number): Promise<Track[]> {
  const out: Track[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < Math.ceil(max / PAGE); i++) {
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

export async function loadListeningSignals(maxLiked = 300, maxHistory = 200): Promise<{ liked: Track[]; history: Track[] }> {
  if (
    maxLiked === 300 && maxHistory === 200 && cachedSignals &&
    Date.now() - cachedSignals.loadedAt < SIGNAL_CACHE_TTL_MS
  ) return { liked: cachedSignals.liked, history: cachedSignals.history };

  if (!signalRequest) {
    signalRequest = (async () => {
      const [liked, history] = await Promise.all([
        collect((cursor) => api.listLikedTracks(PAGE, cursor) as Promise<Page>, 300),
        collect((cursor) => api.getHistory(cursor, PAGE) as Promise<Page>, 200),
      ]);
      cachedSignals = { liked, history, loadedAt: Date.now() };
      return { liked, history };
    })().finally(() => { signalRequest = null; });
  }
  const signals = await signalRequest;
  return { liked: signals.liked.slice(0, maxLiked), history: signals.history.slice(0, maxHistory) };
}
