import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useDragControls, useIsPresent, useReducedMotion } from "framer-motion";
import { isWindowDraggingActive } from "@/shared/hooks";
import { isEscapeGuarded } from "@/shared/utils/escapeGuard";
import { backdropMotion, fadeMotion, modalMotion, modalTransform, sheetMotion } from "./surfaceMotion";

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  maxWidth?: number | string;
  minHeight?: number | string;
  maxHeight?: number | string;
  className?: string;
  backdropClassName?: string;
  zIndex?: number;
  animateLayout?: boolean;
  bottomSheet?: boolean;
  fadeOnly?: boolean;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  "aria-labelledby"?: string;
}

const activeDialogs: Array<() => void> = [];

function DialogLayer({
  onOpenChange,
  children,
  maxWidth = 360,
  minHeight,
  maxHeight,
  className = "",
  backdropClassName = "",
  zIndex,
  animateLayout = false,
  bottomSheet = false,
  fadeOnly = false,
  closeOnBackdrop = true,
  "aria-labelledby": labelledBy,
}: Omit<DialogProps, "open" | "closeOnEscape">) {
  const dragControls = useDragControls();
  const reduceMotion = useReducedMotion();
  const isPresent = useIsPresent();
  const pointerStartRef = useRef<{ x: number; y: number; target: EventTarget | null } | null>(null);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    pointerStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      target: e.target,
    };
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (!isPresent || !closeOnBackdrop || e.target !== e.currentTarget) return;
    if (isWindowDraggingActive()) {
      return;
    }
    const start = pointerStartRef.current;
    if (start) {
      const dist = Math.hypot(e.clientX - start.x, e.clientY - start.y);
      if (dist > 6) {
        return;
      }
      if (start.target !== e.currentTarget && (start.target as HTMLElement)?.closest?.("[data-dialog-container]")) {
        return;
      }
    }
    onOpenChange(false);
  };

  return (
    <>
      <motion.div
        data-dialog-backdrop="true"
        aria-hidden="true"
        variants={reduceMotion ? fadeMotion : backdropMotion}
        initial="initial"
        animate="animate"
        exit="exit"
        className={`fixed inset-0 z-[199] bg-black/40 backdrop-blur-[4px] rounded-4xl overflow-hidden ${backdropClassName}`}
        style={zIndex ? { zIndex: zIndex - 1 } : undefined}
        onPointerDown={handlePointerDown}
        onClick={handleBackdropClick}
      />
      <div
        data-dialog-container={isPresent ? "true" : undefined}
        className={`fixed inset-0 z-[200] flex justify-center pointer-events-none ${bottomSheet ? "items-end" : "items-center"}`}
        style={zIndex ? { zIndex } : undefined}
      >
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby={labelledBy}
          inert={!isPresent}
          variants={reduceMotion || fadeOnly ? fadeMotion : bottomSheet ? sheetMotion : modalMotion}
          initial="initial"
          animate="animate"
          exit="exit"
          transformTemplate={!reduceMotion && !fadeOnly && !bottomSheet ? modalTransform : undefined}
          drag={bottomSheet && isPresent ? "y" : false}
          dragControls={dragControls}
          dragListener={false}
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0, bottom: 0.6 }}
          onPointerDown={event => {
            event.stopPropagation();
            if (bottomSheet && (event.target as HTMLElement).closest("[data-sheet-handle]")) dragControls.start(event);
          }}
          onClick={event => event.stopPropagation()}
          onDragEnd={(_, info) => {
            if (isPresent && bottomSheet && (info.offset.y > 80 || (info.offset.y > 20 && info.velocity.y > 500))) onOpenChange(false);
          }}
          className={`pointer-events-auto w-full mx-[16px] max-h-[85vh] flex flex-col rounded-xl border border-border-primary bg-bg-primary overflow-hidden relative ${
            className || "pt-[16px]"
          }`}
          style={{ maxWidth, minHeight, ...(maxHeight ? { maxHeight } : {}) }}
          layout={animateLayout && !reduceMotion}
          transition={animateLayout ? { layout: { type: "spring", stiffness: 360, damping: 34 } } : undefined}
        >
          {children}
        </motion.div>
      </div>
    </>
  );
}

export default function Dialog({ open, closeOnEscape = true, ...props }: DialogProps) {
  const [mounted, setMounted] = useState(false);
  const { onOpenChange } = props;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    const closeHandler = () => onOpenChange(false);
    activeDialogs.push(closeHandler);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // A recorder (or similar) is waiting for keys: let it cancel itself first
        if (isEscapeGuarded()) return;
        // Only the top-most open dialog closes on Escape; parent dialogs stay open
        if (activeDialogs[activeDialogs.length - 1] !== closeHandler) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (closeOnEscape) onOpenChange(false);
      }
    };

    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      const idx = activeDialogs.indexOf(closeHandler);
      if (idx !== -1) {
        activeDialogs.splice(idx, 1);
      }
    };
  }, [open, onOpenChange, closeOnEscape]);

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && <DialogLayer {...props} />}
    </AnimatePresence>,
    document.body,
  );
}
