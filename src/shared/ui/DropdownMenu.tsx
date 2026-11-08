import {
  useLayoutEffect,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useDragControls } from "framer-motion";

export interface DropdownMenuItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  onClick: () => void | Promise<void>;
  danger?: boolean;
  disabled?: boolean;
  separatorBefore?: boolean;
  info?: boolean;
}

export interface DropdownMenuProps {
  trigger: React.ReactNode;
  items: DropdownMenuItem[];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  position?: { x: number; y: number } | null;
  side?: "top" | "bottom";
  align?: "start" | "end";
  mobileSheetHeader?: React.ReactNode;
  closeLabel?: string;
}

function useFixedStyle(
  menuRef: RefObject<HTMLDivElement | null>,
  isFixed: boolean,
  position: { x: number; y: number } | null | undefined,
  open: boolean,
  side: "top" | "bottom" = "bottom",
  align: "start" | "end" = "start",
): React.CSSProperties {
  const [style, setStyle] = useState<React.CSSProperties>(() =>
    position ? { left: position.x, top: position.y } : {},
  );

  useLayoutEffect(() => {
    if (!isFixed || !position || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    let left = align === "end" ? position.x - rect.width : position.x;
    let top = side === "top" ? position.y - rect.height : position.y;
    const isMobile = document.documentElement.classList.contains("lane-mobile");
    const mobileDock = isMobile
      ? document.querySelector<HTMLElement>("[data-mobile-dock]")
      : null;
    const dockTop = mobileDock?.getBoundingClientRect().top;
    const bottomLimit = Number.isFinite(dockTop)
      ? Math.min(window.innerHeight, dockTop as number) - 8
      : window.innerHeight - 8;

    if (left + rect.width > window.innerWidth) {
      left = window.innerWidth - rect.width - 8;
    }
    if (left < 8) left = 8;

    if (side !== "top" && top + rect.height > bottomLimit) {
      top = position.y - rect.height - 8;
    }
    if (top < 8) top = 8;
    if (isMobile) top = Math.min(top, bottomLimit - rect.height);

    setStyle({ left, top: Math.max(8, top) });
  }, [isFixed, position, open, menuRef, side, align]);

  return style;
}

export default function DropdownMenu({
  trigger,
  items,
  open: controlledOpen,
  onOpenChange,
  position,
  side = "bottom",
  align = "start",
  mobileSheetHeader,
  closeLabel = "Close",
}: DropdownMenuProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const dragControls = useDragControls();
  const mobileSheet = Boolean(mobileSheetHeader) && typeof document !== "undefined"
    && document.documentElement.classList.contains("lane-mobile");

  const [computedPos, setComputedPos] = useState<{
    x: number;
    y: number;
  } | null>(null);

  useLayoutEffect(() => {
    if (!position && open && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const x = align === "end" ? rect.right : rect.left;
      const y = side === "top" ? rect.top - 4 : rect.bottom + 4;
      setComputedPos({ x, y });
    }
  }, [open, position, side, align]);

  const targetPos = position || computedPos;
  const isFixed = Boolean(targetPos);
  const fixedStyle = useFixedStyle(menuRef, isFixed, targetPos, open, side, align);

  useEffect(() => {
    if (!open) return;
    const isMobile = document.documentElement.classList.contains("lane-mobile");
    const onMouseDown = (e: MouseEvent) => {
      if (
        menuRef.current?.contains(e.target as Node) ||
        containerRef.current?.contains(e.target as Node)
      ) {
        return;
      }
      setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (isMobile && (!mobileSheet || !menuRef.current?.contains(e.target as Node))) e.preventDefault();
    };
    const onWheel = (e: WheelEvent) => {
      if (!mobileSheet || !menuRef.current?.contains(e.target as Node)) e.preventDefault();
    };

    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("touchmove", onTouchMove, { capture: true, passive: false });
    document.addEventListener("wheel", onWheel, { capture: true, passive: false });
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("touchmove", onTouchMove, true);
      document.removeEventListener("wheel", onWheel, true);
    };
  }, [open, setOpen, mobileSheet]);

  const menuItemsContent = (
    <div className="flex flex-col gap-0.5">
      {items.map((item) => (
        <div key={item.id}>
          {item.separatorBefore && <div className="my-1.5 h-px bg-border-alpha-14" aria-hidden="true" />}
          <button
            type="button"
            disabled={item.disabled}
            onClick={async (e) => {
              e.stopPropagation();
              setOpen(false);
              await item.onClick();
            }}
            className={`${mobileSheet ? "min-h-[52px] gap-4 rounded-xl px-4 py-3 text-[16px]" : "min-h-[34px] gap-2.5 rounded-lg px-2.5 py-2 text-[13px]"} group flex w-full items-center font-normal tracking-tight transition-colors border-none bg-transparent text-left cursor-pointer select-none outline-none ${
              item.danger ? "text-red-400 hover:bg-red-500/10 hover:text-red-400" : "text-text-primary hover:bg-border-alpha-14"
            } disabled:pointer-events-none disabled:opacity-40`}
            style={{ fontFamily: "var(--font-inter), sans-serif", opacity: item.info ? 1 : undefined }}
          >
            {item.icon && (
              <span className={`shrink-0 flex items-center justify-center ${mobileSheet ? "text-[20px]" : "text-[15px]"} ${item.danger ? "text-red-400" : "text-text-secondary group-hover:text-text-primary"} transition-colors`}>
                {item.icon}
              </span>
            )}
            <span className="truncate flex-1">{item.label}</span>
          </button>
        </div>
      ))}
    </div>
  );

  const menuContent = mobileSheet ? (
    <AnimatePresence>
      {open && (
        <motion.div
          key="track-actions-backdrop"
          className="fixed inset-0 z-[99999] flex items-end"
          initial={{ opacity: 1 }} animate={{ opacity: 1 }} exit={{ opacity: 1 }}
          onClick={() => setOpen(false)}
          onWheel={(e) => { if (e.target === e.currentTarget) e.preventDefault(); }}
        >
          <motion.div
            className="lane-sheet-dimmer absolute inset-0"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.14, ease: "easeOut" }}
            onClick={() => setOpen(false)}
          />
          <motion.div
            key="track-actions-sheet"
            ref={menuRef}
            role="dialog"
            aria-modal="true"
            data-dropdown-menu="true"
            className="lane-frost-sheet relative flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-2xl border-t border-white/[0.08] p-[18px] pb-[calc(var(--lane-safe-bottom,0px)+16px)]"
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            style={{ maxHeight: "min(88dvh, calc(100dvh - var(--lane-safe-top, 0px) - 16px))", touchAction: "pan-y", willChange: "transform" }}
            drag="y"
            dragListener={false}
            dragControls={dragControls}
            dragConstraints={{ top: 0, bottom: typeof window === "undefined" ? 1000 : window.innerHeight }}
            dragElastic={0}
            dragMomentum={false}
            onDragEnd={(_, info) => {
              if (info.offset.y > 90 || info.velocity.y > 650) setOpen(false);
            }}
            onClick={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              aria-label={closeLabel}
              onPointerDown={(event) => dragControls.start(event)}
              onClick={() => setOpen(false)}
              className="mx-auto mb-[14px] flex h-[22px] w-[72px] shrink-0 touch-none items-center justify-center rounded-full border-0 bg-transparent p-0"
            >
              <span className="h-[4px] w-[36px] rounded-full bg-white/35" aria-hidden="true" />
            </button>
            <div className="shrink-0">{mobileSheetHeader}</div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-[12px]">
              {menuItemsContent}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  ) : (
    <AnimatePresence>
      {open && (
        <motion.div
          key="dropdown-menu"
          ref={menuRef}
          data-dropdown-menu="true"
          initial={{ opacity: 0, scale: 0.96, y: side === "top" ? 2 : -2 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: side === "top" ? 2 : -2 }}
          transition={{ duration: 0.1, ease: "easeOut" }}
          className={`touch-none overflow-hidden rounded-xl border border-white/[0.07] bg-bg-elevated/95 shadow-none backdrop-blur-xl p-1.5 min-w-[180px] ${
            isFixed ? "fixed z-[99999]" : side === "top" ? "absolute right-0 bottom-full mb-1 z-50" : "absolute right-0 top-full mt-1 z-50"
          }`}
          style={isFixed ? fixedStyle : {}}
          onClick={(e) => e.stopPropagation()}
          onWheel={(e) => { e.preventDefault(); e.stopPropagation(); }}
        >
          {menuItemsContent}
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <div
      ref={containerRef}
      className="relative inline-flex"
      onClick={(e) => {
        if (!position) {
          e.stopPropagation();
          setOpen(!open);
        }
      }}
    >
      {trigger}
      {isFixed && typeof document !== "undefined"
        ? createPortal(menuContent, document.body)
        : menuContent}
    </div>
  );
}
