import type { LyricsCandidate, LyricsStreamEvent } from "@/shared/contracts/lyrics";

type LyricsSource = () => AsyncIterable<LyricsStreamEvent>;
export type LyricsTarget = { baseUrl: string; token: string | null; publicCatalog?: true };

export function getPublicLyricsCatalog(raw = import.meta.env.VITE_PUBLIC_LYRICS_CATALOG_URL): string | undefined {
  if (!raw?.trim()) return undefined;
  try {
    const url = new URL(raw.trim());
    if (url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash && url.pathname === "/") {
      return url.origin;
    }
  } catch { /* invalid catalog configuration */ }
  return undefined;
}

/** Account services and the Liner lyrics catalog have separate credentials. */
export function lyricsTargets(primaryApi: string, accountApi: string, backend: unknown, token: string | null, localPreview = false, publicCatalog?: string): LyricsTarget[] {
  const targets: LyricsTarget[] = [];
  if (publicCatalog) targets.push({ baseUrl: publicCatalog, token: null, publicCatalog: true });
  if (localPreview) targets.push({ baseUrl: primaryApi, token: backend === "hyprr" ? null : token });
  else if (token && backend !== "hyprr") targets.push({ baseUrl: primaryApi, token });
  else if (token && accountApi && accountApi !== primaryApi) targets.push({ baseUrl: accountApi, token });
  return targets;
}

/** Keep all providers, even if a server disconnects after its first result. */
export async function* collectLyricsSources(
  servers: LyricsSource[],
  fallback: LyricsSource,
  signal?: AbortSignal,
): AsyncGenerator<LyricsStreamEvent> {
  const candidates = new Map<string, LyricsCandidate>();
  let complete = false;
  let instrumental = false;
  for (const source of servers) {
    signal?.throwIfAborted();
    complete = false;
    let sourceFound = false;
    try {
      for await (const event of source()) {
        signal?.throwIfAborted();
        if (event.type === "done") {
          complete = sourceFound || event.instrumental === true;
          instrumental ||= event.instrumental === true;
          break;
        }
        if (event.type === "provider" && event.status === "found") {
          if (!event.candidate.lyrics.content.trim()) continue;
          sourceFound = true;
          candidates.set(event.provider.toLowerCase(), event.candidate);
        }
        yield event;
      }
    } catch (error) {
      if (signal?.aborted) throw error;
      console.warn("[lyrics] Server source unavailable", error);
    }
    // A complete Liner response already contains all its provider results.
    if (complete && (candidates.size || instrumental)) break;
  }
  const serverComplete = complete && (candidates.size > 0 || instrumental);
  if ((!complete || !candidates.size) && !instrumental) {
    for await (const event of fallback()) {
      signal?.throwIfAborted();
      if (event.type === "done") continue;
      if (event.type === "provider" && event.status === "found") {
        if (candidates.has(event.provider.toLowerCase())) continue;
        candidates.set(event.provider.toLowerCase(), event.candidate);
      }
      yield event;
    }
  }
  yield {
    type: "done", cached: false,
    source: serverComplete ? "server" : "fallback",
    ...(instrumental && !candidates.size ? { instrumental: true } : {}),
    ...(!candidates.size ? { status: "not_found" as const } : {}),
  };
}
