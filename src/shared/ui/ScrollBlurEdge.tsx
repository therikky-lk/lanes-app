import { useIsMobile } from "@/shared/hooks/useIsMobile";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface ScrollBlurEdgeProps {
  /** height of the blurred band in px */
  height?: number;
  /** scrollTop after which the band fades in */
  threshold?: number;
  /** kept for compatibility; the band is always aligned to the scroller's top edge */
  offset?: number;
}

interface Box {
  top: number;
  left: number;
  width: number;
}

/**
 * A soft frosted band over the top edge of the nearest scroll container. It fades
 * in once content scrolls under the window controls. Render it anywhere inside
 * the scroller (first child is best): it measures the scroller and draws an
 * overlay next to it, so padding and sticky quirks can't misplace it.
 */
export default function ScrollBlurEdge({ height = 64, threshold = 6 }: ScrollBlurEdgeProps) {
  const marker = useRef<HTMLSpanElement>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const [visible, setVisible] = useState(false);
  const isMobile = useIsMobile();

  useLayoutEffect(() => {
    const scroller = marker.current?.parentElement;
    const parent = scroller?.parentElement;
    if (!scroller || !parent) return;
    if (getComputedStyle(parent).position === "static") parent.style.position = "relative";
    setHost(parent);

    const measure = () =>
      setBox((prev) => {
        const next = { top: scroller.offsetTop, left: scroller.offsetLeft, width: scroller.clientWidth };
        return prev && prev.top === next.top && prev.left === next.left && prev.width === next.width ? prev : next;
      });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(scroller);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const scroller = marker.current?.parentElement;
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

  // phones: content simply slides under the status bar shade
  if (isMobile) return null;
  const mask = "linear-gradient(to bottom, #000 0%, rgba(0,0,0,0.85) 40%, transparent 100%)";
  return (
    <>
      <span ref={marker} hidden aria-hidden />
      {host && box
        ? createPortal(
            <div
              aria-hidden
              className="pointer-events-none absolute z-[15] transition-opacity duration-300 ease-out"
              style={{
                top: `calc(${box.top}px + var(--lane-scroll-top-inset, 0px))`,
                left: box.left,
                width: box.width,
                height,
                opacity: visible ? 1 : 0,
                backdropFilter: "blur(10px) saturate(1.1)",
                WebkitBackdropFilter: "blur(10px) saturate(1.1)",
                background:
                  "linear-gradient(to bottom, color-mix(in srgb, var(--bg-canvas, #000) 55%, transparent), transparent)",
                maskImage: mask,
                WebkitMaskImage: mask,
              }}
            />,
            host,
          )
        : null}
    </>
  );
}
