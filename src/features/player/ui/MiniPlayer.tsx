import { ArtistAvatars } from "@/features/artist/ui/ArtistAvatars";
import { EqualizerPicker } from "./EqualizerPicker";
import { isEqActive } from "../engine/equalizer";
import { Settings6Line } from "@mingcute/react";
import ConnectDevicesButton from "@/features/connect/ui/ConnectDevicesButton";
import { memo } from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { AnimatePresence, motion } from "framer-motion";
import {
  Radio,
  Sidebar,
  SkipNext,
  SkipPrevious,
  MaximizeSquare3,
  TrashBin2,
  Bookmark,
  PlaybackSpeed,
  VolumeCross,
  VolumeSmall,
  VolumeLoud,
  Repeat,
  RepeatOne,
  Shuffle,
} from "@solar-icons/react";
import { HeartFill, HeartLine } from "@mingcute/react";
import { LuChevronUp } from "react-icons/lu";

import {
  PlayerMorphIcon,
  ICON_PLAY,
  ICON_PAUSE,
} from "./morphPlayerIcons";

import { playerEngine } from "../engine/playerEngine";
import { isRadioContext, nextRepeatMode } from "../engine/radioMode";
import Button from "@/shared/ui/Button";
import { useTranslation } from "@/languages";
import { useIsTrackLiked, useLikeTrack, useUnlikeTrack } from "@/features/library/hooks";
import { usePlayerStore } from "../store/playerStore";
import { toVolumeGain, toVolumeLevel } from "../engine/volume";
import { VerticalVolumeSlider, VolumeLevelIcon } from "./VerticalVolumeSlider";
import { SpeedPitchPicker } from "./SpeedPitchPicker";
import { TimelineSlider, type TimelineSliderProps } from "./TimelineSlider";
import { useTheme } from "next-themes";
import { useCoverReady, CoverImage } from "@/features/covers";
import { useCustomizationStore, getBlockStyle } from "@/features/settings/store/customizationStore";
import ExplicitBadge from "@/shared/ui/ExplicitBadge";
import SourceBadge from "@/shared/ui/SourceBadge";
import { ArtistLink } from "@/features/artist";


function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  let r: number, g: number, b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function extractColorsFromCanvas(
  canvas: HTMLCanvasElement,
  isLight = false,
): {
  accentColor: string;
  accentColorSolid: string;
} {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    return {
      accentColor: "rgba(255, 255, 255, 0.12)",
      accentColorSolid: "rgb(255, 255, 255)",
    };
  }

  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let totalWeight = 0;
  let weightedR = 0;
  let weightedG = 0;
  let weightedB = 0;
  let totalR = 0;
  let totalG = 0;
  let totalB = 0;
  const count = data.length / 4;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    totalR += r;
    totalG += g;
    totalB += b;

    const [, s, l] = rgbToHsl(r, g, b);
    if (l > 0.08 && l < 0.95 && s > 0.1) {
      const vibrancy = s * (1 - Math.abs(l - 0.5) * 1.5);
      const weight = Math.max(0.01, vibrancy * vibrancy);
      weightedR += r * weight;
      weightedG += g * weight;
      weightedB += b * weight;
      totalWeight += weight;
    }
  }

  let finalR = Math.round(totalWeight > 0.5 ? weightedR / totalWeight : totalR / count);
  let finalG = Math.round(totalWeight > 0.5 ? weightedG / totalWeight : totalG / count);
  let finalB = Math.round(totalWeight > 0.5 ? weightedB / totalWeight : totalB / count);

  const [h, s, l] = rgbToHsl(finalR, finalG, finalB);

  if (isLight) {
    if (s < 0.12) {
      return {
        accentColor: "rgba(0, 0, 0, 0.045)",
        accentColorSolid: "rgb(30, 30, 30)",
      };
    }
    // Luminous vibrant tint for light theme card progress fill
    const tintL = 0.50;
    const tintS = Math.max(0.80, s);
    const [tintR, tintG, tintB] = hslToRgb(h, tintS, tintL);

    // Deep high-contrast tone for bottom timeline line
    const solidL = Math.max(0.36, Math.min(0.46, l > 0.55 ? 0.40 : l));
    const solidS = Math.max(0.75, s);
    const [solidR, solidG, solidB] = hslToRgb(h, solidS, solidL);

    return {
      accentColor: `rgba(${tintR}, ${tintG}, ${tintB}, 0.09)`,
      accentColorSolid: `rgb(${solidR}, ${solidG}, ${solidB})`,
    };
  }

  // If mostly achromatic / monochrome (black, white, or gray cover)
  if (s < 0.12) {
    return {
      accentColor: l < 0.5 ? "rgba(255, 255, 255, 0.14)" : "rgba(255, 255, 255, 0.09)",
      accentColorSolid: "rgb(255, 255, 255)",
    };
  }

  // Ensure high contrast and vibrant visibility on dark backgrounds
  const solidL = Math.max(0.65, Math.min(0.82, l < 0.45 ? 0.70 : l));
  const solidS = Math.max(0.70, s);
  const [solidR, solidG, solidB] = hslToRgb(h, solidS, solidL);

  const bgOpacity = l < 0.25 ? 0.22 : l < 0.5 ? 0.18 : 0.12;

  return {
    accentColor: `rgba(${solidR}, ${solidG}, ${solidB}, ${bgOpacity})`,
    accentColorSolid: `rgb(${solidR}, ${solidG}, ${solidB})`,
  };
}

