import { beforeEach, describe, expect, it, vi } from "vitest";

const postInnertubeMock = vi.hoisted(() => vi.fn());
vi.mock("@/shared/media/innertube/innertubeClient", () => ({ postInnertube: postInnertubeMock }));

import { visitYoutubePlaylistPages } from "./youtubeContinuation";

function playlistPage(start: number, count: number, continuation?: string) {
  const items = Array.from({ length: count }, (_, index) => ({
    playlistVideoRenderer: { videoId: `video-${start + index}` },
  }));
  if (continuation) {
    items.push({ continuationItemViewModel: { continuationCommand: { token: continuation } } } as never);
  }
  return {
    contents: {
      twoColumnBrowseResultsRenderer: {
        tabs: [{
          tabRenderer: {
            selected: true,
            content: { sectionListRenderer: { contents: [{ itemSectionRenderer: { contents: items } }] } },
          },
        }],
      },
    },
  };
}

beforeEach(() => postInnertubeMock.mockReset());

describe("visitYoutubePlaylistPages", () => {
  it("walks every 100-item continuation page through the final short page", async () => {
    postInnertubeMock
      .mockResolvedValueOnce(playlistPage(100, 100, "page-2"))
      .mockResolvedValueOnce(playlistPage(200, 31));
    let visited = 0;

    await visitYoutubePlaylistPages(playlistPage(0, 100, "page-1"), (page) => {
      visited += (page as any).sectionListRenderer.contents[0].itemSectionRenderer.contents
        .filter((item: any) => item.playlistVideoRenderer).length;
    });

    expect(visited).toBe(231);
    expect(postInnertubeMock).toHaveBeenNthCalledWith(1, "browse", { continuation: "page-1" }, { signal: undefined, profile: undefined });
    expect(postInnertubeMock).toHaveBeenNthCalledWith(2, "browse", { continuation: "page-2" }, { signal: undefined, profile: undefined });
  });

  it("reads appended continuation items instead of the empty selected tab", async () => {
    const appended = [
      ...Array.from({ length: 100 }, (_, index) => ({ playlistVideoRenderer: { videoId: `video-${100 + index}` } })),
      { continuationItemViewModel: { continuationCommand: { token: "page-3" } } },
    ];
    postInnertubeMock
      .mockResolvedValueOnce({ onResponseReceivedActions: [{ appendContinuationItemsAction: { continuationItems: appended } }] })
      .mockResolvedValueOnce({ onResponseReceivedActions: [{ appendContinuationItemsAction: { continuationItems: [
        ...Array.from({ length: 31 }, (_, index) => ({ playlistVideoRenderer: { videoId: `video-${200 + index}` } })),
      ] } }] });

    let visited = 0;
    await visitYoutubePlaylistPages(playlistPage(0, 100, "page-2"), (page) => {
      if (Array.isArray(page)) {
        visited += page.filter((item) => Boolean((item as any).playlistVideoRenderer)).length;
      } else {
        visited += (page as any).sectionListRenderer.contents[0].itemSectionRenderer.contents
          .filter((item: any) => item.playlistVideoRenderer).length;
      }
    });

    expect(visited).toBe(231);
    expect(postInnertubeMock).toHaveBeenCalledTimes(2);
  });
});
