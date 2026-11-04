import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckLine } from "@mingcute/react";
import { useTranslation } from "@/languages";
import { useAnchoredPanel } from "@/shared/hooks/useAnchoredPanel";
import { useVisualQualityStore, type VisualQuality } from "../store/visualQualityStore";

export function VisualQualityPicker() {
  const { t } = useTranslation();
  const quality = useVisualQualityStore(state => state.quality);
  const setQuality = useVisualQualityStore(state => state.setQuality);
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const position = useAnchoredPanel(open, anchor, 268);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      const node = event.target as Node;
      if (!anchor.current?.contains(node) && !panel.current?.contains(node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopPropagation(); setOpen(false); anchor.current?.focus(); } };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape, true);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape, true); };
  }, [open]);
  return <>
    <button ref={anchor} type="button" title={t("player.visual_quality")} aria-label={t("player.visual_quality")}
      aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => setOpen(value => !value)} className="lane-fs-quality-trigger">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
        <path d="M12 3v4m0 10v4M3 12h4m10 0h4M5.6 5.6l2.8 2.8m7.2 7.2 2.8 2.8M5.6 18.4l2.8-2.8m7.2-7.2 2.8-2.8" /><circle cx="12" cy="12" r="3" />
      </svg>
    </button>
    {open && createPortal(<div ref={panel} id={id} role="menu" aria-label={t("player.visual_quality")}
      className="lane-fs-popover lane-fs-quality-menu dark" data-theme="dark" style={position}>
      <h3 className="m-0 text-[13px] font-semibold text-white">{t("player.visual_quality")}</h3>
      <p className="m-0 mb-2 mt-1 text-[11px] leading-[1.4] text-white/65">{t("player.visual_quality_hint")}</p>
      {(["all", "balanced", "lite"] as VisualQuality[]).map(mode => <button key={mode} type="button" role="menuitemradio" aria-checked={quality === mode}
        onClick={() => setQuality(mode)} className={`lane-fs-quality-option ${quality === mode ? "is-selected" : ""}`}>
        <span className="min-w-0 flex-1"><span className="block text-[12px] font-semibold">{t(`player.visual_quality_${mode}`)}</span>
          <span className="mt-0.5 block text-[11px] leading-[1.35] opacity-70">{t(`player.visual_quality_${mode}_hint`)}</span></span>
        {quality === mode && <CheckLine size={17} className="shrink-0" />}
      </button>)}
    </div>, document.body)}
  </>;
}
