import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

/** A touch-friendly, two-click action with an animated label and width. */
export function StorageAction({ label, action, confirmation, disabled, onConfirm }: {
  label: string; action: string; confirmation: string; disabled?: boolean; onConfirm: () => void;
}) {
  const [armed, setArmed] = useState(false);
  const [hover, setHover] = useState(false);
  const measure = useRef<HTMLSpanElement>(null);
  const [width, setWidth] = useState<number>();
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(timer);
  }, [armed]);
  useEffect(() => { if (disabled) setArmed(false); }, [disabled]);
  const text = !disabled && armed ? confirmation : !disabled && hover ? action : label;
  useLayoutEffect(() => { setWidth((measure.current?.offsetWidth ?? 0) + 24); }, [text]);
  return <motion.button type="button" disabled={disabled} title={action} aria-label={armed ? confirmation : action}
    onPointerEnter={event => { if (event.pointerType === "mouse") setHover(true); }}
    onPointerLeave={() => setHover(false)} onBlur={() => { setArmed(false); setHover(false); }}
    onKeyDown={event => { if (event.key === "Escape") setArmed(false); }}
    onClick={() => { if (armed) { setArmed(false); onConfirm(); } else setArmed(true); }}
    initial={false} animate={{ width }} transition={{ duration: 0.3 }}
    className={`relative h-[30px] shrink-0 overflow-hidden whitespace-nowrap rounded-full border-0 px-3 text-[12px] transition-colors disabled:opacity-50 ${armed && !disabled ? "bg-red-500 text-white" : hover && !disabled ? "bg-red-500/10 text-red-500" : "bg-black/[0.06] dark:bg-white/[0.06] text-text-secondary"}`}>
    <span ref={measure} className="invisible absolute pointer-events-none" aria-hidden>{text}</span>
    <AnimatePresence mode="wait" initial={false}><motion.span key={text} className="inline-block"
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.14 }}>{text}</motion.span></AnimatePresence>
  </motion.button>;
}
