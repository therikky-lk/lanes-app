import { useEffect, useRef } from "react";
import { createLensMap, LENS_DISPLACEMENT_SCALE } from "./liquidGlassLens";
import { nativePlatform } from "@/shared/platform/native";

const SVG_NS = "http://www.w3.org/2000/svg";
const SURFACES = '[data-liquid-glass], .lane-search-box';

/**
 * Each panel needs its own pixel-sized displacement map. A shared, stretched
 * gradient is not a rounded lens, and percentage SVG primitives can resolve
 * against the zero-sized defs viewport rather than the backdrop.
 */
export function LiquidGlassFilter() {
  const defsRef = useRef<SVGDefsElement>(null);

  useEffect(() => {
    const defs = defsRef.current;
    if (!defs || nativePlatform() === "ios") return;
    const root = document.documentElement;
    const panels = new Map<HTMLElement, { filter: SVGFilterElement; size: string }>();
    const reducedTransparency = matchMedia("(prefers-reduced-transparency: reduce)");
    let nextId = 0;
    let frame = 0;
    let resizeTimer: ReturnType<typeof setTimeout> | undefined;

    function update(panel: HTMLElement) {
      const entry = panels.get(panel);
      if (!entry) return;
      const width = panel.clientWidth;
      const height = panel.clientHeight;
      if (!width || !height) return;
      const radius = Math.min(parseFloat(getComputedStyle(panel).borderTopLeftRadius) || 0, width / 2, height / 2);
      const size = `${width}:${height}:${radius}`;
      if (entry.size === size) return;
      entry.size = size;
      const map = createLensMap(width, height, radius);
      const canvas = document.createElement("canvas");
      canvas.width = map.width;
      canvas.height = map.height;
      const context = canvas.getContext("2d");
      if (!context) return;
      const image = context.createImageData(map.width, map.height);
      image.data.set(map.pixels);
      context.putImageData(image, 0, 0);

      const url = canvas.toDataURL();
      // Keep the old map visible until the replacement is decoded. Never tear
      // down a live SVG filter graph: Chromium can flash intermediate passes.
      const preload = new Image();
      preload.src = url;
      void preload.decode().then(() => {
        if (panels.get(panel) !== entry || entry.size !== size) return;
        const filter = entry.filter;
        filter.setAttribute("width", String(width));
        filter.setAttribute("height", String(height));
        const lens = filter.querySelector("feImage")!;
        lens.setAttribute("width", String(width));
        lens.setAttribute("height", String(height));
        lens.setAttribute("href", url);
        const value = `url("#${filter.id}")`;
        if (panel.style.getPropertyValue("--lane-glass-filter") !== value) {
          panel.style.setProperty("--lane-glass-filter", value);
        }
      }).catch(() => {
        // Retain the previous lens (or CSS fallback), not a broken image.
        if (panels.get(panel) === entry && entry.size === size) entry.size = "";
      });
    }

    const resize = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        for (const panel of panels.keys()) update(panel);
      }, 120);
    });

    function reconcile() {
      frame = 0;
      const enabled = root.dataset.colorTheme === "liquid-glass"
        && root.classList.contains("lane-mobile") && !window.linerElectron
        && !reducedTransparency.matches;
      const current = new Set(enabled ? document.querySelectorAll<HTMLElement>(SURFACES) : []);
      for (const [panel, entry] of panels) {
        if (current.has(panel)) continue;
        resize.unobserve(panel);
        panel.style.removeProperty("--lane-glass-filter");
        entry.filter.remove();
        panels.delete(panel);
      }
      for (const panel of current) {
        if (!panels.has(panel)) {
          const filter = document.createElementNS(SVG_NS, "filter");
          filter.id = `lane-glass-lens-${nextId++}`;
          filter.setAttribute("filterUnits", "userSpaceOnUse");
          filter.setAttribute("primitiveUnits", "userSpaceOnUse");
          filter.setAttribute("x", "0");
          filter.setAttribute("y", "0");
          filter.setAttribute("color-interpolation-filters", "sRGB");
          // One lens sampling pass. A static subpixel colour fringe is
          // derived from that same result, never three independent backdrops.
          filter.innerHTML = `
            <feGaussianBlur in="SourceGraphic" stdDeviation="0.6" result="backdrop"/>
            <feImage x="0" y="0" preserveAspectRatio="none" result="lens"/>
            <feDisplacementMap in="backdrop" in2="lens" scale="${LENS_DISPLACEMENT_SCALE}" xChannelSelector="R" yChannelSelector="G" result="refracted"/>
            <feGaussianBlur in="refracted" stdDeviation="2.25" result="readableBackdrop"/>
            <feOffset in="readableBackdrop" dx="0.4" dy="0" result="warm"/>
            <feOffset in="readableBackdrop" dx="-0.4" dy="0" result="cool"/>
            <feColorMatrix in="warm" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="red"/>
            <feColorMatrix in="readableBackdrop" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="green"/>
            <feColorMatrix in="cool" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="blue"/>
            <feBlend in="red" in2="green" mode="screen" result="redGreen"/>
            <feBlend in="redGreen" in2="blue" mode="screen"/>`;
          defs!.append(filter);
          panels.set(panel, { filter, size: "" });
          resize.observe(panel);
          update(panel);
        }
      }
    }
    function schedule() {
      if (!frame) frame = requestAnimationFrame(reconcile);
    }
    const observer = new MutationObserver((records) => {
      // Playback text, animated artwork and our own defs must not trigger
      // rescans or rebuilds of every lens on every animation frame.
      if (records.some((record) => record.type === "attributes" ||
        [...record.addedNodes, ...record.removedNodes].some((node) =>
          node instanceof Element && (node.matches(SURFACES) || node.querySelector(SURFACES))
        ))) schedule();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    observer.observe(root, { attributes: true, attributeFilter: ["data-color-theme", "class"] });
    reducedTransparency.addEventListener("change", schedule);
    reconcile();
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(resizeTimer);
      observer.disconnect();
      resize.disconnect();
      reducedTransparency.removeEventListener("change", schedule);
      for (const [panel, entry] of panels) {
        panel.style.removeProperty("--lane-glass-filter");
        entry.filter.remove();
      }
    };
  }, []);

  return (
    <svg width="1" height="1" aria-hidden="true" focusable="false"
      style={{ position: "fixed", top: -10, left: -10, pointerEvents: "none" }}>
      <defs ref={defsRef} />
    </svg>
  );
}