export interface MiniPlayerProps {
  onQueueOpenChange?: (open: boolean) => void;
  onQueueToggle?: () => void;
  onFullscreenOpen?: () => void;
  embedded?: boolean;
  isEdgeToEdge?: boolean;
}

function MiniPlayerProgress({ durationMs, scrubRatio, color }: {
  durationMs: number;
  scrubRatio: number | null;
  color: string;
}) {
  const positionMs = usePlayerStore((state) => state.positionMs);
  const progress = scrubRatio ?? (durationMs > 0 ? Math.min(1, Math.max(0, positionMs / durationMs)) : 0);
  return (
    <div
      data-mini-player-progress
      className="absolute inset-y-0 left-0 z-0 pointer-events-none"
      style={{
        backgroundColor: color,
        width: `${progress * 100}%`,
        willChange: "width",
        transition: scrubRatio !== null ? "none" : "width 200ms cubic-bezier(0.22, 1, 0.36, 1)",
      }}
    />
  );
}

const seekPlayback = (positionMs: number) => playerEngine.seek(positionMs);

function MiniPlayerTimeline(props: Omit<TimelineSliderProps, "positionMs" | "onSeek">) {
  const positionMs = usePlayerStore((state) => state.positionMs);
  return <TimelineSlider {...props} positionMs={positionMs} onSeek={seekPlayback} />;
}

