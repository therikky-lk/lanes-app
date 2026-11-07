import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CloseLine } from "@mingcute/react";
import { useTranslation } from "@/languages";
import { onAndroidBack } from "@/shared/platform/androidBack";

export default function CoverViewer({ children, className = "" }: { children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();
  useEffect(() => {
    if (!open) return;
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopImmediatePropagation(); setOpen(false); } };
    window.addEventListener("keydown", key, true);
    const off = onAndroidBack(() => { setOpen(false); return true; });
    return () => { window.removeEventListener("keydown", key, true); off(); };
  }, [open]);
  return <>
    <div role="button" tabIndex={0} aria-label={t("player.open_cover")} className={`absolute inset-0 cursor-zoom-in ${className}`}
      onClick={event => { if (!(event.target as HTMLElement).closest("button")) setOpen(true); }}
      onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setOpen(true); } }}>{children}</div>
    {open && createPortal(<div role="dialog" aria-modal="true" aria-label={t("player.open_cover")} className="fixed inset-0 z-[650] flex items-center justify-center bg-black/90 p-[24px] backdrop-blur-xl" onClick={() => setOpen(false)}>
      <button type="button" autoFocus aria-label={t("common.close")} onClick={() => setOpen(false)} className="absolute right-[20px] top-[calc(var(--lane-safe-top,0px)+20px)] flex h-[40px] w-[40px] items-center justify-center rounded-[10px] border-0 bg-white/10 text-white"><CloseLine size={24} /></button>
      <div className="relative aspect-square w-[min(88vw,80dvh)] overflow-hidden rounded-[18px]" onClick={event => event.stopPropagation()}>{children}</div>
    </div>, document.body)}
  </>;
}
