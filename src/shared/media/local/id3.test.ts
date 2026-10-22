import { describe, expect, it } from "vitest";
import { parseId3, tagsFromFileName } from "./id3";
import { detectLyricsFormat } from "../lyrics/customLyrics";

function frame(id: string, body: number[]): number[] {
  const size = body.length;
  return [...id].map((c) => c.charCodeAt(0)).concat([(size >>> 24) & 255, (size >>> 16) & 255, (size >>> 8) & 255, size & 255, 0, 0], body);
}
const utf16 = (s: string) => {
  const out = [1, 0xff, 0xfe];
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    out.push(c & 255, c >> 8);
  }
  return out;
};
const cp1251 = (s: string) => [0, ...[...s].map((ch) => { const c = ch.charCodeAt(0); return c >= 0x410 && c <= 0x44f ? c - 0x410 + 0xc0 : c; })];
const utf8 = (s: string) => [3, ...new TextEncoder().encode(s)];

function tag(frames: number[][]): ArrayBuffer {
  const body = frames.flat();
  const n = body.length;
  const header = [0x49, 0x44, 0x33, 3, 0, 0, (n >> 21) & 127, (n >> 14) & 127, (n >> 7) & 127, n & 127];
  return new Uint8Array([...header, ...body]).buffer;
}

describe("id3", () => {
  it("reads utf-16, cp1251 and utf-8 text frames", () => {
    const tags = parseId3(tag([frame("TIT2", utf16("Ириски и риски")), frame("TPE1", cp1251("Монеточка")), frame("TALB", utf8("Раскраски"))]));
    expect(tags).toMatchObject({ title: "Ириски и риски", artist: "Монеточка", album: "Раскраски" });
  });

  it("keeps real latin1 text as latin1", () => {
    const latin = [0, ...[..."Café del Mar"].map((c) => c.charCodeAt(0))];
    expect(parseId3(tag([frame("TIT2", latin)])).title).toBe("Café del Mar");
  });

  it("reads cover art and embedded lyrics", () => {
    const apic = [0, ...[..."image/png"].map((c) => c.charCodeAt(0)), 0, 3, 0, 1, 2, 3, 4];
    const uslt = [3, 0x72, 0x75, 0x73, 0, ...new TextEncoder().encode("[00:01.00]привет")];
    const tags = parseId3(tag([frame("APIC", apic), frame("USLT", uslt)]));
    expect(tags.cover?.mime).toBe("image/png");
    expect(Array.from(tags.cover!.data)).toEqual([1, 2, 3, 4]);
    expect(tags.lyrics).toBe("[00:01.00]привет");
  });

  it("ignores files without a tag and falls back to the file name", () => {
    expect(parseId3(new Uint8Array([1, 2, 3]).buffer)).toEqual({});
    expect(tagsFromFileName("Монеточка - Каждый раз.mp3")).toEqual({ artist: "Монеточка", title: "Каждый раз" });
    expect(tagsFromFileName("track_01.mp3")).toEqual({ title: "track 01" });
  });

  it("tells LRC from plain text", () => {
    expect(detectLyricsFormat("[00:12.40] a\n[00:16.10] b\n\n[00:20] c")).toBe("lrc");
    expect(detectLyricsFormat("just words\nmore words")).toBe("plain");
  });
});
