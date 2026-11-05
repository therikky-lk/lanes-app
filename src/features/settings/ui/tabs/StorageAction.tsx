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
    className={`inline-flex h-[30px] w-[100px] shrink-0 items-center justify-center overflow-hidden whitespace-nowrap rounded-full border-0 px-3 text-[12px] cursor-pointer disabled:cursor-default disabled:opacity-50 ${armed && !disabled ? "bg-red-500 text-white" : "bg-black/[0.06] dark:bg-white/[0.06] text-text-secondary"}`}>
    <span className="truncate" aria-live="polite">{armed && !disabled ? action : label}</span>
  </button>;
}
