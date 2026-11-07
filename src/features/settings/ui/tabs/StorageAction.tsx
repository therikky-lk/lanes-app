import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

/** Two presses confirm deletion; hover leaves the size and layout unchanged. */
export function StorageAction({ label, action, confirmation, disabled, onConfirm }: {
  label: string; action: string; confirmation: string; disabled?: boolean; onConfirm: () => void;
}) {
  const [armed, setArmed] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 8000);
    const outside = (event: PointerEvent) => { if (!button.current?.contains(event.target as Node)) setArmed(false); };
    document.addEventListener("pointerdown", outside);
    return () => { clearTimeout(timer); document.removeEventListener("pointerdown", outside); };
  }, [armed]);
  useEffect(() => { if (disabled) setArmed(false); }, [disabled]);
  return <button ref={button} type="button" disabled={disabled}
    aria-label={armed ? confirmation : `${action} (${label})`}
    onKeyDown={event => { if (event.key === "Escape") setArmed(false); }}
    onClick={() => { if (armed) { setArmed(false); onConfirm(); } else setArmed(true); }}
    className={`lane-storage-action relative inline-flex h-[26px] w-[88px] shrink-0 items-center justify-center overflow-hidden whitespace-nowrap rounded-full border-0 px-2 text-[11px] transition-colors duration-200 ease-out cursor-pointer disabled:cursor-default disabled:opacity-50 ${armed && !disabled ? "bg-red-500 text-white" : "bg-black/[0.06] dark:bg-white/[0.06] text-text-secondary"}`}>
    <span className="grid w-full min-w-0 place-items-center" aria-live="polite">
      <AnimatePresence initial={false} mode="wait">
        <motion.span key={armed && !disabled ? "action" : "size"}
          className="col-start-1 row-start-1 max-w-full truncate"
          initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.12, ease: "easeOut" }}>
          {armed && !disabled ? action : label}
        </motion.span>
      </AnimatePresence>
    </span>
  </button>;
}
