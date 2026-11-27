import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useShallow } from "zustand/react/shallow";
import { CheckFill, DownLine, SparklesFill } from "@mingcute/react";
import { LuAudioLines, LuFilePenLine, LuFileText, LuListMusic, LuOrbit } from "react-icons/lu";
import { SiYoutubemusic } from "react-icons/si";
import { useIsMobile } from "@/shared/hooks/useIsMobile";
import { useAnchoredPanel } from "@/shared/hooks/useAnchoredPanel";
import { useTranslation } from "@/languages";
import { CUSTOM_LYRICS_PROVIDER } from "@/shared/media/lyrics/customLyrics";
import { useLyricsStore, hasSyncedLyricsSources } from "../store/lyricsStore";
import { LyricsOffsetSlider } from "./LyricsOffsetSlider";

const PANEL_WIDTH = 216;
const LANE_FLOW = "Lane Flow";

function LyricsOptionIcon({ provider }: { provider?: string }) {
  const props = { size: 14, className: "shrink-0 opacity-80", "aria-hidden": true } as const;
  if (!provider) return <SparklesFill {...props} data-lyrics-icon="flow" />;
  if (provider === CUSTOM_LYRICS_PROVIDER) return <LuFilePenLine {...props} data-lyrics-icon="custom" />;
  switch (provider.trim().toLowerCase()) {
    case "lrclib": return <LuListMusic {...props} data-lyrics-icon="lrclib" />;
    case "youtube music": return <SiYoutubemusic {...props} data-lyrics-icon="youtube-music" />;
    case "cadence": return <LuAudioLines {...props} data-lyrics-icon="cadence" />;
    case "polaris":
    case "polaris mono": return <LuOrbit {...props} data-lyrics-icon="polaris" />;
    default: return <LuFileText {...props} data-lyrics-icon="source" />;
  }
}

function optionClass(isMobile: boolean, selected: boolean) {
  return isMobile
    ? `flex min-h-[34px] w-full items-center justify-between gap-2 rounded-lg border-0 px-2.5 py-1.5 text-left text-[12px] ${selected ? "bg-white/15 text-white" : "bg-transparent text-white/70 hover:bg-white/10"}`
    : `lane-fs-provider-option ${selected ? "is-selected" : ""}`;
}

