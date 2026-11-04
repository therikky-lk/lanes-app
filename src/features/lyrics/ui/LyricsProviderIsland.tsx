import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckFill, DownLine } from "@mingcute/react";
import { useIsMobile } from "@/shared/hooks/useIsMobile";
import { useAnchoredPanel } from "@/shared/hooks/useAnchoredPanel";
import { useLyricsStore, hasSyncedLyricsSources } from "../store/lyricsStore";

export function LyricsProviderIsland() {
  const { availableProviders, activeProvider, selectProvider, braccatoLyrics, rawFormat } = useLyricsStore();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const position = useAnchoredPanel(open && !isMobile, trigger, 160, 10, "center");
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!root.current?.contains(target) && !panel.current?.contains(target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.stopPropagation(); setOpen(false); trigger.current?.focus(); }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape, true);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape, true); };
  }, [open]);
  const synced = hasSyncedLyricsSources(availableProviders, braccatoLyrics, rawFormat);
  if (!availableProviders.length || !braccatoLyrics.length || (!synced && availableProviders.length <= 1)) return null;
  const index = Math.max(0, availableProviders.findIndex(provider => provider.provider === activeProvider));
  const current = availableProviders[index] ?? availableProviders[0];
  const multiple = availableProviders.length > 1;
  const menu = <motion.div key="lyrics-provider-menu"
    initial={isMobile ? { opacity: 0, scale: 0.95, y: -4 } : false}
    animate={isMobile ? { opacity: 1, scale: 1, y: 0 } : {}}
    exit={isMobile ? { opacity: 0, scale: 0.95, y: -4 } : {}}
    transition={{ duration: 0.12, ease: "easeOut" }} ref={panel} id={id} role="menu" aria-labelledby={`${id}-trigger`} data-theme="dark"
    style={isMobile ? undefined : position}
    className={isMobile ? "absolute top-full left-0 z-50 mt-[6px] flex min-w-[152px] flex-col gap-1 rounded-xl border-0 bg-black/40 p-1.5 text-white shadow-xl backdrop-blur-2xl" : "lane-fs-popover lane-fs-provider-menu dark"}>
    {availableProviders.map(option => {
      const selected = option.provider === current.provider;
      return <button key={option.provider} type="button" role="menuitemradio" aria-checked={selected}
        onClick={() => { selectProvider(option.provider); setOpen(false); }}
        className={isMobile ? `flex min-h-[34px] w-full items-center justify-between gap-2 rounded-lg border-0 px-2.5 py-1.5 text-left text-[12px] ${selected ? "bg-white/15 text-white" : "bg-transparent text-white/70 hover:bg-white/10"}` : `lane-fs-provider-option ${selected ? "is-selected" : ""}`}>
        <span className="truncate">{option.provider}</span>{selected && <CheckFill size={14} className="shrink-0" />}
      </button>;
    })}
  </motion.div>;
  return <div ref={root} className="lane-lyrics-provider relative inline-flex items-center pointer-events-auto select-none">
    <div className="inline-flex h-[32px] min-h-[32px] max-h-[32px] box-border items-center gap-[2px] rounded-[10px] border-0 bg-black/55 px-[3px] text-white shadow-none backdrop-blur-2xl">
      <button ref={trigger} id={`${id}-trigger`} type="button" aria-haspopup={multiple ? "menu" : undefined}
        aria-expanded={multiple ? open : undefined} aria-controls={open ? id : undefined}
        onClick={() => { if (multiple) setOpen(value => !value); }}
        className={`lane-fs-provider-trigger flex h-[26px] items-center gap-[6px] rounded-[7px] border-0 bg-transparent px-2 text-[12px] font-medium text-white ${multiple ? "cursor-pointer hover:bg-white/10" : "cursor-default"}`}>
        <span className="max-w-[120px] truncate">{current.provider}</span>
        {multiple && <><span className="text-[10px] font-mono text-white/50">{index + 1}/{availableProviders.length}</span><DownLine size={12} className={`text-white/50 transition-transform ${open ? "rotate-180" : ""}`} /></>}
      </button>
    </div>
    {isMobile ? <AnimatePresence>{open && multiple ? menu : null}</AnimatePresence> : open && multiple ? createPortal(menu, document.body) : null}
  </div>;
}
