import {
  useLayoutEffect,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";

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

    setStyle({
      left,
      top: Math.max(8, top),
      ...(isMobile
        ? { maxHeight: `max(96px, ${bottomLimit - 16}px)`, overflowY: "auto" }
        : {}),
    });
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
}: DropdownMenuProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

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

    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, setOpen]);

  const menuContent = (
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
          className={`overflow-hidden rounded-xl border border-white/[0.07] bg-bg-elevated/95 shadow-none backdrop-blur-xl p-1.5 min-w-[180px] ${
            isFixed ? "fixed z-[99999]" : side === "top" ? "absolute right-0 bottom-full mb-1 z-50" : "absolute right-0 top-full mt-1 z-50"
          }`}
          style={isFixed ? fixedStyle : {}}
          onClick={(e) => e.stopPropagation()}
          onWheel={(e) => { e.preventDefault(); e.stopPropagation(); }}
        >
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
                  className={`group flex min-h-[34px] w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-normal tracking-tight transition-colors border-none bg-transparent text-left cursor-pointer select-none outline-none ${
                    item.danger
                      ? "text-red-400 hover:bg-red-500/10 hover:text-red-400"
                      : "text-text-primary hover:bg-border-alpha-14"
                  } disabled:pointer-events-none disabled:opacity-40`}
                  style={{
                    fontFamily: "var(--font-inter), sans-serif",
                    opacity: item.info ? 1 : undefined,
                  }}
                >
                  {item.icon && (
                    <span
                      className={`shrink-0 flex items-center justify-center text-[15px] ${
                        item.danger
                          ? "text-red-400"
                          : "text-text-secondary group-hover:text-text-primary"
                      } transition-colors`}
                    >
                      {item.icon}
                    </span>
                  )}
                  <span className="truncate flex-1">{item.label}</span>
                </button>
              </div>
            ))}
          </div>
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
