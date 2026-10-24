// How far behind the playback clock the sound actually reaches the ears.
//
// When the <audio> element plays through the Web Audio graph (speed / pitch,
// reverb, the My Vibe analyser), the sound comes out `baseLatency +
// outputLatency` after the element's currentTime says it plays: a few tens of
// ms on wired output, 150–300 ms on Bluetooth headphones. Lyrics follow
// currentTime, so without this they run ahead of the singer.

const MAX_MS = 450;

export function lyricsOutputLatencyMs(): number {
  if (typeof window === "undefined") return 0;
  const win = window as unknown as { __liner_audio_context?: AudioContext; __liner_media_source_node?: unknown };
  const ctx = win.__liner_audio_context;
  // only when the element is actually routed through the context
  if (!ctx || !win.__liner_media_source_node || ctx.state !== "running") return 0;
  const seconds = (ctx.baseLatency || 0) + ((ctx as AudioContext & { outputLatency?: number }).outputLatency || 0);
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return Math.min(MAX_MS, Math.round(seconds * 1000));
}

// braccato's own lead (its defaults): lines and words start this much before
// their timestamp so they're lit as the syllable begins
const LINE_LEAD_S = 0.115;
const WORD_LEAD_S = 0.15;

type LyricsElement = HTMLElement & { renderer?: { engine?: { cachedDurations?: Map<string, number>; cachedCSSValues?: Map<string, unknown> } } };

/** shift braccato's timing leads by the current output latency */
export function applyLyricsLatency(el: LyricsElement, latencyMs: number): void {
  const lat = latencyMs / 1000;
  el.style.setProperty("--blyrics-timing-offset", `${(LINE_LEAD_S - lat).toFixed(3)}s`);
  el.style.setProperty("--blyrics-richsync-timing-offset", `${(WORD_LEAD_S - lat).toFixed(3)}s`);
  // the engine caches CSS durations; drop them so the new values are read
  const engine = el.renderer?.engine;
  engine?.cachedDurations?.clear();
  engine?.cachedCSSValues?.clear();
}
