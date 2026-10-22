// Lyrics the user typed or pasted themselves (LRC or plain text), per track.
// They win over every other source and live on this device.
import type { LyricsCandidate } from "@/shared/contracts/lyrics";

export interface CustomLyrics {
  content: string;
  format: "lrc" | "plain";
  updatedAt: number;
}

const STORAGE_KEY = "lane_custom_lyrics_v1";
export const CUSTOM_LYRICS_PROVIDER = "My lyrics";
export const CUSTOM_LYRICS_EVENT = "lane:custom-lyrics-changed";

const LRC_LINE = /^\s*\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/;

/** LRC when most non-empty lines carry a [mm:ss.xx] timestamp */
export function detectLyricsFormat(text: string): "lrc" | "plain" {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return "plain";
  const timed = lines.filter((l) => LRC_LINE.test(l)).length;
  return timed >= Math.max(1, Math.ceil(lines.length * 0.5)) ? "lrc" : "plain";
}

function readAll(): Record<string, CustomLyrics> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") as Record<string, CustomLyrics>;
  } catch {
    return {};
  }
}

export function getCustomLyrics(trackId: string | null | undefined): CustomLyrics | null {
  if (!trackId) return null;
  return readAll()[trackId] ?? null;
}

export function setCustomLyrics(trackId: string, text: string): CustomLyrics | null {
  const content = text.replace(/\r\n/g, "\n").trim();
  const all = readAll();
  if (!content) {
    delete all[trackId];
  } else {
    all[trackId] = { content, format: detectLyricsFormat(content), updatedAt: Date.now() };
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {}
  window.dispatchEvent(new CustomEvent(CUSTOM_LYRICS_EVENT, { detail: { trackId } }));
  return all[trackId] ?? null;
}

export function customLyricsCandidate(custom: CustomLyrics): LyricsCandidate {
  const synced = custom.format === "lrc";
  return {
    provider: CUSTOM_LYRICS_PROVIDER,
    lyrics: { format: custom.format, content: custom.content },
    syncHint: synced ? "line_synced" : "plain",
    contentKind: synced ? "line_synced" : "plain",
    syncLevel: synced ? "line_level" : "plain",
    topPriority: true,
    quality: { total: 100, match: 100, content: 100, sync: synced ? 100 : 0, source: 100, reasons: ["added by the user"] },
  };
}
