import { describe, expect, it } from "vitest";
import { streamHostCandidates } from "./innertubeAudio";

describe("streamHostCandidates", () => {
  it("tries the mirror node and the redirector after the ISP cache node", () => {
    const url = "https://rr2---sn-pouxga5o-vu2z.googlevideo.com/videoplayback?expire=1&mn=sn-pouxga5o-vu2z%2Csn-n8v7knez&itag=251";
    const hosts = streamHostCandidates(url).map((u) => new URL(u).hostname);
    expect(hosts).toEqual([
      "rr2---sn-pouxga5o-vu2z.googlevideo.com",
      "rr2---sn-n8v7knez.googlevideo.com",
      "redirector.googlevideo.com",
    ]);
  });

  it("leaves non-googlevideo urls alone", () => {
    expect(streamHostCandidates("https://example.com/a.mp3")).toEqual(["https://example.com/a.mp3"]);
  });
});
