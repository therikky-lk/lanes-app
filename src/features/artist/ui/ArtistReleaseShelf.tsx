import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useTranslation } from "@/languages";
import { useIsMobile } from "@/shared/hooks/useIsMobile";
import { useSectionScrollRestore } from "@/shared/hooks/useSectionScrollRestore";
import SectionExpandButton from "@/shared/ui/SectionExpandButton";

export default function ArtistReleaseShelf<T extends { id: string }>({ label, items, renderCard }: {
  label: string;
  items: T[];
  renderCard: (item: T) => ReactNode;
}) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const grid = isMobile
    ? "grid grid-cols-2 gap-[12px]"
    : "grid grid-cols-[repeat(auto-fill,minmax(min(100%,var(--release-card-width)),var(--release-card-width)))] gap-[16px]";
  const [expanded, setExpanded] = useState(false);
  const [columns, setColumns] = useState(2);
  const gridRef = useRef<HTMLDivElement>(null);
  const { anchorRef, remember } = useSectionScrollRestore(expanded);
  const moreId = useId();
  const reduced = useReducedMotion();

  useLayoutEffect(() => {
    if (isMobile) return;
    const el = gridRef.current;
    if (!el) return;
    const measure = () => {
      const style = getComputedStyle(el);
      const cardWidth = Number.parseFloat(style.getPropertyValue("--release-card-width")) || 180;
      const gap = Number.parseFloat(style.columnGap) || 16;
      setColumns(Math.max(1, Math.floor((el.clientWidth + gap) / (cardWidth + gap))));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [isMobile]);

  const visibleCount = isMobile ? 2 : columns;
  const hasMore = items.length > visibleCount;
  const cards = (releases: T[]) => releases.map(item => <div key={item.id} className="min-w-0">{renderCard(item)}</div>);

  return (
    <section ref={anchorRef} className="min-w-0 [--release-card-width:180px]">
      <div className="mb-[16px] flex items-center justify-between gap-[12px]">
        <h2 className="m-0 text-[22px] font-[500] text-text-primary" style={{ fontFamily: "var(--font-inter), sans-serif" }}>
          {label}
          <span className="ml-[8px] text-[14px] font-[400] text-text-tertiary tabular-nums">{items.length}</span>
        </h2>
      </div>
      <div ref={gridRef} className={grid}>{cards(items.slice(0, visibleCount))}</div>
      <div id={moreId}>
        <AnimatePresence initial={false}>
          {expanded && hasMore && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: reduced ? 0 : 0.28, ease: [0.25, 1, 0.5, 1] }}
              className="overflow-clip"
            >
              <div className={`${grid} ${isMobile ? "pt-[12px]" : "pt-[16px]"}`}>{cards(items.slice(visibleCount))}</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {hasMore && (
        <SectionExpandButton
          controls={moreId}
          expanded={expanded}
          label={t(expanded ? "artist.show_less" : "artist.show_all")}
          onClick={() => {
            if (!expanded) remember();
            setExpanded(!expanded);
          }}
        />
      )}
    </section>
  );
}
