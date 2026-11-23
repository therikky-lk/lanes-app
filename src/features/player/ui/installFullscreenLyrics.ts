import type { BraccatoLyricsElement } from "@braccato/core/element";

/** Let Braccato position a fresh layout before enabling its per-line scroll animation. */
export function installFullscreenLyrics(element: BraccatoLyricsElement, lyrics: NonNullable<BraccatoLyricsElement["lyrics"]>) {
  const options = element.tickOptions;
  element.tickOptions = { ...options, smoothScroll: false };
  element.lyrics = lyrics;

  // The first paint and any initial resize measurement must happen without FLIP offsets.
  let frame = requestAnimationFrame(() => {
    frame = requestAnimationFrame(restore);
  });
  function restore() {
    element.tickOptions = { ...element.tickOptions, smoothScroll: options.smoothScroll };
  }
  return () => {
    cancelAnimationFrame(frame);
    restore();
  };
}
