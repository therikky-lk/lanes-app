import { useLayoutEffect, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
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
    if (rect) setPos({ top: rect.bottom + 10, right: Math.max(8, window.innerWidth - rect.right) });
  }, [open, anchorRef]);
  if (!open || !pos) return null;
  return createPortal(
    <>
      <div className="fixed inset-0 z-[180]" onClick={onClose} />
      <div
        className="fixed z-[181] w-[220px] overflow-hidden rounded-2xl border border-white/[0.08] p-[6px] shadow-[0_16px_48px_rgba(0,0,0,0.5)]"
        style={{
          top: pos.top,
          right: pos.right,
          background: "color-mix(in srgb, var(--bg-elevated, #1a1a1e) 58%, transparent)",
          backdropFilter: "blur(28px) saturate(1.6)",
          WebkitBackdropFilter: "blur(28px) saturate(1.6)",
          fontFamily: "var(--font-inter), sans-serif",
        }}
      >
        {children}
      </div>
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
      className="flex w-full items-center gap-[10px] rounded-xl border-0 bg-transparent px-[10px] py-[10px] text-left text-[14.5px] text-text-primary active:bg-border-alpha-14 cursor-pointer"
    >
      {icon}
      <span className="flex-1 truncate">{label}</span>
      {hint !== undefined && <span className="text-text-tertiary tabular-nums">{hint}</span>}
      <span className="flex w-[16px] justify-center">{checked && <CheckLine size={16} />}</span>
    </button>
  );
}

export function PhoneMenuDivider() {
  return <div className="mx-[6px] my-[4px] h-px bg-white/[0.08]" />;
}
