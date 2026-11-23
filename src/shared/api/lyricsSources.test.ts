import { afterEach, describe, expect, it, vi } from "vitest";
import type { LyricsCandidate, LyricsStreamEvent } from "@/shared/contracts/lyrics";
import { collectLyricsSources, getPublicLyricsCatalog, lyricsTargets } from "./lyricsSources";
import { decodeLyricsStream } from "./lyricsStream";

afterEach(() => vi.restoreAllMocks());

const found = (provider: string): LyricsStreamEvent => ({
  type: "provider", provider, status: "found", syncLevel: "line_level",
  candidate: { provider, syncLevel: "line_level", contentKind: "line_synced",
    lyrics: { format: "lrc", content: "[00:01.00]Words" },
    quality: { total: 80, match: 100, content: 100, sync: 60, source: 50, reasons: [] },
  } satisfies LyricsCandidate,
});
const done: LyricsStreamEvent = { type: "done", cached: false };
async function* source(...events: LyricsStreamEvent[]) { yield* events; }
async function collect(stream: AsyncIterable<LyricsStreamEvent>) {
  const events: LyricsStreamEvent[] = [];
  for await (const event of stream) events.push(event);
  return events;
}

describe("lyrics catalog routing", () => {
  it("opts into a public HTTPS catalog without forwarding account credentials", () => {
    expect(getPublicLyricsCatalog(" https://lyrics.example/ ")).toBe("https://lyrics.example");
    expect(getPublicLyricsCatalog("http://lyrics.example")).toBeUndefined();
    expect(getPublicLyricsCatalog("https://secret@lyrics.example")).toBeUndefined();
    expect(lyricsTargets("https://catalog", "https://account", "hyprr", "private", false, "https://lyrics.example")).toEqual([
      { baseUrl: "https://lyrics.example", token: null, publicCatalog: true },
      { baseUrl: "https://account", token: "private" },
    ]);
  });
  it("does not send anonymous requests to Liner or share the new account token with it", () => {
    expect(lyricsTargets("https://catalog", "https://account", "hyprr", "private")).toEqual([
      { baseUrl: "https://account", token: "private" },
    ]);
  });
  it("uses client providers without a token and preserves the local preview bridge", () => {
    expect(lyricsTargets("https://catalog", "https://account", undefined, null)).toEqual([]);
    expect(lyricsTargets("https://catalog", "https://account", "hyprr", "private", true)).toEqual([
      { baseUrl: "https://catalog", token: null },
    ]);
  });
  it("keeps legacy authentication on the original catalog", () => {
    expect(lyricsTargets("https://catalog", "https://catalog", undefined, "legacy")).toEqual([
      { baseUrl: "https://catalog", token: "legacy" },
    ]);
  });
});

describe("provider collection", () => {
  it("keeps every Liner variant and emits only one final completion", async () => {
    const fallback = vi.fn(() => source(found("LRCLIB"), done));
    const result = await collect(collectLyricsSources([
      () => source(found("Cadence"), found("Polaris"), found("LRCLIB"), done),
    ], fallback));
    expect(result.filter(e => e.type === "provider")).toHaveLength(3);
    expect(result.at(-1)).toMatchObject({ type: "done", source: "server" });
    expect(fallback).not.toHaveBeenCalled();
  });
  it("tries the account service if the catalog rejects anonymous access", async () => {
    vi.spyOn(console, "warn").mockImplementationOnce(() => {});
    const result = await collect(collectLyricsSources([
      async function* () { throw new Error("401"); },
      () => source(found("Polaris"), done),
    ], () => source(done)));
    expect(result[0]).toMatchObject({ provider: "Polaris" });
    expect(result.at(-1)).toMatchObject({ source: "server" });
  });
  it("does not treat an empty catalog response as the final answer", async () => {
    const result = await collect(collectLyricsSources([
      () => source(done), () => source(found("Cadence"), done),
    ], () => source(done)));
    expect(result[0]).toMatchObject({ provider: "Cadence" });
  });
  it("preserves partial server results and supplements them without duplicates", async () => {
    vi.spyOn(console, "warn").mockImplementationOnce(() => {});
    const result = await collect(collectLyricsSources([
      async function* () { yield found("LRCLIB"); throw new Error("Disconnected"); },
    ], () => source(found("LRCLIB"), found("YouTube Music"), done)));
    expect(result.filter(e => e.type === "provider").map(e => e.provider)).toEqual(["LRCLIB", "YouTube Music"]);
    expect(result.at(-1)).toMatchObject({ source: "fallback" });
  });
  it("marks fallback results for another server check", async () => {
    const result = await collect(collectLyricsSources([() => source(done)], () => source(found("LRCLIB"), done)));
    expect(result.at(-1)).toMatchObject({ source: "fallback" });
  });
  it("keeps partial results provisional when a later service returns no providers", async () => {
    vi.spyOn(console, "warn").mockImplementationOnce(() => {});
    const result = await collect(collectLyricsSources([
      async function* () { yield found("Cadence"); throw new Error("Disconnected"); },
      () => source(done),
    ], () => source(found("LRCLIB"), done)));
    expect(result.filter(e => e.type === "provider")).toHaveLength(2);
    expect(result.at(-1)).toMatchObject({ source: "fallback" });
  });
  it("respects a known instrumental and cancellation", async () => {
    const fallback = vi.fn(() => source(done));
    const result = await collect(collectLyricsSources([() => source({ ...done, instrumental: true })], fallback));
    expect(result.at(-1)).toMatchObject({ instrumental: true });
    expect(fallback).not.toHaveBeenCalled();
    const controller = new AbortController(); controller.abort();
    await expect(collect(collectLyricsSources([() => source(done)], fallback, controller.signal))).rejects.toThrow();
  });
});

it("decodes all providers across heartbeats, split chunks, CRLF and final EOF", async () => {
  const content = `: heartbeat\r\n\r\ndata: ${JSON.stringify(found("Cadence"))}\r\n\r\ndata: ${JSON.stringify(found("Polaris"))}\r\n\r\ndata: ${JSON.stringify(done)}`;
  const bytes = new TextEncoder().encode(content);
  const response = new Response(new ReadableStream({ start(controller) {
    for (let i = 0; i < bytes.length; i += 11) controller.enqueue(bytes.slice(i, i + 11));
    controller.close();
  } }), { headers: { "content-type": "text/event-stream" } });
  expect(await collect(decodeLyricsStream(response))).toEqual([found("Cadence"), found("Polaris"), done]);
});
