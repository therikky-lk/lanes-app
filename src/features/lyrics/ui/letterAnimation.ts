// Braccato draws the original line and a lit copy. Advance through the lit
// copy by grapheme, keeping the entire sung prefix of each active line lit.
import { WORD_LEAD_S } from "../engine/lyricsLatency";
import { isLowEndDevice } from "@/shared/platform/deviceTier";

const WORD = "blyrics--word";
const HIGHLIGHT_RUN = "blyrics-highlight-run";
const LYRICS_LOADED = "braccato:lyrics-loaded";
const LINE_SYNCED = "blyrics-line-synced-word";
const RTL = "blyrics-rtl";
const SPLIT_ATTR = "data-lane-letters";
const GLOW_ATTR = "data-lane-letter-glow";
const LIT = "lane-ch-lit";
const FINISH_HOLD_S = 0.65;
const PREPARE_AHEAD_S = 0.18;
const FRAME_MS = isLowEndDevice() ? 40 : 32;
const MAX_PREPARED_LINES = 8;
const SUSTAINED_WORD_S = 0.68;

interface WordLetters {
  element: HTMLElement;
  baseElement: HTMLElement;
  time: number;
  duration: number;
  base: HTMLElement[];
  lit: HTMLElement[];
  count: number;
  canGlow: boolean;
  glowing: boolean;
}

type LyricsHost = HTMLElement & { currentTime?: number; tickOptions?: { lyricOffset?: number; richsyncOffsetTrim?: number } };

interface TimedLine {
  element: HTMLElement;
  start: number;
  end: number;
  prefixEnd: number;
  key: string;
  words?: WordLetters[];
}

const segmenter =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : null;

function graphemes(text: string): string[] {
  return segmenter ? Array.from(segmenter.segment(text), s => s.segment) : Array.from(text);
}

function splitWord(word: HTMLElement): HTMLElement[] {
  const letters: HTMLElement[] = [];
  const doc = word.ownerDocument;
  for (const node of Array.from(word.childNodes)) {
    if (node.nodeType !== Node.TEXT_NODE) continue;
    const fragment = doc.createDocumentFragment();
    for (const letter of graphemes(node.textContent ?? "")) {
      if (/^\s+$/u.test(letter)) {
        fragment.appendChild(doc.createTextNode(letter));
        continue;
      }
      const span = doc.createElement("span");
      span.className = "lane-ch";
      span.textContent = letter;
      fragment.appendChild(span);
      letters.push(span);
    }
    node.replaceWith(fragment);
  }
  word.setAttribute(SPLIT_ATTR, "");
  return letters;
}

function splittable(word: HTMLElement): boolean {
  if (word.hasAttribute(SPLIT_ATTR) || word.classList.contains(LINE_SYNCED) || word.classList.contains(RTL)) return false;
  if (word.closest(".blyrics-bidi-sensitive")) return false;
  const duration = Number(word.dataset.duration);
  return Number.isFinite(duration) && duration > 0;
}

