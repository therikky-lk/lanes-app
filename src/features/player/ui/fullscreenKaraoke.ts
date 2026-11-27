import type { Lyric } from "@braccato/parsers";
import type { LyricsDisplayMode } from "@/features/lyrics/store/lyricsStore";

export function fullscreenLyricsForMode(
  source: Lyric[], format: string | null, mode: LyricsDisplayMode, durationMs?: number,
): Lyric[] {
  if (format === null || format === "plain") return source;
  if (mode === "karaoke") return withInstrumentalNotes(fullscreenKaraoke(source, durationMs), durationMs);
  // In source mode, LRC stays line-synced even when the catalog supplies Enhanced LRC.
  const lines = format === "lrc" && source.some(line => line.parts?.length)
    ? source.map(line => line.parts?.length ? { ...line, parts: undefined } : line)
    : source;
  return withInstrumentalNotes(lines, durationMs);
}

const isVocalLine = (line: Lyric | undefined): line is Lyric =>
  !!line && !line.isInstrumental && /[\p{L}\p{N}]/u.test(line.words);

const MIN_INTRO_MS = 1_500;
const MIN_BREAK_MS = 3_000;
const MAX_ESTIMATED_PHRASE_MS = 9_000;

function sungEnd(line: Lyric): number {
  const lastTimedWord = line.parts?.reduce((end, part) => part.words.trim() && part.durationMs > 0
    ? Math.max(end, part.startTimeMs + part.durationMs)
    : end, 0);
  return lastTimedWord || line.startTimeMs + Math.max(line.durationMs, 0);
}

/** Feed timed breaks to Braccato's progress-note renderer, without altering the source. */
function withInstrumentalNotes(lines: Lyric[], trackDurationMs = 0): Lyric[] {
  if (!lines.some(line => isVocalLine(line) && (line.startTimeMs > 0 || line.durationMs > 0))) return lines;
  const view: Lyric[] = [];
  let changed = false;
  let coveredUntil = 0;
  let hasKnownEnd = false;

  function addNote(start: number, end: number) {
    const previous = view.at(-1);
    if (previous && !previous.isInstrumental && previous.startTimeMs + previous.durationMs > start) {
      view[view.length - 1] = { ...previous, durationMs: Math.max(0, start - previous.startTimeMs) };
    }
    view.push({ startTimeMs: start, durationMs: end - start, words: "", isInstrumental: true });
    coveredUntil = Math.max(coveredUntil, end);
    changed = true;
  }

  for (const [index, line] of lines.entries()) {
    const start = Math.max(0, line.startTimeMs);
    const marker = !line.words.trim() || /^[\s♪♫♬♩.·…]+$/u.test(line.words) ||
      /^\s*[\[(](?:instrumental|intro|outro|break|инструментал|вступление|проигрыш)[\])]\s*$/iu.test(line.words);
    if (line.isInstrumental || marker) {
      const end = start + (line.durationMs > 0 ? line.durationMs : (lines[index + 1]?.startTimeMs ?? start) - start);
      if (line.isInstrumental && line.durationMs > 0) {
        view.push(line);
        coveredUntil = Math.max(coveredUntil, end);
      } else if (end - start >= MIN_INTRO_MS) {
        addNote(start, end);
      } else {
        view.push(line);
      }
      hasKnownEnd = coveredUntil > start;
      continue;
    }

    if (!index && start >= MIN_INTRO_MS) addNote(0, start);
    else if (hasKnownEnd && start - coveredUntil >= MIN_BREAK_MS) addNote(coveredUntil, start);
    view.push(line);
    const end = sungEnd(line);
    coveredUntil = Math.max(coveredUntil, end);
    hasKnownEnd = end > start;
  }
  if (hasKnownEnd && !view.at(-1)?.isInstrumental && trackDurationMs - coveredUntil >= MIN_BREAK_MS) {
    addNote(coveredUntil, trackDurationMs);
  }
  return changed ? view : lines;
}

