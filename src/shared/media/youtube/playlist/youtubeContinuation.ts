import { asArray, asRecord, collectByKey, findFirst, trimmedString } from "@/shared/utils/json";
import { postInnertube, type InnertubeProfile } from "@/shared/media/innertube/innertubeClient";
import { rethrowIfAborted } from "@/shared/utils/abort";

function commandToken(endpoint: unknown): string | undefined {
  return trimmedString(asRecord(endpoint)?.token) ?? collectByKey(endpoint, "continuationCommand")
    .map((command) => trimmedString(asRecord(command)?.token)).find(Boolean);
}

export function extractInnertubeContinuationToken(
  body: unknown,
): string | undefined {
  return (
    commandToken(findFirst(body, "continuationItemViewModel")) ??
    commandToken(
      findFirst(body, "continuationItemRenderer")?.continuationEndpoint,
    ) ??
    commandToken(body) ??
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
    // Initial browse responses carry the playlist inside the selected tab.
    // Continuation responses instead append the next page at the root; their
    // selected tab is only a marker and contains no playlist rows. Prefer the
    // appended rows or we silently count only the first 100 tracks.
    const appendedItems = collectByKey(page, "appendContinuationItemsAction")
      .flatMap((action) => asArray(asRecord(action)?.continuationItems));
    if (appendedItems.length) {
      visit(appendedItems);
    } else {
      const tabs = collectByKey(page, "tabRenderer").map(asRecord);
      const selected = tabs.find((tab) => tab?.selected === true) ?? tabs.find((tab) => tab?.content);
      const main = selected?.content ?? asRecord(page)?.contents ?? page;
      // New WEB pages can leave an empty legacy list next to a rich grid of
      // lockupViewModel cards. Do not let that placeholder hide the real list.
      const shelf = ["playlistVideoListRenderer", "playlistVideoListContinuation", "musicPlaylistShelfRenderer", "musicPlaylistShelfContinuation"]
        .map((key) => findFirst(main, key))
        .find((list) => asArray(list?.contents).length > 0 || asArray(list?.continuations).length > 0) ?? main;
      visit(shelf);
    }
    // Continuation commands are commonly siblings of `contents`, rather than
    // children of the selected list renderer.
    const token = extractInnertubeContinuationToken(appendedItems) ?? extractInnertubeContinuationToken(page);
    if (!token || seenTokens.has(token)) return;
    seenTokens.add(token);
    // Let failures reach the caller instead of caching a truncated playlist.
    page = await postInnertube("browse", { continuation: token }, { signal, profile });
  }
  throw new Error("YouTube playlist pagination exceeded 500 pages.");
}
