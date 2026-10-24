import { useCallback, useEffect, useRef } from "react";

const HOLD_MS = 480;
const MOVE_TOLERANCE = 10;

/**
 * Touch-and-hold opens the same menu a right click does. Phones don't have a
 * right button, and a long press on a link in the Android web view doesn't
 * reliably fire `contextmenu`, so cards had no way to reach "Delete".
 * Spread the result onto the element that wraps the card.
 */
export function useLongPress(onLongPress: (point: { x: number; y: number }) => void, enabled = true) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const callback = useRef(onLongPress);
  callback.current = onLongPress;

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  useEffect(() => clear, [clear]);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled || e.touches.length !== 1) return;
      const touch = e.touches[0];
      start.current = { x: touch.clientX, y: touch.clientY };
      fired.current = false;
      clear();
      timer.current = setTimeout(() => {
        timer.current = null;
        if (!start.current) return;
        fired.current = true;
        try {
          navigator.vibrate?.(12);
        } catch {}
        callback.current(start.current);
      }, HOLD_MS);
    },
    [enabled, clear],
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      const origin = start.current;
      const touch = e.touches[0];
      if (!origin || !touch) return;
      if (Math.abs(touch.clientX - origin.x) > MOVE_TOLERANCE || Math.abs(touch.clientY - origin.y) > MOVE_TOLERANCE) {
        clear();
        start.current = null;
      }
    },
    [clear],
  );

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      clear();
      start.current = null;
      // the press opened the menu: don't let the lift turn into a tap on the card
      if (fired.current && e.cancelable) e.preventDefault();
    },
    [clear],
  );

  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (!fired.current) return;
    fired.current = false;
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const onContextMenuCapture = useCallback((e: React.MouseEvent) => {
    // the web view's own long-press menu (copy link, open in new tab…)
    if (fired.current || timer.current) e.preventDefault();
  }, []);

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onTouchCancel: onTouchEnd,
    onClickCapture,
    onContextMenuCapture,
    style: { WebkitTouchCallout: "none" } as React.CSSProperties,
  };
}
