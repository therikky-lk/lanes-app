import { useCallback, useEffect, useMemo, useRef } from "react";
import { usePlayerStore } from "@/features/player/store/playerStore";

export interface LyricsWord {
  timeMs: number;
  endMs: number;
  text: string;
}

export interface SyncedLine {
  timeMs: number;
  text: string;
  words?: LyricsWord[];
}

export function useLyricsAnimator({
  syncedLines,
  isActuallySynced,
  enabled,
  onActiveLineChange,
}: {
  syncedLines: SyncedLine[];
  isActuallySynced: boolean;
  enabled: boolean;
  onActiveLineChange: (indices: number[]) => void;
}) {
  const spansByLine = useRef(new Map<number, (HTMLElement | undefined)[]>());
  const progressBySpan = useRef(new WeakMap<HTMLElement, number>());
  const requestTick = useRef<(() => void) | null>(null);
  const onChange = useRef(onActiveLineChange);
  useEffect(() => {
    onChange.current = onActiveLineChange;
  }, [onActiveLineChange]);

  const lines = useMemo(() => syncedLines.map(line => ({
    timeMs: line.timeMs,
    secondary: /^\s*<[^>]+>/.test(line.text),
    words: line.words?.filter(word => word.text.trim().length > 0),
  })), [syncedLines]);

  const registerWordSpan = useCallback((lineIndex: number, wordIndex: number, totalWords: number, el: HTMLElement | null) => {
    let spans = spansByLine.current.get(lineIndex);
    if (!el) {
      if (!spans) return;
      spans[wordIndex] = undefined;
      if (!spans.some(Boolean)) spansByLine.current.delete(lineIndex);
      return;
    }
    if (!spans || spans.length !== totalWords) {
      spans = new Array(totalWords);
      spansByLine.current.set(lineIndex, spans);
    }
    spans[wordIndex] = el;
    requestTick.current?.();
  }, []);

  useEffect(() => {
    if (!enabled || !isActuallySynced || !lines.length) {
      onChange.current([]);
      return;
    }

    let { status, positionMs, durationMs } = usePlayerStore.getState();
    let anchorPosition = positionMs;
    let anchorTime = performance.now();
    let first = -2;
    let last = -2;
    let rafId: number | null = null;

    function schedule() {
      if (rafId === null) rafId = requestAnimationFrame(tick);
    }

    function tick(now: number) {
      rafId = null;
      const playing = status === "playing";
      const estimated = playing
        ? Math.min(durationMs || Infinity, Math.max(0, anchorPosition + now - anchorTime))
        : positionMs;

      let low = 0;
      let high = lines.length;
      while (low < high) {
        const middle = (low + high) >>> 1;
        if (estimated >= lines[middle].timeMs) low = middle + 1;
        else high = middle;
      }
      const end = low - 1;
      let start = end;
      while (start >= 0 && lines[start].secondary) start--;
      if (first !== start || last !== end) {
        first = start;
        last = end;
        const indices: number[] = [];
        for (let i = start; i >= 0 && i <= end; i++) indices.push(i);
        onChange.current(indices);
      }

      for (let i = start; i >= 0 && i <= end; i++) {
        const words = lines[i].words;
        const spans = spansByLine.current.get(i);
        if (!words || !spans || words.length !== spans.length) continue;
        for (let j = 0; j < words.length; j++) {
          const span = spans[j];
          if (!span) continue;
          const { timeMs, endMs } = words[j];
          const progress = estimated < timeMs ? 0 : estimated >= endMs ? 1000
            : Math.round((estimated - timeMs) / (endMs - timeMs) * 1000) || 0;
          if (progressBySpan.current.get(span) === progress) continue;
          progressBySpan.current.set(span, progress);
          span.style.setProperty("--lane-word-progress", `${progress / 10}%`);
        }
      }

      if (playing) schedule();
    }

    const unsubscribe = usePlayerStore.subscribe((state) => {
      if (state.positionMs === positionMs && state.status === status && state.durationMs === durationMs) return;
      const now = performance.now();
      if (state.status !== status || state.status !== "playing" ||
          Math.abs(anchorPosition + now - anchorTime - state.positionMs) > 150) {
        anchorPosition = state.positionMs;
        anchorTime = now;
      }
      ({ status, positionMs, durationMs } = state);
      schedule();
    });
    requestTick.current = schedule;
    schedule();
    return () => {
      unsubscribe();
      requestTick.current = null;
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [enabled, isActuallySynced, lines]);

  return { registerWordSpan };
}
