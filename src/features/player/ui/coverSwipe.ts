export function coverSwipeIntent(dx: number, dy: number): "next" | "previous" | null {
  if (Math.abs(dx) < 56 || Math.abs(dx) <= Math.abs(dy) * 1.25) return null;
  return dx < 0 ? "next" : "previous";
}

/** Neighboring covers sit behind the centered cover and grow as they arrive. */
export function coverSlideScale(offset: number, step: number, index: -1 | 0 | 1): number {
  const distance = Math.abs(offset / Math.max(1, step) + index);
  return 1 - 0.16 * Math.min(1, distance);
}
