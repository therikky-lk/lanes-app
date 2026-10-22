import { useEffect, useRef, useState } from "react";

export interface ScrollBlurEdgeProps {
  /** height of the blurred band in px */
  height?: number;
  /** scrollTop after which the band fades in */
  threshold?: number;
  /** top padding of the scroller, so the band starts at its very top */
  offset?: number;
}

/**
 * A soft frosted band pinned to the top of the nearest scroll container. It
 * fades in once the content scrolls under the window controls, so headers stay
 * readable without a hard bar. Render it as the FIRST child of the scroller.
 */
export default function ScrollBlurEdge({ height = 64, threshold = 6, offset = 0 }: ScrollBlurEdgeProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const scroller = ref.current?.parentElement;
    if (!scroller) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      setVisible(scroller.scrollTop > threshold);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [threshold]);

  const mask = "linear-gradient(to bottom, #000 0%, #000 45%, transparent 100%)";
  return (
    <div ref={ref} aria-hidden className="sticky top-0 z-[15] h-0 w-full pointer-events-none" style={{ marginTop: -offset, marginBottom: offset }}>
      <div
        className="absolute -left-[8px] -right-[8px] top-0 transition-opacity duration-300 ease-out"
        style={{
          height,
          opacity: visible ? 1 : 0,
          backdropFilter: "blur(12px) saturate(1.15)",
          WebkitBackdropFilter: "blur(12px) saturate(1.15)",
          background: "color-mix(in srgb, var(--bg-canvas, transparent) 28%, transparent)",
          maskImage: mask,
          WebkitMaskImage: mask,
        }}
      />
    </div>
  );
}
