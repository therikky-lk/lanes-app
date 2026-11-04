import { useLayoutEffect, useState, type RefObject } from "react";
export function useAnchoredPanel(open: boolean, anchor: RefObject<HTMLElement | null>, width: number, gap = 8, align: "start" | "center" = "start") {
  const [position, setPosition] = useState({ left: 8, top: 40 });
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const box = anchor.current?.getBoundingClientRect();
      if (!box) return;
      const left = align === "center" ? box.left + (box.width - width) / 2 : box.left;
      setPosition({ left: Math.max(8, Math.min(left, window.innerWidth - width - 8)), top: box.bottom + gap });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => { window.removeEventListener("resize", update); window.removeEventListener("scroll", update, true); };
  }, [open, anchor, width, gap, align]);
  return position;
}
