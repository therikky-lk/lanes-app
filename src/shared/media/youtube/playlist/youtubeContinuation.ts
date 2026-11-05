import { asRecord, findFirst, trimmedString } from "@/shared/utils/json";
import { postInnertube, type InnertubeProfile } from "@/shared/media/innertube/innertubeClient";
import { rethrowIfAborted } from "@/shared/utils/abort";

function commandToken(endpoint: unknown): string | undefined {
  return trimmedString(
    asRecord(asRecord(endpoint)?.continuationCommand)?.token,
  );
}

export function extractInnertubeContinuationToken(
  body: unknown,
): string | undefined {
  return (
    commandToken(
      findFirst(body, "continuationItemRenderer")?.continuationEndpoint,
    ) ??
    trimmedString(findFirst(body, "continuationCommand")?.token) ??
    commandToken(findFirst(body, "continuationEndpoint")) ??
    trimmedString(findFirst(body, "nextContinuationData")?.continuation) ??
    trimmedString(findFirst(body, "reloadContinuationData")?.continuation)
  );
}

export async function fetchInnertubeContinuation(
  token: string,
  signal?: AbortSignal,
): Promise<unknown> {
  try {
    return await postInnertube("browse", { continuation: token }, { signal });
  } catch {
    rethrowIfAborted(signal);
    return undefined;
  }
}

/** Shared by playlist import and catalog browsing: never stop at page one. */
export async function visitYoutubePlaylistPages(
  firstPage: unknown,
  visit: (page: unknown) => void,
  signal?: AbortSignal,
  profile?: InnertubeProfile,
): Promise<void> {
  const seenTokens = new Set<string>();
  let page = firstPage;
  for (let count = 0; count < 500; count++) {
    signal?.throwIfAborted();
    const shelf = findFirst(page, "playlistVideoListRenderer") ??
      findFirst(page, "playlistVideoListContinuation") ??
      findFirst(page, "musicPlaylistShelfRenderer") ??
      findFirst(page, "musicPlaylistShelfContinuation") ?? page;
    visit(shelf);
    const token = extractInnertubeContinuationToken(shelf);
    if (!token || seenTokens.has(token)) return;
    seenTokens.add(token);
    // Let failures reach the caller instead of caching a truncated playlist.
    page = await postInnertube("browse", { continuation: token }, { signal, profile });
  }
  throw new Error("YouTube playlist pagination exceeded 500 pages.");
}