export function LyricsProviderIsland({ onEditCustomLyrics }: { onEditCustomLyrics?: () => void }) {
  const { t } = useTranslation();
  const { availableProviders, activeProvider, selectProvider, selectKaraoke, displayMode, braccatoLyrics, rawFormat, offsetMs, setOffset } = useLyricsStore(useShallow(s => ({
    availableProviders: s.availableProviders, activeProvider: s.activeProvider, selectProvider: s.selectProvider,
    selectKaraoke: s.selectKaraoke, displayMode: s.displayMode, braccatoLyrics: s.braccatoLyrics,
    rawFormat: s.rawFormat, offsetMs: s.offsetMs, setOffset: s.setOffset,
  })));
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const triggerContent = useRef<HTMLSpanElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const position = useAnchoredPanel(open, trigger, PANEL_WIDTH, 10, "center");
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
  const canEdit = !!onEditCustomLyrics && availableProviders.some(option => option.provider === CUSTOM_LYRICS_PROVIDER);
  const visible = !!availableProviders.length && !!braccatoLyrics.length && (synced || canEdit || availableProviders.length > 1);
  const index = Math.max(0, availableProviders.findIndex(provider => provider.provider === activeProvider));
  const current = availableProviders[index] ?? availableProviders[0];
  const currentSynced = !!current && hasSyncedLyricsSources([current]);
  const canKaraoke = hasSyncedLyricsSources(availableProviders);
  const karaokeSelected = displayMode === "karaoke" && currentSynced;
  const optionCount = availableProviders.length + Number(canKaraoke);
  const optionNumber = karaokeSelected ? 1 : index + 1 + Number(canKaraoke);
  const canOpen = optionCount > 1 || canEdit;
  const label = karaokeSelected ? LANE_FLOW : current?.provider === CUSTOM_LYRICS_PROVIDER
    ? t("player.custom_lyrics_title") : current?.provider ?? "";

  useLayoutEffect(() => {
    const button = trigger.current;
    const content = triggerContent.current;
    if (!visible || !button || !content) return;
    const measure = () => {
      const width = content.offsetWidth;
      if (!width) return;
      const nextWidth = `calc(${width}px + 1rem)`;
      if (button.style.getPropertyValue("--lane-lyrics-trigger-width") !== nextWidth) {
        button.style.setProperty("--lane-lyrics-trigger-width", nextWidth);
      }
    };
    measure();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    observer?.observe(content);
    return () => observer?.disconnect();
  }, [visible, label, optionNumber, optionCount, canOpen]);

  if (!visible || !current) return null;
  const menu = open && canOpen ? <motion.div key="lyrics-provider-menu"
    initial={isMobile ? { opacity: 0, scale: 0.95, y: -4 } : false}
    animate={isMobile ? { opacity: 1, scale: 1, y: 0 } : {}}
    exit={isMobile ? { opacity: 0, scale: 0.95, y: -4 } : {}}
    transition={{ duration: 0.12, ease: "easeOut" }} ref={panel} id={id} role="menu" aria-labelledby={`${id}-trigger`} data-theme="dark" data-no-sheet-drag data-no-window-drag
    style={{ ...position, width: PANEL_WIDTH }}
    className={isMobile ? "fixed z-[220] flex flex-col gap-1 rounded-xl border-0 bg-black/60 p-1.5 text-white shadow-xl backdrop-blur-2xl" : "lane-fs-popover lane-fs-provider-menu dark"}>
    {canKaraoke && (
      <button type="button" role="menuitemradio" aria-checked={karaokeSelected}
        className={optionClass(isMobile, karaokeSelected)}
        onClick={() => { selectKaraoke(); setOpen(false); }}>
        <span className="flex min-w-0 items-center gap-2">
          <LyricsOptionIcon />
          <span className="truncate">{LANE_FLOW}</span>
        </span>
        {karaokeSelected && <CheckFill size={14} className="shrink-0" />}
      </button>
    )}
    {availableProviders.map(option => {
      const selected = !karaokeSelected && option.provider === current.provider;
      return <button key={option.provider} type="button" role="menuitemradio" aria-checked={selected}
        onClick={() => { selectProvider(option.provider); setOpen(false); }}
        className={optionClass(isMobile, selected)}>
        <span className="flex min-w-0 items-center gap-2">
          <LyricsOptionIcon provider={option.provider} />
          <span className="truncate">{option.provider === CUSTOM_LYRICS_PROVIDER ? t("player.custom_lyrics_title") : option.provider}</span>
        </span>
        {selected && <CheckFill size={14} className="shrink-0" />}
      </button>;
    })}
    {canEdit && (
      <button type="button" role="menuitem" className={optionClass(isMobile, false)}
        onClick={() => { setOpen(false); onEditCustomLyrics?.(); }}>
        <span className="flex min-w-0 items-center gap-2">
          <LuFilePenLine size={14} aria-hidden className="shrink-0 opacity-80" />
          <span className="truncate">{t("player.custom_lyrics_edit")}</span>
        </span>
      </button>
    )}
    {currentSynced && <LyricsOffsetSlider value={offsetMs} onChange={setOffset} />}
  </motion.div> : null;
  return <div ref={root} className="lane-lyrics-provider relative inline-flex items-center pointer-events-auto select-none">
    <div className="inline-flex h-[32px] min-h-[32px] max-h-[32px] box-border items-center gap-[2px] rounded-[10px] border-0 bg-black/55 px-[3px] text-white shadow-none backdrop-blur-2xl">
      <button ref={trigger} id={`${id}-trigger`} type="button" aria-haspopup={canOpen ? "menu" : undefined}
        aria-expanded={canOpen ? open : undefined} aria-controls={open ? id : undefined}
        onClick={() => { if (canOpen) setOpen(value => !value); }}
        className={`lane-fs-provider-trigger flex h-[26px] items-center overflow-hidden rounded-[7px] border-0 bg-transparent px-2 text-[12px] font-medium text-white ${canOpen ? "cursor-pointer hover:bg-white/10" : "cursor-default"}`}>
        <span key={label} ref={triggerContent} className="lane-fs-provider-caption inline-flex w-max shrink-0 items-center gap-[6px] whitespace-nowrap">
          <LyricsOptionIcon provider={karaokeSelected ? undefined : current.provider} />
          <span className="max-w-[120px] truncate">{label}</span>
          {optionCount > 1 && <span className="text-[10px] font-mono text-white/50">{optionNumber}/{optionCount}</span>}
          {canOpen && <DownLine size={12} className={`text-white/50 transition-transform ${open ? "rotate-180" : ""}`} />}
        </span>
      </button>
    </div>
    {isMobile
      ? createPortal(<AnimatePresence>{menu}</AnimatePresence>, document.body)
      : menu ? createPortal(menu, document.body) : null}
  </div>;
}
