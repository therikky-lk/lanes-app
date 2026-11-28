import { useLayoutEffect, useRef } from "react";

/** Keep a long expanded section from leaving the reader farther down the page on collapse. */
export function useSectionScrollRestore<T extends HTMLElement = HTMLElement>(expanded: boolean, smooth = true) {
  const anchorRef = useRef<T>(null);
  const savedScroll = useRef<{ scroller: HTMLElement; top: number } | null>(null);

  const remember = (anchor: HTMLElement | null = anchorRef.current) => {
    const scroller = anchor?.closest<HTMLElement>("[data-page-scroller]");
    savedScroll.current = scroller ? { scroller, top: scroller.scrollTop } : null;
  };

  useLayoutEffect(() => {
    if (expanded) return;
    const saved = savedScroll.current;
    savedScroll.current = null;
    if (!saved || Math.abs(saved.scroller.scrollTop - saved.top) < 1) return;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    saved.scroller.scrollTo({ top: saved.top, behavior: smooth && !reduceMotion ? "smooth" : "instant" });
  }, [expanded, smooth]);

  return { anchorRef, remember };
}
