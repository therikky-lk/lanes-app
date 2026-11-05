import { useEffect, useRef, useState } from "react";

/** A stable touch target: confirmation must not move away from the second tap. */
export function StorageAction({ label, action, confirmation, disabled, onConfirm }: {
  label: string; action: string; confirmation: string; disabled?: boolean; onConfirm: () => void;
}) {
  const [armed, setArmed] = useState(false);
  const [hover, setHover] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 8000);
    const outside = (event: PointerEvent) => { if (!button.current?.contains(event.target as Node)) setArmed(false); };
    document.addEventListener("pointerdown", outside);
    return () => { clearTimeout(timer); document.removeEventListener("pointerdown", outside); };
  }, [armed]);
  useEffect(() => { if (disabled) setArmed(false); }, [disabled]);
  const text = !disabled && armed ? confirmation : !disabled && hover ? action : label;
  return <button ref={button} type="button" disabled={disabled} title={action} aria-label={armed ? confirmation : action}
    onPointerEnter={event => { if (event.pointerType === "mouse") setHover(true); }}
    onPointerLeave={() => setHover(false)} onBlur={() => setHover(false)}
    onKeyDown={event => { if (event.key === "Escape") setArmed(false); }}
    onClick={() => { if (armed) { setArmed(false); onConfirm(); } else setArmed(true); }}
    className={`inline-grid min-h-[34px] max-w-full shrink-0 items-center justify-items-center whitespace-nowrap rounded-full border-0 px-3 py-1.5 text-[12px] transition-colors disabled:opacity-50 ${armed && !disabled ? "bg-red-500 text-white" : hover && !disabled ? "bg-red-500/10 text-red-500" : "bg-black/[0.06] dark:bg-white/[0.06] text-text-secondary"}`}>
    {[label, action, confirmation].map((value, index) => <span key={index} className="invisible col-start-1 row-start-1 pointer-events-none" aria-hidden>{value}</span>)}
    <span className="col-start-1 row-start-1">{text}</span>
  </button>;
}
