import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { coverSwipeIntent } from "./coverSwipe";

/** Only transform the text layer during a drag; the player shell stays still. */
export default function MiniPlayerTrackInfo({ trackId, children, previous, next, onSwipe }: {
  trackId: string;
  children: ReactNode;
  previous?: ReactNode;
  next?: ReactNode;
  onSwipe: (direction: "next" | "previous") => void;
}) {
  const text = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ id: number; x: number; y: number; trackId: string; horizontal: boolean } | null>(null);
  const suppressClick = useRef(false);
  const animation = useRef<Animation | null>(null);
  const frame = useRef<number | null>(null);
  const generation = useRef(0);
  const pendingSwap = useRef<{ id: string; timer: ReturnType<typeof setTimeout> } | null>(null);
  const currentId = useRef(trackId);
  currentId.current = trackId;

  const reset = (smooth = true) => {
    const element = text.current;
    if (!element) return;
    const from = element.style.transform || "translateX(0px)";
    generation.current++;
    if (pendingSwap.current) {
      clearTimeout(pendingSwap.current.timer);
      pendingSwap.current = null;
    }
    animation.current?.cancel();
    animation.current = null;
    element.style.transform = "translateX(0px)";
    if (smooth && element.animate) {
      animation.current = element.animate([{ transform: from }, { transform: "translateX(0px)" }], { duration: 200, easing: "cubic-bezier(.22,1,.36,1)" });
      void animation.current.finished.catch(() => {});
    }
  };
  useLayoutEffect(() => {
    if (pendingSwap.current && pendingSwap.current.id !== trackId) {
      clearTimeout(pendingSwap.current.timer);
      pendingSwap.current = null;
      reset(false);
    }
    if (gesture.current && gesture.current.trackId !== trackId) {
      gesture.current = null;
      reset(false);
    }
  }, [trackId]);
  useEffect(() => () => {
    generation.current++;
    animation.current?.cancel();
    if (pendingSwap.current) clearTimeout(pendingSwap.current.timer);
    if (frame.current !== null) cancelAnimationFrame(frame.current);
  }, []);

  return (
    <div
      data-mini-track-swipe
      className="min-w-0 flex-1 select-none overflow-hidden"
      style={{ touchAction: "pan-y" }}
      onPointerDown={(event) => {
        if (!event.isPrimary || event.button !== 0) return;
        reset(false);
        suppressClick.current = false;
        gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, trackId, horizontal: false };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const start = gesture.current;
        if (!start || start.id !== event.pointerId || !text.current) return;
        const dx = event.clientX - start.x;
        const dy = event.clientY - start.y;
        if (Math.hypot(dx, dy) > 8) suppressClick.current = true;
        if (!start.horizontal && Math.abs(dy) > 8 && Math.abs(dy) >= Math.abs(dx)) { gesture.current = null; reset(); return; }
        if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.25) start.horizontal = true;
        if (start.horizontal) {
          const width = event.currentTarget.clientWidth || 160;
          text.current.style.transform = `translateX(${Math.max(-width, Math.min(width, dx))}px)`;
        }
      }}
      onPointerUp={(event) => {
        const start = gesture.current;
        if (!start || start.id !== event.pointerId) return;
        gesture.current = null;
        const dx = event.clientX - start.x;
        const dy = event.clientY - start.y;
        if (Math.hypot(dx, dy) > 8) suppressClick.current = true;
        const direction = coverSwipeIntent(dx, dy);
        const element = text.current;
        if (!direction || start.trackId !== currentId.current || !element) { reset(); return; }
        if (!element.animate) { reset(false); onSwipe(direction); return; }
        const token = ++generation.current;
        animation.current?.cancel();
        const sign = direction === "next" ? -1 : 1;
        const width = event.currentTarget.clientWidth || 160;
        animation.current = element.animate([
          { transform: element.style.transform || `translateX(${dx}px)`, opacity: 1 },
          { transform: `translateX(${sign * (width)}px)`, opacity: previous || next ? 1 : 0 },
        ], { duration: 220, easing: "cubic-bezier(.4,0,.2,1)", fill: "forwards" });
        void animation.current.finished.then(() => {
          if (generation.current !== token || currentId.current !== start.trackId) { reset(false); return; }
          if (previous || next) {
            pendingSwap.current = { id: start.trackId, timer: setTimeout(() => { pendingSwap.current = null; reset(false); }, 650) };
            onSwipe(direction);
            return;
          }
          onSwipe(direction);
          frame.current = requestAnimationFrame(() => {
            frame.current = null;
            if (generation.current !== token || !text.current) return;
            animation.current?.cancel();
            text.current.style.transform = "translateX(0px)";
            if (previous || next) return;
            animation.current = text.current.animate([
              { transform: `translateX(${-sign * 24}px)`, opacity: 0 },
              { transform: "translateX(0px)", opacity: 1 },
            ], { duration: 200, easing: "cubic-bezier(.22,1,.36,1)" });
            void animation.current.finished.catch(() => {});
          });
        }).catch(() => {});
      }}
      onPointerCancel={() => { gesture.current = null; suppressClick.current = true; reset(); }}
      onLostPointerCapture={(event) => {
        if (event.target === event.currentTarget && gesture.current?.id === event.pointerId) {
          gesture.current = null;
          reset();
        }
      }}
      onClickCapture={(event) => {
        if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); }
      }}
    >
      <div ref={text} className="relative will-change-transform">
        {previous && <div aria-hidden className="absolute inset-y-0 -left-full w-full">{previous}</div>}
        {children}
        {next && <div aria-hidden className="absolute inset-y-0 left-full w-full">{next}</div>}
      </div>
    </div>
  );
}
