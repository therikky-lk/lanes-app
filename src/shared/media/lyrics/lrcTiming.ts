import type { LyricsCandidate } from "@/shared/contracts/lyrics";

/** A long unmarked tail can indicate a shortened recording with the full release's metadata. */
export function hasSuspiciousLrcTiming(content: string, durationMs?: number): boolean {
  if (!durationMs || !Number.isFinite(durationMs)) return false;
  let lastCueMs = 0;
  let vocalLines = 0;
  for (const line of content.split(/\r?\n/)) {
    if (!/^\s*\[\d+:\d{2}/.test(line)) continue;
    if (/[\p{L}\p{N}]/u.test(line.replace(/\[[^\]]*\]|<[^>]*>/g, ""))) vocalLines++;
    // Include empty end markers and Enhanced LRC word cues as evidence for an intentional outro.
    for (const [, minutes, seconds, fraction = ""] of line.matchAll(/[<\[](\d+):(\d{2})(?:[.:](\d{1,3}))?[>\]]/g)) {
      const timeMs = Number(minutes) * 60_000 + Number(seconds) * 1_000 + Number(fraction.padEnd(3, "0"));
      lastCueMs = Math.max(lastCueMs, timeMs);
    }
  }
  return vocalLines >= 8 && durationMs - lastCueMs >= Math.max(30_000, durationMs * 0.2);
}

export function hasSuspiciousLrclibTiming(candidate: LyricsCandidate, durationMs?: number): boolean {
  return /^lrclib$/i.test(candidate.provider.trim()) && candidate.lyrics.format === "lrc" &&
    hasSuspiciousLrcTiming(candidate.lyrics.content, durationMs ?? candidate.matchedTrack?.durationMs);
}