function MiniPlayer({
  onQueueOpenChange,
  onQueueToggle,
  onFullscreenOpen,
  embedded = false,
  isEdgeToEdge = false,
}: MiniPlayerProps) {
  const player = usePlayerStore(useShallow((state) => ({
    currentTrack: state.currentTrack,
    durationMs: state.durationMs,
    status: state.status,
    volume: state.volume,
    repeat: state.repeat,
    shuffle: state.shuffle,
    playbackContext: state.playbackContext,
    isEqEnabled: state.isEqEnabled,
    eqGains: state.eqGains,
    playbackRate: state.playbackRate,
    pitchSemitones: state.pitchSemitones,
  })));
  const { t } = useTranslation();
  const { resolvedTheme } = useTheme();
  const isLight =
    resolvedTheme
      ? resolvedTheme === "light"
      : typeof document !== "undefined" && document.documentElement.getAttribute("data-theme") === "light";
  const miniPlayerStyle = usePlayerStore((state) => state.miniPlayerStyle);
  const usesRoundedStyle = !embedded && miniPlayerStyle === "rounded";
  const backgroundImage = useCustomizationStore((state) => state.backgroundImage);
  const miniplayerConfig = useCustomizationStore((state) => state.miniplayer);
  const hasCustomBg = Boolean(backgroundImage && !isLight);
  const miniplayerCustomStyle = getBlockStyle(miniplayerConfig, !isLight, hasCustomBg);
  const [accentColor, setAccentColor] = useState(
    isLight ? "rgba(0, 0, 0, 0.06)" : "rgba(255, 255, 255, 0.12)",
  );

  const [accentColorSolid, setAccentColorSolid] = useState(
    isLight ? "rgb(23, 23, 23)" : "rgb(255, 255, 255)",
  );
  const coverUrl = player.currentTrack?.coverUrl || "";

  useEffect(() => {
    if (!coverUrl) {
      setAccentColor(isLight ? "rgba(0, 0, 0, 0.06)" : "rgba(255, 255, 255, 0.12)");
      setAccentColorSolid(isLight ? "rgb(23, 23, 23)" : "rgb(255, 255, 255)");
      return;
    }
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, 64, 64);
        const { accentColor: ac, accentColorSolid: acs } = extractColorsFromCanvas(canvas, isLight);
        setAccentColor(ac);
        setAccentColorSolid(acs);
      } catch {
        setAccentColor(isLight ? "rgba(0, 0, 0, 0.06)" : "rgba(255, 255, 255, 0.12)");
        setAccentColorSolid(isLight ? "rgb(23, 23, 23)" : "rgb(255, 255, 255)");
      }
    };
    img.src = coverUrl;
  }, [coverUrl, isLight]);

  const extractAccentColor = useCallback((img: HTMLImageElement) => {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, 64, 64);
      const { accentColor: ac, accentColorSolid: acs } = extractColorsFromCanvas(canvas, isLight);
      setAccentColor(ac);
      setAccentColorSolid(acs);
    } catch {
      setAccentColor(isLight ? "rgba(0, 0, 0, 0.06)" : "rgba(255, 255, 255, 0.12)");
      setAccentColorSolid(isLight ? "rgb(23, 23, 23)" : "rgb(255, 255, 255)");
    }
  }, [isLight]);

  const [volumeOpen, setVolumeOpen] = useState(false);
  const [volumePopupStyle, setVolumePopupStyle] = useState<React.CSSProperties>(
    { bottom: 52 },
  );
  const [speedOpen, setSpeedOpen] = useState(false);
  const [audioPanel, setAudioPanel] = useState<"speed" | "eq">("speed");
  const eqToggleRef = useRef<HTMLButtonElement>(null);
  const miniPlayerRootRef = useRef<HTMLDivElement>(null);
  const volumePopupRef = useRef<HTMLDivElement>(null);
  const volumeToggleRef = useRef<HTMLDivElement>(null);
  const speedPopupRef = useRef<HTMLDivElement>(null);
  const speedToggleRef = useRef<HTMLButtonElement>(null);
  const volumeHoverCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const [isVolumeDragging, setIsVolumeDragging] = useState(false);
  const lastNonZeroVolumeRef = useRef<number>(0.7);

  const currentTrack = player.currentTrack;
  const volumeLevel = toVolumeLevel(player.volume);
  const isLiked = useIsTrackLiked(currentTrack?.id);
  const likeMutation = useLikeTrack();
  const unlikeMutation = useUnlikeTrack();
  const togglingRef = useRef(false);

  const handleLikeToggle = useCallback(() => {
    if (!currentTrack || togglingRef.current) return;
    togglingRef.current = true;
    const onSettled = () => {
      togglingRef.current = false;
    };
    if (isLiked) {
      unlikeMutation.mutate(currentTrack.id, { onSettled });
    } else {
      likeMutation.mutate(currentTrack.id, { onSettled });
    }
  }, [currentTrack, isLiked, likeMutation, unlikeMutation]);

  const durationMs =
    player.durationMs > 0
      ? player.durationMs
      : (player.currentTrack?.durationMs ?? 0);
  const isPlaying = player.status === "playing";
  const isLoading = player.status === "loading";
  const trackTitle = player.currentTrack?.title ?? t("player.nothing_playing");
  const trackArtists =
    player.currentTrack?.artists ?? t("player.choose_track");

  const isCoverLoaded = useCoverReady(coverUrl);

  // off -> all (loop the whole queue/playlist) -> one (loop the track) -> off
  const repeatIcon = useMemo(() => {
    if (player.repeat === "one") return <RepeatOne size={18} weight="Outline" />;
    return <Repeat size={18} weight="Outline" />;
  }, [player.repeat]);
  const repeatLabel = t(`player.repeat_${player.repeat}`);

  // "on" state for the shuffle / repeat toggles: the hover tint, but opaque, so the
  // progress fill sliding underneath never changes it. Values are the hover tint
  // pre-composited over the toolbox on bg-primary (dark #0a0a0a, light #f5f5f7).
  // The toolbox pill itself is the opaque bg-toolbox equivalent for the same reason.
  const activeToggleClass = "!bg-[#dfdfe1] dark:!bg-[#292929] !text-text-primary";

  const iconButtonClass =
    "inline-flex h-[30px] w-[30px] items-center justify-center rounded-md text-text-secondary transition-colors duration-150 hover:bg-black/[0.05] dark:hover:bg-white/[0.09] hover:text-text-primary active:scale-[0.96] border-none bg-transparent cursor-pointer";

  const clearVolumeHoverTimer = useCallback(() => {
    if (volumeHoverCloseTimerRef.current) {
      clearTimeout(volumeHoverCloseTimerRef.current);
      volumeHoverCloseTimerRef.current = null;
    }
  }, []);

  const updateVolumePopupPosition = useCallback(() => {
    const toggle = volumeToggleRef.current;
    const root = miniPlayerRootRef.current;
    if (!toggle || !root) return;
    const toggleRect = toggle.getBoundingClientRect();
    const rootRect = root.getBoundingClientRect();
    const bar =
      toggle.closest<HTMLElement>(".bg-bg-toolbox") || toggle.parentElement;
    const barRect = bar?.getBoundingClientRect();

    const popupW = 46;
    const btnW = toggleRect.width;
    const right = rootRect.right - toggleRect.right + (btnW - popupW) / 2;
    const targetTop = barRect ? barRect.top : toggleRect.top;
    const bottom = rootRect.bottom - targetTop + 2;

    setVolumePopupStyle({
      right: Math.max(8, right),
      bottom: Math.round(bottom),
    });
  }, []);

  const handleVolumeMouseEnter = useCallback(() => {
    clearVolumeHoverTimer();
    updateVolumePopupPosition();
    setSpeedOpen(false);
    setVolumeOpen(true);
  }, [clearVolumeHoverTimer, updateVolumePopupPosition]);

  const handleVolumeMouseLeave = useCallback(() => {
    clearVolumeHoverTimer();
    // Keep open while user is actively dragging the slider
    if (isVolumeDragging) return;
    volumeHoverCloseTimerRef.current = setTimeout(() => {
      setVolumeOpen(false);
    }, 140);
  }, [clearVolumeHoverTimer, isVolumeDragging]);

  const handleToggleMute = useCallback(() => {
    if (volumeLevel > 0) {
      lastNonZeroVolumeRef.current = volumeLevel;
      playerEngine.setVolume(0);
    } else {
      const restore = lastNonZeroVolumeRef.current || 0.7;
      playerEngine.setVolume(toVolumeGain(restore));
    }
  }, [volumeLevel]);

  useEffect(() => {
    const toggle = volumeToggleRef.current;
    if (!toggle) return;

    const handleVolumeWheel = (event: WheelEvent) => {
      if (event.deltaY === 0 || event.ctrlKey) return;
      event.preventDefault();
      event.stopPropagation();

      const currentPercent = Math.round(toVolumeLevel(usePlayerStore.getState().volume) * 100);
      const step = event.deltaY < 0 ? 4 : -4;
      playerEngine.setVolume(toVolumeGain((currentPercent + step) / 100));
      handleVolumeMouseEnter();
    };

    // React's wheel listener is passive; cancel scrolling on the button itself.
    toggle.addEventListener("wheel", handleVolumeWheel, { passive: false });
    return () => toggle.removeEventListener("wheel", handleVolumeWheel);
  }, [handleVolumeMouseEnter]);

  const handleVolumeDraggingChange = useCallback((dragging: boolean) => {
    setIsVolumeDragging(dragging);
  }, []);

  useEffect(() => {
    return () => {
      clearVolumeHoverTimer();
    };
  }, [clearVolumeHoverTimer]);

  useEffect(() => {
    if (!volumeOpen) return;
    updateVolumePopupPosition();
  }, [volumeOpen, updateVolumePopupPosition]);

  useLayoutEffect(() => {
    if (!speedOpen) return;
    const toggle = audioPanel === "eq" ? eqToggleRef.current : speedToggleRef.current;
    const root = miniPlayerRootRef.current;
    const popup = speedPopupRef.current;
    if (!toggle || !root || !popup) return;
    const positionPopup = () => {
      const toggleRect = toggle.getBoundingClientRect();
      const rootRect = root.getBoundingClientRect();
      const width = popup.offsetWidth;
      const right = rootRect.right - toggleRect.left - (toggleRect.width + width) / 2;
      const limit = rootRect.width - width - 8;
      popup.style.right = `${Math.max(8, Math.min(limit, right))}px`;
    };
    // Anchor before the first paint; never animate from the element's static position.
    positionPopup();
    const observer = new ResizeObserver(positionPopup);
    observer.observe(root);
    observer.observe(popup);
    return () => observer.disconnect();
  }, [speedOpen, audioPanel]);

  useEffect(() => {
    const onDocumentPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }

      if (volumeOpen) {
        const clickedVolumePopup = volumePopupRef.current?.contains(target);
        const clickedVolumeToggle =
          volumeToggleRef.current?.contains(target);
        if (!clickedVolumePopup && !clickedVolumeToggle) {
          clearVolumeHoverTimer();
          setVolumeOpen(false);
        }
      }

      if (speedOpen) {
        const clickedSpeedPopup = speedPopupRef.current?.contains(target);
        const clickedSpeedToggle =
          speedToggleRef.current?.contains(target);
        if (!clickedSpeedPopup && !clickedSpeedToggle && !eqToggleRef.current?.contains(target)) {
          setSpeedOpen(false);
        }
      }
    };

    const onDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (volumeOpen) {
          event.preventDefault();
          event.stopPropagation();
          clearVolumeHoverTimer();
          setVolumeOpen(false);
        }
        if (speedOpen) {
          event.preventDefault();
          event.stopPropagation();
          setSpeedOpen(false);
        }
      }
    };

    document.addEventListener("mousedown", onDocumentPointerDown, true);
    document.addEventListener("keydown", onDocumentKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", onDocumentPointerDown, true);
      document.removeEventListener("keydown", onDocumentKeyDown, true);
    };
  }, [clearVolumeHoverTimer, speedOpen, volumeOpen]);

  const [scrubRatio, setScrubRatio] = useState<number | null>(null);

  return (
    <div
      ref={miniPlayerRootRef}
      className="relative h-[64px] w-full select-none"
    >
      <AnimatePresence>
        {speedOpen && (
          <motion.div
            key="speed-popup"
            ref={speedPopupRef}
            initial={false}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className="absolute bottom-[74px] right-2 z-[92] max-h-[calc(100dvh-94px)] w-[300px] max-w-[calc(100%-16px)] overflow-y-auto overscroll-contain rounded-[18px] border border-white/[0.08] bg-black/20 p-[16px] shadow-2xl backdrop-blur-xl prevent-seek"
            onPointerDown={(e) => e.stopPropagation()}
          >
            {audioPanel === "eq" ? <EqualizerPicker /> : <SpeedPitchPicker onClose={() => setSpeedOpen(false)} />}
          </motion.div>
        )}
      </AnimatePresence>

      <div
        data-liquid-glass="player"
        className={`relative h-[64px] w-full overflow-hidden cursor-pointer ${
          usesRoundedStyle
            ? `rounded-full border-[0.5px] border-border-tertiary ${
                hasCustomBg ? "" : "bg-bg-primary"
              }`
            : embedded
              ? `rounded-sm ${
                  isEdgeToEdge ? "rounded-br-none" : "rounded-br-xl"
                } ${
                  hasCustomBg ? "" : "bg-bg-primary"
                }`
              : `rounded-3xl border-[0.5px] border-border-tertiary ${
                  hasCustomBg ? "" : "bg-bg-primary"
                }`
        }`}
        style={miniplayerCustomStyle}
        onPointerDown={(e) => {

          if (e.button !== 0) return;
          const target = e.target as Element | null;
          if (
            !target ||
            target.closest?.(
              "button, a, input, [role='button'], [role='slider'], .prevent-seek",
            )
          ) {
            return;
          }
          const card = e.currentTarget;
          const rect = card.getBoundingClientRect();
          if (!rect.width || !durationMs) return;

          const calcRatio = (clientX: number) =>
            Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));

          const initialRatio = calcRatio(e.clientX);
          setScrubRatio(initialRatio);

          const onMove = (ev: PointerEvent) => {
            const r = calcRatio(ev.clientX);
            setScrubRatio(r);
          };

          const onUp = (ev: PointerEvent) => {
            const finalRatio = calcRatio(ev.clientX);
            setScrubRatio(null);
            playerEngine.seek(finalRatio * durationMs);
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
            window.removeEventListener("pointercancel", onUp);
          };

          window.addEventListener("pointermove", onMove);
          window.addEventListener("pointerup", onUp);
          window.addEventListener("pointercancel", onUp);
        }}
      >
        <MiniPlayerProgress durationMs={durationMs} scrubRatio={scrubRatio} color={accentColor} />

        {embedded ? null : (
          <div
            className={`absolute z-30 prevent-seek ${
              usesRoundedStyle
                ? "left-[18px] right-[18px] bottom-[2px]"
                : "left-[8px] right-[8px] bottom-[2px]"
            }`}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <MiniPlayerTimeline
              durationMs={durationMs}
              size="xs"
              fillColor={accentColorSolid || undefined}
              fillClassName={!accentColorSolid ? (isLight ? "bg-text-primary" : "bg-white") : undefined}
              trackBg={isLight ? "rgba(0, 0, 0, 0.08)" : "rgba(255, 255, 255, 0.15)"}
              trackActiveBg={isLight ? "rgba(0, 0, 0, 0.16)" : "rgba(255, 255, 255, 0.32)"}
              className="!h-[14px]"
            />
          </div>
        )}
        <div
          className={`relative grid h-full pointer-events-none ${
            embedded
              ? "grid-cols-[280px_minmax(0,1fr)_auto]"
              : "grid-cols-[286px_minmax(0,1fr)]"
          } ${!usesRoundedStyle && !embedded ? "pb-[4px]" : ""}`}
        >
          <div className="flex h-full items-center gap-[16px] px-[18px] pt-[1px] pointer-events-none cursor-default">
            <button
              type="button"
              data-keep-keyboard-focus
              aria-label={t("player.open_fullscreen_player")}
              title={t("player.open_fullscreen_player")}
              className={`group relative h-[38px] w-[38px] shrink-0 overflow-hidden rounded-[8px] border-0 p-0 bg-bg-elevated cursor-pointer pointer-events-auto prevent-seek ${
                coverUrl && !isCoverLoaded ? "animate-pulse" : ""
              }`}
              onClick={onFullscreenOpen}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <CoverImage
                key={coverUrl}
                src={coverUrl}
                alt=""
                width={38}
                height={38}
                priority
                draggable={false}
                onLoad={(e) => {
                  extractAccentColor(e.currentTarget as HTMLImageElement);
                }}
                className="h-[38px] w-[38px] object-cover rounded-[8px]"
              />
              <span aria-hidden className="pointer-events-none absolute bottom-[3px] right-[3px] grid size-4 place-items-center rounded-full bg-black/50 text-white backdrop-blur-sm opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                <LuChevronUp size={11} />
              </span>
            </button>
            <div className="flex min-w-0 flex-col pointer-events-none">
              <p
                className="m-0 truncate text-[16px] font-[400] text-text-primary flex items-center gap-[6px] pointer-events-none"
                style={{
                  fontFamily: "var(--font-inter), sans-serif",
                  lineHeight: "18px",
                  letterSpacing: "0",
                }}
              >
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={t("player.open_player")}
                  className="min-w-0 truncate cursor-pointer pointer-events-auto prevent-seek"
                  onClick={onFullscreenOpen}
                  onPointerDown={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onFullscreenOpen?.();
                    }
                  }}
                >
                  {trackTitle}
                </span>
              </p>
              <p
                className="m-0 mt-[4px] flex min-w-0 items-center gap-[5px] text-[13px] font-[300] text-text-tertiary pointer-events-none"
                style={{
                  fontFamily: "var(--font-inter), sans-serif",
                  lineHeight: "15px",
                }}
              >
                {player.currentTrack && <SourceBadge trackId={player.currentTrack.id} className="mr-[2px]" />}
                <ArtistAvatars name={trackArtists} artistId={player.currentTrack?.artistId} artistList={player.currentTrack?.artistList} />
                <ArtistLink
                  name={trackArtists}
                  artistId={player.currentTrack?.artistId}
                  artistList={player.currentTrack?.artistList}
                  trackId={player.currentTrack?.id}
                  className="text-text-tertiary pointer-events-auto"
                />
                {player.currentTrack?.explicit && <ExplicitBadge />}
              </p>
            </div>
            <button
              type="button"
              aria-label={isLiked ? t("common.unlike") : t("common.like")}
              className={`${iconButtonClass} shrink-0 transition-colors duration-150 pointer-events-auto prevent-seek ${
                isLiked ? "!text-[#ff3b5c] !opacity-100" : "text-text-secondary hover:text-text-primary"
              }`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={handleLikeToggle}
              style={{ cursor: "pointer" }}
            >
              {isLiked ? <HeartFill size={20} /> : <HeartLine size={20} />}
            </button>
          </div>

          <div
            className={`flex h-full items-center pl-[10px] pr-[18px] pointer-events-none ${
              embedded ? "col-start-3" : ""
            }`}
          >
            <div
              className="ml-auto flex items-center gap-[2px] rounded-lg bg-[#ebebed] dark:bg-[#141414] p-[3px] pointer-events-auto prevent-seek cursor-default"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                aria-label={t("common.shuffle")}
                title={player.shuffle ? t("player.shuffle_on") : t("player.shuffle_off")}
                className={`${iconButtonClass} ${
                  player.shuffle ? activeToggleClass : ""
                }`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => playerEngine.setShuffle(!player.shuffle)}
              >
                <Shuffle size={18} weight="Outline" />
              </button>
              <button
                type="button"
                aria-label={repeatLabel}
                title={repeatLabel}
                className={`${iconButtonClass} ${
                  player.repeat !== "off" ? activeToggleClass : ""
                }`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() =>
                  playerEngine.setRepeat(
                    // radio has no repeat-all: it refills instead of looping
                    nextRepeatMode(player.repeat, isRadioContext(player.playbackContext)),
                  )
                }
              >
                {repeatIcon}
              </button>
              <button ref={eqToggleRef} type="button" aria-label={t("player.equalizer")} title={t("player.equalizer")}
                aria-expanded={speedOpen && audioPanel === "eq"}
                className={`${iconButtonClass} ${isEqActive(player.isEqEnabled, player.eqGains) || (speedOpen && audioPanel === "eq") ? activeToggleClass : ""}`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => { setVolumeOpen(false); onQueueOpenChange?.(false); setAudioPanel("eq"); setSpeedOpen(audioPanel !== "eq" || !speedOpen); }}>
                <Settings6Line size={18} />
              </button>
              <button
                ref={speedToggleRef}
                type="button"
                aria-label={t("player.speed_pitch")}
                title={`${t("player.speed_pitch")}: x${(player.playbackRate ?? 1).toFixed(2)}`}
                className={`${iconButtonClass} ${
                  speedOpen ||
                  Math.abs((player.playbackRate ?? 1) - 1) > 0.001 ||
                  Math.abs(player.pitchSemitones ?? 0) > 0.001
                    ? "bg-white/[0.09] text-white"
                    : ""
                }`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => {
                  setVolumeOpen(false);
                  onQueueOpenChange?.(false);
                  setAudioPanel("speed");
                  setSpeedOpen(audioPanel !== "speed" || !speedOpen);
                }}
                style={{ cursor: "pointer" }}
              >
                <motion.div
                  animate={{
                    scale: speedOpen ? 1.08 : 1,
                  }}
                  transition={{ type: "spring", stiffness: 350, damping: 22 }}
                  className="flex items-center justify-center"
                >
                  <PlaybackSpeed
                    size={18}
                    weight={
                      Math.abs((player.playbackRate ?? 1) - 1) > 0.001 ||
                      Math.abs(player.pitchSemitones ?? 0) > 0.001
                        ? "Bold"
                        : "Outline"
                    }
                  />
                </motion.div>
              </button>
               <div
                 ref={volumeToggleRef}
                 onMouseEnter={handleVolumeMouseEnter}
                 onMouseLeave={handleVolumeMouseLeave}
               >
                 <button
                   type="button"
                   aria-label={t("player.volume")}
                   aria-expanded={volumeOpen}
                   className={`${iconButtonClass} ${volumeOpen ? activeToggleClass : ""}`}
                   onClick={handleVolumeMouseEnter}
                 >
                   <VolumeLevelIcon level={volumeLevel} size={18} />
                 </button>
              </div>
              <ConnectDevicesButton className={iconButtonClass} />
              <button
                type="button"
                aria-label={t("player.open_player")}
                title={t("player.open_player")}
                className={iconButtonClass}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => {
                  setSpeedOpen(false);
                  setVolumeOpen(false);
                  onFullscreenOpen?.();
                }}
              >
                <MaximizeSquare3 size={18} weight="Outline" />
              </button>
              <span
                className="mx-[3px] h-[16px] w-px bg-border-toolbox-divider"
                aria-hidden="true"
              />
              <button
                type="button"
                aria-label={t("player.queue")}
                title={t("player.queue")}
                className={iconButtonClass}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => {
                  setSpeedOpen(false);
                  setVolumeOpen(false);
                  onQueueToggle?.();
                }}
                style={{ cursor: "pointer" }}
              >
                <Sidebar size={20} weight="Bold" />
              </button>
            </div>
          </div>
        </div>

        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div
            className="pointer-events-auto flex items-center gap-[8px] prevent-seek cursor-default"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              aria-label={t("player.previous")}
              className={`${iconButtonClass} text-text-secondary hover:text-text-primary`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => {
                void playerEngine.skipPrevious();
              }}
              style={{ cursor: "pointer" }}
            >
              <SkipPrevious size={18} weight="Bold" />
            </button>
            <button
              type="button"
              aria-label={isPlaying ? t("common.pause") : t("common.play")}
              className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-full bg-btn-primary-bg text-btn-primary-text transition-all duration-150 ease-out hover:scale-105 active:scale-[0.96] border-none cursor-pointer shadow-sm"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => {
                void playerEngine.togglePlayPause();
              }}
              style={{ cursor: "pointer" }}
            >
              {/* keep the morph icon mounted through the loading state
                  (spinner overlays it) — swapping it out on "loading" would
                  remount MorphIcon when the track starts, which skips the
                  play -> pause morph animation. */}
              <span className="relative flex h-[16px] w-[16px] items-center justify-center">
                <span
                  className={`absolute inset-0 flex items-center justify-center ${
                    isLoading ? "opacity-0" : ""
                  } transition-transform ${
                    isPlaying ? "" : "translate-x-[0.5px]"
                  }`}
                >
                  <PlayerMorphIcon
                    icon={isPlaying ? ICON_PAUSE : ICON_PLAY}
                    size={16}
                  />
                </span>
                {isLoading && (
                  <span
                    className="absolute h-[16px] w-[16px] animate-spin rounded-full border-[2px] border-current border-t-transparent"
                    aria-label={t("player.loading_playback")}
                  />
                )}
              </span>
            </button>
            <button
              type="button"
              aria-label={t("player.next")}
              className={`${iconButtonClass} text-text-secondary hover:text-text-primary`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => {
                void playerEngine.skipNext();
              }}
              style={{ cursor: "pointer" }}
            >
              <SkipNext size={18} weight="Bold" />
            </button>
          </div>
        </div>
      </div>
      {volumeOpen && (
        <div
          ref={volumePopupRef}
          style={volumePopupStyle}
          className="prevent-seek pointer-events-auto absolute z-50"
          onMouseEnter={clearVolumeHoverTimer}
          onMouseLeave={handleVolumeMouseLeave}
          onPointerDown={event => event.stopPropagation()}
        >
          <VerticalVolumeSlider />
        </div>
      )}
    </div>
  );
}

export default memo(MiniPlayer);