export function attachLetterAnimation(host: LyricsHost): () => void {
  let lines: TimedLine[] = [];
  const repetitions = new Map<string, number>();
  const prepared = new Set<TimedLine>();
  let active = new Set<TimedLine>();
  let next = new Set<TimedLine>();
  let raf = 0;
  let needsIndex = true;
  let lastFrame = -Infinity;
  let lastTime = NaN;

  const restoreWord = (word: HTMLElement, letters: HTMLElement[]) => {
    for (const letter of letters) letter.replaceWith(word.ownerDocument.createTextNode(letter.textContent ?? ""));
    word.removeAttribute(SPLIT_ATTR);
    word.removeAttribute(GLOW_ATTR);
    word.style.removeProperty("--lane-ch-dur");
    word.normalize();
  };

  const release = (line: TimedLine) => {
    if (host.contains(line.element)) {
      for (const pair of line.words ?? []) {
        restoreWord(pair.element, pair.lit);
        restoreWord(pair.baseElement, pair.base);
      }
    }
    line.words = undefined;
    prepared.delete(line);
  };

  function indexLines() {
    for (const line of prepared) release(line);
    active.clear();
    repetitions.clear();
    lines = [];
    for (const element of host.querySelectorAll<HTMLElement>(".blyrics--line:not([data-instrumental])")) {
      let start = Infinity;
      let end = -Infinity;
      // Index the provider's timestamps once. Looking ahead in the index is
      // cheap; splitting two copies of every letter in the song is not.
      const words = element.querySelectorAll<HTMLElement>(`.${HIGHLIGHT_RUN} .${WORD}`);
      for (const word of words) {
        if (!splittable(word)) continue;
        const time = Number(word.dataset.time);
        if (!Number.isFinite(time)) continue;
        start = Math.min(start, time);
        end = Math.max(end, time + Number(word.dataset.duration));
      }
      if (!(end > start)) continue;
      const key = element.querySelector(`.blyrics-line-main .${HIGHLIGHT_RUN}`)?.textContent
        ?.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim() ?? "";
      if (key.includes(" ") && key.length >= 8) repetitions.set(key, (repetitions.get(key) ?? 0) + 1);
      lines.push({ element, start, end, prefixEnd: end, key });
    }
    lines.sort((a, b) => a.start - b.start);
    for (let i = 1; i < lines.length; i++) lines[i].prefixEnd = Math.max(lines[i - 1].prefixEnd, lines[i].end);
    needsIndex = false;
    lastTime = NaN;
  }

  function prepare(line: TimedLine): WordLetters[] {
    if (line.words) return line.words;
    const words: WordLetters[] = [];
    const refrain = (repetitions.get(line.key) ?? 0) > 1;
    for (const run of line.element.querySelectorAll<HTMLElement>(`.${HIGHLIGHT_RUN}`)) {
      const baseRun = Array.from(run.parentElement?.children ?? []).find(
        el => el !== run && el.classList.contains("blyrics-bidi-run") && !el.classList.contains(HIGHLIGHT_RUN),
      );
      if (!baseRun) continue;
      const litWords = [...run.querySelectorAll<HTMLElement>(`.${WORD}`)];
      const baseWords = [...baseRun.querySelectorAll<HTMLElement>(`.${WORD}`)];
      if (litWords.length !== baseWords.length) continue;
      litWords.forEach((litWord, index) => {
        const baseWord = baseWords[index];
        const time = Number(litWord.dataset.time);
        if (!Number.isFinite(time) || !splittable(litWord) || !splittable(baseWord)) return;
        if (litWord.dataset.content !== baseWord.dataset.content) return;
        const lit = splitWord(litWord);
        const base = splitWord(baseWord);
        if (lit.length !== base.length || lit.length === 0) {
          restoreWord(litWord, lit);
          restoreWord(baseWord, base);
          return;
        }
        const duration = Number(litWord.dataset.duration);
        const step = Math.min(Math.max(duration * 1000 / lit.length, 60), 260);
        for (const word of [litWord, baseWord]) word.style.setProperty("--lane-ch-dur", `${Math.round(step)}ms`);
        words.push({
          element: litWord, baseElement: baseWord, time, duration, lit, base, count: 0,
          canGlow: duration >= SUSTAINED_WORD_S || refrain,
          glowing: false,
        });
      });
    }
    line.words = words;
    prepared.add(line);
    return words;
  }

  const setCount = (word: WordLetters, count: number) => {
    if (word.count === count) return;
    const from = Math.min(word.count, count);
    const to = Math.max(word.count, count);
    const on = count > word.count;
    for (let i = from; i < to; i++) {
      word.lit[i].classList.toggle(LIT, on);
      word.base[i].classList.toggle(LIT, on);
    }
    word.count = count;
  };

  const frame = (timestamp: number) => {
    raf = requestAnimationFrame(frame);
    if (needsIndex) {
      indexLines();
      lastFrame = -Infinity;
    }
    if (timestamp - lastFrame < FRAME_MS) return;
    const now = (host.currentTime ?? 0) + WORD_LEAD_S
      - (host.tickOptions?.richsyncOffsetTrim ?? 0) - (host.tickOptions?.lyricOffset ?? 0);
    if (!Number.isFinite(now) || now === lastTime) return;
    lastFrame = timestamp;
    lastTime = now;

    // Scroll can move early to preview what's next. Keep lighting the current
    // line until its actual last timestamp, even after another line scrolls in.
    let low = 0;
    let high = lines.length;
    while (low < high) {
      const center = (low + high) >>> 1;
      if (lines[center].start <= now + PREPARE_AHEAD_S) low = center + 1;
      else high = center;
    }
    for (let i = low - 1; i >= 0 && lines[i].prefixEnd + FINISH_HOLD_S >= now; i--) {
      const line = lines[i];
      if (line.end + FINISH_HOLD_S < now) continue;
      next.add(line);
      for (const word of prepare(line)) {
        const progress = (now - word.time) / word.duration;
        const count = Math.max(0, Math.min(word.lit.length, Math.ceil(progress * word.lit.length)));
        setCount(word, count);
        const glowing = word.canGlow && progress >= 0 && progress < 1;
        if (word.glowing !== glowing) {
          word.glowing = glowing;
          word.element.toggleAttribute(GLOW_ATTR, glowing);
        }
      }
    }
    for (const line of active) {
      if (next.has(line)) continue;
      for (const word of line.words ?? []) {
        if (word.glowing) {
          word.glowing = false;
          word.element.removeAttribute(GLOW_ATTR);
        }
        setCount(word, 0);
      }
    }
    const previous = active;
    active = next;
    next = previous;
    next.clear();
    for (const line of prepared) {
      if (prepared.size <= MAX_PREPARED_LINES) break;
      if (!active.has(line)) release(line);
    }
  };

  const lyricsLoaded = () => { needsIndex = true; };
  host.addEventListener(LYRICS_LOADED, lyricsLoaded);
  raf = requestAnimationFrame(frame);
  return () => {
    cancelAnimationFrame(raf);
    host.removeEventListener(LYRICS_LOADED, lyricsLoaded);
    for (const line of prepared) release(line);
  };
}
