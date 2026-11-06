import { useEffect, useRef, useState, type ReactNode } from "react";
import { DeleteLine } from "@mingcute/react";

const ACTION_WIDTH = 76;

/** Phone history action: follow the finger, reveal Delete, or commit a long swipe. */
export default function SwipeToDelete({ children, label, onDelete }: { children: ReactNode; label: string; onDelete: () => void }) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [armed, setArmed] = useState(false);
  const [departing, setDeparting] = useState(false);
  const removal = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (removal.current) clearTimeout(removal.current); }, []);
  const suppressClick = useRef(false);
  const gesture = useRef<{ id: number; x: number; y: number; base: number; width: number; offset: number; horizontal: boolean } | null>(null);
  const finish = (cancelled: boolean) => {
    const start = gesture.current;
    gesture.current = null;
    setDragging(false);
    setArmed(false);
    if (!start?.horizontal) return;
    const threshold = Math.max(ACTION_WIDTH + 24, Math.min(160, start.width * 0.45));
    if (!cancelled && -start.offset >= threshold) {
      setDeparting(true);
      setOffset(-start.width);
      removal.current = setTimeout(onDelete, 320);
      return;
    }
    setOffset(!cancelled && start.offset < -ACTION_WIDTH / 2 ? -ACTION_WIDTH : 0);
  };

  return (
    <div
      className="relative isolate w-full overflow-hidden rounded-[12px] shadow-none"
      style={{ touchAction: "pan-y" }}
      onPointerDownCapture={(event) => {
        suppressClick.current = false;
        if (departing || !event.isPrimary || event.button !== 0 || (event.target as HTMLElement).closest("[data-swipe-delete]")) return;
        gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, base: offset, width: event.currentTarget.getBoundingClientRect().width, offset, horizontal: false };
      }}
      onPointerMoveCapture={(event) => {
        const start = gesture.current;
        if (!start || start.id !== event.pointerId) return;
        const dx = event.clientX - start.x;
        const dy = event.clientY - start.y;
        if (!start.horizontal) {
          if (Math.abs(dy) > 8 && Math.abs(dy) >= Math.abs(dx)) { gesture.current = null; return; }
          if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy) * 1.25 || (start.base === 0 && dx > 0)) return;
          start.horizontal = true;
          suppressClick.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          setDragging(true);
        }
        if (event.cancelable) event.preventDefault();
        start.offset = Math.max(-start.width, Math.min(0, start.base + dx));
        setOffset(start.offset);
        setArmed(-start.offset >= Math.max(ACTION_WIDTH + 24, Math.min(160, start.width * 0.45)));
      }}
      onPointerUpCapture={(event) => { if (gesture.current?.id === event.pointerId) finish(false); }}
      onPointerCancel={(event) => { if (gesture.current?.id === event.pointerId) finish(true); }}
      onLostPointerCapture={(event) => {
        // Touch starts with implicit capture on the nested track/cover. Moving
        // capture to this row emits a bubbling loss event from that child;
        // it does not mean the row's swipe was cancelled.
        if (event.target === event.currentTarget && gesture.current?.id === event.pointerId) finish(true);
      }}
      onClickCapture={(event) => {
        if ((event.target as HTMLElement).closest("[data-swipe-delete]")) { suppressClick.current = false; return; }
        if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; }
      }}
    >
      <button
        type="button"
        data-swipe-delete
        disabled={departing}
        aria-label={label}
        aria-hidden={offset === 0}
        tabIndex={offset === 0 ? -1 : 0}
        onClick={(event) => { event.stopPropagation(); onDelete(); }}
        className="absolute inset-y-0 right-0 flex flex-col items-center justify-center gap-[3px] border-0 px-[12px] text-white"
        style={{ width: Math.max(ACTION_WIDTH, -offset), backgroundColor: armed ? "#dc2626" : "#ef4444", visibility: offset === 0 ? "hidden" : "visible" }}
      >
        <DeleteLine size={22} style={{ transform: armed ? "scale(1.15)" : undefined, transition: "transform 120ms" }} />
        <span className="text-[11px] font-medium">{label}</span>
      </button>
      <div style={{ transform: `translateX(${offset}px)`, transition: dragging ? "none" : "transform 320ms cubic-bezier(.22,1,.36,1)", background: offset === 0 ? undefined : "var(--bg-primary)" }}>
        {children}
      </div>
    </div>
  );
}