/**
 * Estimate a sweep only for lines with source timestamps. The store and
 * provider metadata keep their original sync level.
 */
export function fullscreenKaraoke(source: Lyric[], trackDurationMs = 0) {
  if (!source.some(line => line.startTimeMs > 0 || line.durationMs > 0)) {
    return source;
  }

  const cueSpans = source.map((line, index) => {
    const next = source[index + 1];
    if (!isVocalLine(line) || !isVocalLine(next)) return 0;
    const gap = next.startTimeMs - line.startTimeMs;
    return gap >= 250 && gap <= MAX_ESTIMATED_PHRASE_MS ? gap : 0;
  });
  const phraseSpans = cueSpans.filter(gap => gap > 0).sort((a, b) => a - b);
  const typicalPhraseMs = phraseSpans[Math.floor(phraseSpans.length / 2)] ?? 3_000;
  const maxVocalGapMs = Math.max(6_000, Math.min(MAX_ESTIMATED_PHRASE_MS, typicalPhraseMs * 1.85));

  function hasSimilarNearbyCue(index: number, gap: number): boolean {
    // Verses can alternate a drawn-out phrase and a short answer. A similar
    // nearby gap supports stretching the sweep instead of guessing a break.
    for (const direction of [-1, 1]) {
      for (let step = 1; step <= 3; step++) {
        const nearby = cueSpans[index + direction * step];
        if (!nearby) break; // Don't look across an instrumental marker or long break.
        if (Math.abs(nearby - gap) <= 1_000) return true;
      }
    }
    return false;
  }

  let changed = false;
  const lyrics = source.map((line, index): Lyric => {
    if (!isVocalLine(line) || line.parts?.length) return line;

    const start = line.startTimeMs;
    const nextLine = source[index + 1];
    const next = nextLine?.startTimeMs ?? Infinity;
    const trackEnd = trackDurationMs > 0 ? trackDurationMs : Infinity;
    const windowMs = Math.min(next - start, trackEnd - start, line.durationMs || Infinity);
    if (windowMs <= 0 || !Number.isFinite(start)) return line;

    const tokens = line.words.match(/\s*\S+\s*/gu) ?? [];
    if (!tokens.length) return line;
    // Between credible lyric cues use the source's phrasing, not a fixed word
    // speed. A separate end timestamp also gives a usable window. Long breaks
    // and unanchored endings still use a bounded estimate.
    const hasTimedEnd = line.durationMs > 0 && line.durationMs + 80 < next - start;
    const cueSpan = cueSpans[index];
    const useCueWindow = hasTimedEnd || (cueSpan > 0 &&
      (windowMs <= maxVocalGapMs || hasSimilarNearbyCue(index, cueSpan)));
    const stretched = useCueWindow && windowMs / tokens.length >= 750;
    const weights = tokens.map((token, i) => (2 + Math.sqrt(Array.from(token.trim()).length)) *
      (stretched && i === tokens.length - 1 ? 1.18 : 1));
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    // A sparse phrase with only a next-line timestamp usually leaves a breath
    // before the next cue. Don't stretch the last word all the way to it.
    const sparseCue = !hasTimedEnd && windowMs >= 7_000 && windowMs / tokens.length >= 1_500;
    const tailMs = sparseCue ? Math.min(windowMs * 0.18, 1_500) : Math.min(windowMs * 0.1, 350);
    const durationMs = Math.round(useCueWindow
      ? windowMs - tailMs
      : Math.min(windowMs * 0.82, Math.max(650, tokens.length * 450)));
    if (durationMs < tokens.length) return line;
    let elapsed = 0;
    const parts = tokens.map((words, i) => {
      const from = Math.round(durationMs * elapsed / total);
      elapsed += weights[i];
      return {
        startTimeMs: start + from,
        durationMs: Math.round(durationMs * elapsed / total) - from,
        words,
      };
    });
    changed = true;
    return {
      ...line,
      durationMs: line.durationMs || durationMs,
      parts,
    };
  });
  return changed ? lyrics : source;
}
