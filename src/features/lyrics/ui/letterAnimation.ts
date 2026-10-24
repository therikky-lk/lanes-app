// Letter-by-letter lyrics: braccato lights a word with one gradient sweep; on top
// of it, each word with its own timing is split into letters, and the letters
// light up one after another across the word's duration (a short fade per
// letter plus a slight lift), in step with the song.
//
// braccato draws every line twice: the words themselves and, in a parallel
// "highlight run" laid over them, a lit copy. Both copies of a word are split
// the same way so the lift moves the letter and its light together.

import { lyricsOutputLatencyMs } from "../engine/lyricsLatency";

const WORD = "blyrics--word";
const HIGHLIGHT_RUN = "blyrics-highlight-run";
const ACTIVE_LINE = "blyrics--active";
const LINE_SYNCED = "blyrics-line-synced-word";
const RTL = "blyrics-rtl";
const SPLIT_ATTR = "data-lane-letters";
const LIT = "lane-ch-lit";
// braccato runs word-timed lines this much ahead of the audio
const RICHSYNC_LEAD_S = 0.15;

interface WordLetters {
  time: number;
  duration: number;
  base: HTMLElement[];
  lit: HTMLElement[];
  count: number;
}

type LyricsHost = HTMLElement & { currentTime?: number };

const segmenter: Intl.Segmenter | null =
  typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;

function graphemes(text: string): string[] {
  return segmenter ? Array.from(segmenter.segment(text), (s) => s.segment) : Array.from(text);
}

/** wrap every letter of a word in its own span (keeps <wbr> and spaces as they are) */
function splitWord(word: HTMLElement): HTMLElement[] {
  const letters: HTMLElement[] = [];
  for (const node of Array.from(word.childNodes)) {
    if (node.nodeType !== Node.TEXT_NODE) continue;
    const fragment = document.createDocumentFragment();
    for (const g of graphemes(node.textContent ?? "")) {
      if (/^\s+$/.test(g)) {
        fragment.appendChild(document.createTextNode(g));
        continue;
      }
      const span = document.createElement("span");
      span.className = "lane-ch";
      span.textContent = g;
      fragment.appendChild(span);
      letters.push(span);
    }
    node.replaceWith(fragment);
  }
  word.setAttribute(SPLIT_ATTR, "");
  return letters;
}

function splittable(word: HTMLElement): boolean {
  if (word.hasAttribute(SPLIT_ATTR)) return false;
  if (word.classList.contains(LINE_SYNCED) || word.classList.contains(RTL)) return false;
  if (word.closest(".blyrics-bidi-sensitive")) return false;
  const duration = Number.parseFloat(word.dataset.duration ?? "");
  return Number.isFinite(duration) && duration > 0;
}

export function attachLetterAnimation(host: LyricsHost): () => void {
  const words = new Map<HTMLElement, WordLetters>(); // keyed by the lit copy
  let touched = new Set<WordLetters>();
  let raf = 0;
  let scanQueued = false;
  let latencyS = lyricsOutputLatencyMs() / 1000;
  const latencyTimer = setInterval(() => (latencyS = lyricsOutputLatencyMs() / 1000), 2000);

  const scan = () => {
    scanQueued = false;
    for (const run of Array.from(host.querySelectorAll<HTMLElement>(`.${HIGHLIGHT_RUN}`))) {
      const baseRun = Array.from(run.parentElement?.children ?? []).find(
        (el) => el !== run && el.classList.contains("blyrics-bidi-run") && !el.classList.contains(HIGHLIGHT_RUN),
      );
      if (!baseRun) continue;
      const litWords = Array.from(run.querySelectorAll<HTMLElement>(`.${WORD}`));
      const baseWords = Array.from(baseRun.querySelectorAll<HTMLElement>(`.${WORD}`));
      if (litWords.length !== baseWords.length) continue;
      litWords.forEach((litWord, i) => {
        const baseWord = baseWords[i];
        if (!splittable(litWord) || !splittable(baseWord)) return;
        if (litWord.dataset.content !== baseWord.dataset.content) return;
        const lit = splitWord(litWord);
        const base = splitWord(baseWord);
        if (lit.length !== base.length || lit.length === 0) return;
        const time = Number.parseFloat(litWord.dataset.time ?? "0");
        const duration = Number.parseFloat(litWord.dataset.duration ?? "0");
        // each letter fades in over roughly its own share of the word
        const step = Math.min(Math.max((duration * 1000) / lit.length, 60), 260);
        for (const w of [litWord, baseWord]) w.style.setProperty("--lane-ch-dur", `${Math.round(step)}ms`);
        words.set(litWord, { time, duration, base, lit, count: 0 });
      });
    }
  };

  const queueScan = () => {
    if (scanQueued) return;
    scanQueued = true;
    requestAnimationFrame(scan);
  };

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

  const frame = () => {
    raf = requestAnimationFrame(frame);
    const now = (host.currentTime ?? 0) + RICHSYNC_LEAD_S - latencyS;
    const next = new Set<WordLetters>();
    for (const line of Array.from(host.querySelectorAll<HTMLElement>(`.${ACTIVE_LINE}`))) {
      for (const litWord of Array.from(line.querySelectorAll<HTMLElement>(`.${HIGHLIGHT_RUN} [${SPLIT_ATTR}]`))) {
        const word = words.get(litWord);
        if (!word) continue;
        const progress = word.duration > 0 ? (now - word.time) / word.duration : now >= word.time ? 1 : 0;
        const count = Math.max(0, Math.min(word.lit.length, Math.ceil(progress * word.lit.length)));
        setCount(word, count);
        next.add(word);
      }
    }
    // lines that just stopped being current go back to unlit letters
    for (const word of touched) if (!next.has(word)) setCount(word, 0);
    touched = next;
  };

  const observer = new MutationObserver(queueScan);
  observer.observe(host, { childList: true, subtree: true });
  queueScan();
  raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(raf);
    clearInterval(latencyTimer);
    observer.disconnect();
    words.clear();
    touched.clear();
  };
}
