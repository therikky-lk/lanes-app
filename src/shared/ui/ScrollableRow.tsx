import { useMemo } from "react";
import useHorizontalScroll, {
  type UseHorizontalScrollResult,
} from "@/shared/hooks/useHorizontalScroll";

interface ScrollableRowProps {
  children: React.ReactNode;
  className?: string;
  overlayWidth?: string;
  leftOverlayClassName?: string;
  rightOverlayClassName?: string;
  dragCursor?: string;
  wheelMultiplier?: number;
  controller?: UseHorizontalScrollResult;
  showScrollMask?: boolean;
}

export function ScrollableRow({
  children,
  className = "",
  dragCursor,
  wheelMultiplier,
  controller,
  showScrollMask = true,
}: ScrollableRowProps) {
  const internalController = useHorizontalScroll({
    dragCursor,
    wheelMultiplier,
  });

  const { scrollRef, showLeftShadow, showRightShadow, handlers } =
    controller ?? internalController;

  const maskStyle = useMemo(() => {
    const leftMask = showLeftShadow ? "transparent 0px, black 32px" : "black 0px";
    const rightMask = showRightShadow ? "black calc(100% - 32px), transparent 100%" : "black 100%";
    return {
      maskImage: `linear-gradient(to right, ${leftMask}, ${rightMask})`,
      WebkitMaskImage: `linear-gradient(to right, ${leftMask}, ${rightMask})`,
      transition: "mask-image 0.25s ease, -webkit-mask-image 0.25s ease",
    };
  }, [showLeftShadow, showRightShadow]);

  return (
    <div className="relative group min-w-0 max-w-full overflow-hidden">
      <div
        ref={scrollRef}
        {...handlers}
        className={`no-scrollbar cursor-grab ${className}`}
        style={{
          overflowX: "auto",
          display: "flex",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          ...(showScrollMask ? maskStyle : {}),
        }}
      >
        {children}
      </div>
    </div>
  );
}

export default ScrollableRow;
