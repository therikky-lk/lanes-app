import { useLayoutEffect, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { CheckLine } from "@mingcute/react";

/**
 * A frosted dropdown for the phone layout. It's portalled to <body> so its
 * backdrop blur sees the page (a blur inside another blurred header would only
 * see that header) and anchored under the button that opened it.
 */
export default function PhoneMenu({
  open,
  anchorRef,
  onClose,
  children,
}: {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  children: ReactNode;
}) {
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  useLayoutEffect(() => {
    if (!open) return;
    const rect = anchorRef.current?.getBoundingClientRect();
    if (rect) setPos({ top: rect.bottom + 18, right: Math.max(14, window.innerWidth - rect.right + 4) });
  }, [open, anchorRef]);
  if (!open || !pos) return null;
  return createPortal(
    <>
      <div className="fixed inset-0 z-[180]" onClick={onClose} />
      <motion.div
        className="fixed z-[181] w-[248px] max-w-[calc(100vw-28px)] overflow-hidden rounded-[16px] border border-border-primary/40 p-[6px] shadow-none"
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
        style={{
          top: pos.top,
          right: pos.right,
          background: "color-mix(in srgb, var(--bg-primary, #0d0d10) 94%, transparent)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          fontFamily: "var(--font-inter), sans-serif",
        }}
      >
        {children}
      </motion.div>
    </>,
    document.body,
  );
}

export function PhoneMenuItem({
  icon,
  label,
  hint,
  checked,
  onClick,
}: {
  icon?: ReactNode;
  label: ReactNode;
  hint?: ReactNode;
  checked?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[40px] w-full cursor-pointer items-center gap-[11px] rounded-[10px] border-0 bg-transparent px-[11px] py-[9px] text-left text-[14px] text-text-primary transition-colors duration-150 hover:bg-border-alpha-14 active:bg-border-alpha-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary/40 [&>svg]:shrink-0 [&>svg]:text-text-secondary"
    >
      {icon}
      <span className="flex-1 truncate">{label}</span>
      {hint !== undefined && <span className="text-text-tertiary tabular-nums">{hint}</span>}
      {checked && <span className="flex w-[16px] shrink-0 justify-center"><CheckLine size={16} /></span>}
    </button>
  );
}

export function PhoneMenuDivider() {
  return <div className="mx-[6px] my-[4px] h-px bg-white/[0.08]" />;
}
