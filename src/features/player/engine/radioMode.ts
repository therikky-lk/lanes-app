import type { RepeatMode } from "../store/playerStore";

// Radio ("Start radio" on a track) is an endless stream: the queue refills
// from the server before it runs out, so looping it back to the first track
// makes no sense. Repeat-one still works (stay on a track you like).

export const RADIO_CONTEXT_PREFIX = "radio:";

export function isRadioContext(context: string | null | undefined): boolean {
  return typeof context === "string" && context.startsWith(RADIO_CONTEXT_PREFIX);
}

/** what the repeat button switches to: off -> all -> one -> off, radio skips "all" */
export function nextRepeatMode(current: RepeatMode, radio: boolean): RepeatMode {
  if (radio) return current === "off" ? "one" : "off";
  if (current === "off") return "all";
  if (current === "all") return "one";
  return "off";
}

/**
 * Android hands this many upcoming tracks to the native player, which then
 * plays through them by itself while the page sleeps (screen off, another app
 * in front), so the music goes on for a good while without the app waking up.
 */
export const NATIVE_QUEUE_AHEAD = 10;

/**
 * refill the radio queue once this few tracks (or fewer) are left after the
 * current one: early enough that the native player always has a full
 * look-ahead of NATIVE_QUEUE_AHEAD tracks
 */
export const RADIO_REFILL_THRESHOLD = NATIVE_QUEUE_AHEAD;

export function shouldRefillRadio(queueLength: number, currentIndex: number): boolean {
  if (currentIndex < 0) return false;
  return queueLength - 1 - currentIndex <= RADIO_REFILL_THRESHOLD;
}
