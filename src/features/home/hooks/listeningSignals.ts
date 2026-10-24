// The listener's likes and plays, for daily mixes and My Vibe.
//
// The server pages these 100 at a time (a bigger `limit` is refused), so the
// lists are read page by page up to the wanted size.
import { api, toClientTrack } from "@/shared/api";
import type { Track } from "@/shared/types";

const PAGE = 100;

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
  const [liked, history] = await Promise.all([
    collect((cursor) => api.listLikedTracks(PAGE, cursor) as Promise<Page>, maxLiked),
    collect((cursor) => api.getHistory(cursor, PAGE) as Promise<Page>, maxHistory),
  ]);
  return { liked, history };
}
