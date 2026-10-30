import { isNativeApp } from "@/shared/platform/native";
import { isLowEndDevice } from "@/shared/platform/deviceTier";
import { Fragment, useEffect, useRef, useState } from "react";
import { useIsTrackLiked } from "@/features/library/hooks";
import { createPortal } from "react-dom";
import { CloseLine, DownLine, HeartFill, LightningFill, PauseFill, PlayFill, Refresh2Line, Settings6Line, Sparkles2Fill, UpLine, MicOffLine, PawFill } from "@mingcute/react";
import { Emoji } from "react-apple-emojis";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { useIsMobile } from "@/shared/hooks/useIsMobile";
import { playerEngine, usePlayerStore } from "@/features/player";
import { useTranslation } from "@/languages";
import type { Track } from "@/shared/types/track";
import { BeatTracker } from "../vibe/audioAnalyser";
import { isVibeContext, sameSettings, startVibe, storedSettings, storeSettings, vibeSettingsOf } from "../vibe/vibeController";
import {
  VIBE_CHARACTERS,
  VIBE_MOODS,
  type VibeCharacter,
  type VibeLanguage,
  type VibeMood,
  type VibeSettings,
} from "../vibe/vibeTaste";
import { lerpPalette, loadVibePalette, rgba, type VibePalette } from "../vibe/vibePalette";
import { useCoverSrc } from "@/features/covers";

// My Vibe: a dark stage with a smoky ring of light that breathes with the
// music, in the picked mood's colour (violet with no mood); a like on the
// playing track sends a pulse through it. The title is the play / pause control.

const HERO_HEIGHT = 400;
// the glow spills a little past the section instead of being cut off
const BLEED = 70;

/** one hue per mood: [highlight, main colour, deep shade] */
export const MOOD_PALETTES: Record<VibeMood, VibePalette> = {
  energetic: [
    [255, 150, 120],
    [255, 40, 60],
    [150, 0, 50],
  ],
  happy: [
    [255, 240, 120],
    [255, 176, 0],
    [200, 80, 0],
  ],
  calm: [
    [210, 240, 232],
    [120, 170, 160],
    [50, 80, 84],
  ],
  sad: [
    [170, 175, 255],
    [90, 70, 255],
    [50, 20, 160],
  ],
};

/** no mood picked: a violet-magenta glow */
const NEUTRAL_PALETTE: VibePalette = [
  [255, 170, 245],
  [210, 40, 210],
  [100, 10, 150],
];

/** the swatch for each mood in the settings */
const MOOD_SWATCH: Record<VibeMood, string> = {
  energetic: "linear-gradient(160deg,#ff9a8a,#ff3c46 55%,#aa143c)",
  happy: "linear-gradient(160deg,#ffec96,#ffaa1e 55%,#dc640a)",
  calm: "linear-gradient(160deg,#e1ebe8,#96afaa 55%,#506468)",
  sad: "linear-gradient(160deg,#bebeff,#685af5 55%,#4628aa)",
};

const CHARACTER_ICON: Record<VibeCharacter, { Icon: typeof HeartFill; color: string }> = {
  favorite: { Icon: HeartFill, color: "#ff3b5c" },
  unfamiliar: { Icon: Sparkles2Fill, color: "#ffc531" },
  popular: { Icon: LightningFill, color: "#e9edf5" },
};

export interface MyVibeHeroProps {
  liked?: Track[];
  recent?: Track[];
  trending?: Track[];
  /** desktop: the vibe fills the whole view */
  expanded?: boolean;
  onToggleExpanded?: () => void;
}

/** radius of the ring at angle `a`: a slow wobble plus a kick on the bass */
function ringRadius(a: number, t: number, bass: number): number {
  return (
    1 +
    0.06 * Math.sin(3 * a + t * 0.9) +
    0.045 * Math.sin(5 * a - t * 1.3 + 1.1) +
    0.03 * Math.sin(2 * a + t * 0.5 + 2.4) +
    bass * 0.07
  );
}

function traceRing(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, t: number, bass: number, squash: number) {
  const n = 96;
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * ringRadius(a, t, bass);
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr * squash;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/** Apple's flag emoji, as everywhere else in the app (react-apple-emojis) */
const LANGUAGE_FLAG = { russian: "flag-russia", ukrainian: "flag-ukraine", english: "flag-united-states" } as const;

export default function MyVibeHero({ liked, recent, trending, expanded = false, onToggleExpanded }: MyVibeHeroProps) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const silkRef = useRef<HTMLCanvasElement>(null);
  const bloomRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const status = usePlayerStore((s) => s.status);
  const playbackContext = usePlayerStore((s) => s.playbackContext);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const [starting, setStarting] = useState(false);
  const [settings, setSettings] = useState<VibeSettings>(() => storedSettings());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const isMobile = useIsMobile();
  const mood = settings.mood;

  const vibeActive = isVibeContext(playbackContext) && !!currentTrack;
  const isPlaying = status === "playing" || status === "loading";
  const playingSettings = vibeSettingsOf(playbackContext);
  const sameAsPlaying = !!playingSettings && sameSettings(playingSettings, settings);
  const vibePlaying = vibeActive && isPlaying && sameAsPlaying;

  const live = useRef({ playing: false, target: NEUTRAL_PALETTE as VibePalette, pulse: 0 });
  live.current.playing = status === "playing" && vibeActive;

  // colours: the mood's own; with no mood, the playing track's cover (violet
  // when nothing plays)
  const cover = useCoverSrc(currentTrack?.coverUrl);
  useEffect(() => {
    if (mood) {
      live.current.target = MOOD_PALETTES[mood];
      return;
    }
    if (!currentTrack) {
      live.current.target = NEUTRAL_PALETTE;
      return;
    }
    let cancelled = false;
    void loadVibePalette(cover || currentTrack.coverUrl).then((p) => {
      if (!cancelled) live.current.target = p;
    });
    return () => {
      cancelled = true;
    };
  }, [mood, cover, currentTrack]);

  // a like on the playing track sends a pulse through the ring
  const currentLiked = useIsTrackLiked(currentTrack?.id);
  const likedRef = useRef<{ id?: string; liked: boolean }>({ liked: false });
  useEffect(() => {
    const prev = likedRef.current;
    if (prev.id === currentTrack?.id && !prev.liked && currentLiked) live.current.pulse = 1;
    likedRef.current = { id: currentTrack?.id, liked: currentLiked };
  }, [currentLiked, currentTrack?.id]);

  useEffect(() => {
    const glowCanvas = canvasRef.current;
    const silkCanvas = silkRef.current;
    const bloomCanvas = bloomRef.current;
    const wrap = wrapRef.current;
    if (!glowCanvas || !silkCanvas || !bloomCanvas || !wrap) return;
    const glow = glowCanvas.getContext("2d");
    const silk = silkCanvas.getContext("2d");
    const bloom = bloomCanvas.getContext("2d");
    if (!glow || !silk || !bloom) return;
    const gc: CanvasRenderingContext2D = glow;
    const sc: CanvasRenderingContext2D = silk;
    const bc: CanvasRenderingContext2D = bloom;

    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    // phones: fewer pixels and ~30 fps; both layers are blurred by CSS anyway
    const lite = isNativeApp() || window.innerWidth < 700;
    // weak phones (Helio G99…): the same picture drawn at ~24 fps, with
    // fewer curve points / gradient stops (the layers are blurred anyway)
    const weak = isLowEndDevice();
    const frameMs = weak ? 50 : lite ? 33 : 0;
    const curvePoints = weak ? 32 : lite ? 40 : 72;
    const gradientStops = weak ? 10 : lite ? 14 : 36;
    const tracker = new BeatTracker();
    let palette: VibePalette = live.current.target;
    let raf = 0;
    let last = performance.now();
    let lastDraw = 0;
    let time = Math.random() * 100;
    let visible = true;
    let w = 0;
    let h = 0;
    let glowScale = 1;
    let silkScale = 1;
    let bloomScale = 1;

    const resize = () => {
      const rect = glowCanvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      // the glow and bloom layers are blurred by CSS: they need fewer pixels
      glowScale = lite ? 0.35 : 0.75;
      bloomScale = lite ? 0.35 : 0.6;
      silkScale = Math.min(weak ? 1.25 : lite ? 1.35 : 2.5, window.devicePixelRatio || 1);
      bloomCanvas.width = Math.max(1, Math.round(w * bloomScale));
      bloomCanvas.height = Math.max(1, Math.round(h * bloomScale));
      glowCanvas.width = Math.max(1, Math.round(w * glowScale));
      glowCanvas.height = Math.max(1, Math.round(h * glowScale));
      silkCanvas.width = Math.max(1, Math.round(w * silkScale));
      silkCanvas.height = Math.max(1, Math.round(h * silkScale));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(glowCanvas);
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible && !raf) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    });
    io.observe(wrap);

    /** how lit the ring is at angle `a`: two soft lobes drifting around */
    const light = (a: number, t: number) => {
      const lobe = (center: number, width: number) => Math.pow(Math.max(0, Math.cos(a - center)), width);
      return 0.12 + 0.88 * Math.max(lobe(-1.9 + Math.sin(t * 0.23) * 0.7, 2), 0.85 * lobe(1.3 + Math.cos(t * 0.19) * 0.8, 3));
    };

    /** one smooth closed curve (quadratic through midpoints: no corners) */
    const strand = (c: CanvasRenderingContext2D, cx: number, cy: number, r: number, t: number, b: number) => {
      const n = curvePoints;
      const pts: [number, number][] = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const rr = r * ringRadius(a, t, b);
        pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.9]);
      }
      c.beginPath();
      const mid = (i: number) => {
        const [x0, y0] = pts[i % n];
        const [x1, y1] = pts[(i + 1) % n];
        return [(x0 + x1) / 2, (y0 + y1) / 2] as const;
      };
      const [sx, sy] = mid(n - 1);
      c.moveTo(sx, sy);
      for (let i = 0; i < n; i++) {
        const [mx, my] = mid(i);
        c.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
      }
      c.closePath();
    };

    /** colour that brightens and fades around the circle, smoothly (conic gradient) */
    const lit = (c: CanvasRenderingContext2D, cx: number, cy: number, t: number, color: (k: number) => [number, number, number], alpha: number) => {
      if (typeof c.createConicGradient !== "function") return rgba(color(0.7), alpha * 0.7);
      const g = c.createConicGradient(0, cx, cy);
      const stops = gradientStops;
      for (let i = 0; i <= stops; i++) {
        const k = light((i / stops) * Math.PI * 2, t);
        g.addColorStop(i / stops, rgba(color(k), Math.min(1, alpha * k)));
      }
      return g;
    };

    const blend = (from: [number, number, number], to: [number, number, number], k: number): [number, number, number] => [
      from[0] + (to[0] - from[0]) * k,
      from[1] + (to[1] - from[1]) * k,
      from[2] + (to[2] - from[2]) * k,
    ];

    function frame(now: number) {
      raf = 0;
      if (!visible || document.hidden) return;
      if (frameMs && now - lastDraw < frameMs) {
        raf = requestAnimationFrame(frame);
        return;
      }
      lastDraw = now;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      const { bass, level } = tracker.next(dt, live.current.playing);
      const motion = reduced ? 0.3 : 1;
      time += dt * (0.8 + level * 1.4) * motion;
      palette = lerpPalette(palette, live.current.target, Math.min(1, dt * 2.5));
      live.current.pulse *= Math.exp(-dt * 2.6);
      const pulse = live.current.pulse;
      const [hi, main, deep] = palette;
      const b = bass * motion + pulse * 0.9;

      const cx = w / 2;
      const heroH = Math.max(1, h - BLEED);
      const cy = BLEED + heroH / 2;
      const R = Math.min(w * 0.4, heroH * 0.42, heroH > HERO_HEIGHT + 50 ? 440 : 280) * (1 + pulse * 0.07);
      const white: [number, number, number] = [255, 255, 255];

      // ---- glow layer (low-res, blurred by CSS): coloured light around a dark centre
      gc.setTransform(glowScale, 0, 0, glowScale, 0, 0);
      gc.clearRect(0, 0, w, h);
      const field = gc.createRadialGradient(cx, cy, R * 0.6, cx, cy, R * 3.2);
      field.addColorStop(0, rgba(main, 1));
      field.addColorStop(0.25, rgba(main, 0.8 + pulse * 0.2));
      field.addColorStop(0.55, rgba(deep, 0.55));
      field.addColorStop(1, rgba(deep, 0));
      gc.fillStyle = field;
      gc.fillRect(0, 0, w, h);
      gc.globalCompositeOperation = "lighter";
      for (let i = 0; i < (lite ? 2 : 3); i++) {
        const a = time * (0.18 + i * 0.07) + i * 2.1;
        const px = cx + Math.cos(a) * R * (1.25 + 0.25 * Math.sin(time * 0.3 + i));
        const py = cy + Math.sin(a) * R * (1.05 + 0.2 * Math.cos(time * 0.27 + i));
        const patch = gc.createRadialGradient(px, py, 0, px, py, R * 0.9);
        patch.addColorStop(0, rgba(hi, 0.5 + b * 0.25));
        patch.addColorStop(1, rgba(hi, 0));
        gc.fillStyle = patch;
        gc.fillRect(px - R, py - R, R * 2, R * 2);
      }
      // a broad band of light along the edge of the dark shape
      strand(gc, cx, cy, R * 1.02, time + 0.6, b);
      gc.strokeStyle = lit(gc, cx, cy, time, (k) => blend(main, hi, k), 1);
      gc.lineWidth = R * 0.34;
      gc.stroke();
      if (pulse > 0.02) {
        // the like: a wave of light running outward
        strand(gc, cx, cy, R * (1.1 + (1 - pulse) * 0.6), time, 0);
        gc.strokeStyle = rgba(hi, pulse);
        gc.lineWidth = R * 0.18;
        gc.stroke();
      }
      gc.globalCompositeOperation = "destination-out";
      strand(gc, cx, cy, R * 0.92, time, b);
      gc.fillStyle = "rgba(0,0,0,0.97)";
      gc.fill();
      gc.globalCompositeOperation = "source-over";

      // ---- neon layer (full resolution, sharp) + its bloom (blurred copy):
      // fine tubes of light with a white-hot core, folded around the centre
      sc.setTransform(silkScale, 0, 0, silkScale, 0, 0);
      sc.clearRect(0, 0, w, h);
      bc.setTransform(bloomScale, 0, 0, bloomScale, 0, 0);
      bc.clearRect(0, 0, w, h);
      sc.globalCompositeOperation = "lighter";
      bc.globalCompositeOperation = "lighter";
      sc.lineJoin = "round";
      bc.lineJoin = "round";
      const strands = weak ? 4 : lite ? 4 : 9;
      for (let i = 0; i < strands; i++) {
        const t = time + i * 0.31;
        // strands bunch near the dark edge and spread outward
        const spread = Math.pow(i / (strands - 1), 1.35);
        const r = R * (0.93 + spread * 0.42);
        const ox = cx + Math.sin(time * 0.45 + i * 1.7) * R * 0.035;
        const oy = cy + Math.cos(time * 0.38 + i * 1.3) * R * 0.025;
        const fade = 1 - spread * 0.72;
        const thick = i % 3 === 0 ? 1.6 : 1; // a few stronger tubes among fine threads

        // bloom: the tube's light spilling into the air
        strand(bc, ox, oy, r, t, b);
        bc.strokeStyle = lit(bc, cx, cy, t, (k) => blend(main, hi, k * 0.6), 0.75 * fade);
        bc.lineWidth = 10 * thick;
        bc.stroke();

        strand(sc, ox, oy, r, t, b);
        // tube
        sc.strokeStyle = lit(sc, cx, cy, t, (k) => blend(main, hi, k), 0.9 * fade);
        sc.lineWidth = 3.2 * thick;
        sc.stroke();
        // white-hot core
        sc.strokeStyle = lit(sc, cx, cy, t, (k) => blend(hi, white, k), 0.95 * fade);
        sc.lineWidth = 1.4 * thick;
        sc.stroke();
      }
      sc.globalCompositeOperation = "source-over";
      bc.globalCompositeOperation = "source-over";

      raf = requestAnimationFrame(frame);
    }

    const onVis = () => {
      if (!document.hidden && visible && !raf) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const launch = async (next: VibeSettings) => {
    setStarting(true);
    try {
      await startVibe(next, { liked, recent, trending });
    } finally {
      setStarting(false);
    }
  };

  const onMainClick = () => {
    if (vibeActive && sameAsPlaying) {
      if (isPlaying) playerEngine.pause();
      else playerEngine.resume();
      return;
    }
    void launch(settings);
  };

  /** pick an option of a group, or clear it when it's picked already */
  const toggle = <K extends keyof VibeSettings>(key: K, value: NonNullable<VibeSettings[K]>) => {
    const next = { ...settings, [key]: settings[key] === value ? null : value } as VibeSettings;
    setSettings(next);
    storeSettings(next);
    // already listening: the stream follows the new settings right away
    if (vibeActive) void launch(next);
  };

  const label = {
    character: (c: VibeCharacter) => t(`home.vibe.character_${c}`),
    mood: (m: VibeMood) => t(`home.vibe.mood_${m}`),
    language: (l: VibeLanguage) => t(`home.vibe.language_${l}`),
  };
  const active: { key: keyof VibeSettings; text: string }[] = [
    ...(settings.character ? [{ key: "character" as const, text: label.character(settings.character) }] : []),
    ...(settings.mood ? [{ key: "mood" as const, text: label.mood(settings.mood) }] : []),
    ...(settings.language ? [{ key: "language" as const, text: label.language(settings.language) }] : []),
  ];
  const resetSettings = () => {
    const next = { character: null, mood: null, language: null };
    setSettings(next);
    storeSettings(next);
    if (vibeActive) void launch(next);
  };
  const clear = (key: keyof VibeSettings) => {
    const next = { ...settings, [key]: null };
    setSettings(next);
    storeSettings(next);
    if (vibeActive) void launch(next);
  };

  return (
    <section
      ref={wrapRef}
      className="relative w-full select-none overflow-visible"
      style={{
        height: expanded ? "100%" : HERO_HEIGHT,
        marginTop: "var(--lane-safe-top, 0px)",
      }}
      aria-label={t("home.vibe.title")}
    >
      {(["glow", "bloom", "silk"] as const).map((layer) => (
        <canvas
          key={layer}
          ref={layer === "glow" ? canvasRef : layer === "bloom" ? bloomRef : silkRef}
          className="pointer-events-none absolute"
          style={{
            top: -BLEED,
            left: 0,
            width: "100%",
            height: expanded ? `calc(100% + ${BLEED}px)` : HERO_HEIGHT + BLEED,
            filter: layer === "glow" ? "blur(20px) saturate(1.4)" : layer === "bloom" ? "blur(9px) saturate(1.3)" : "none",
            // the light fades out downward: a smooth hand-off into the page
            WebkitMaskImage: "linear-gradient(to bottom, #000 0%, #000 72%, transparent 100%)",
            maskImage: "linear-gradient(to bottom, #000 0%, #000 72%, transparent 100%)",
          }}
          aria-hidden="true"
        />
      ))}
      {/* a whisper of grain: keeps the big gradients from banding */}
      <div
        className="pointer-events-none absolute inset-x-0"
        aria-hidden="true"
        style={{
          top: -BLEED,
          height: expanded ? `calc(100% + ${BLEED}px)` : HERO_HEIGHT + BLEED,
          backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.55'/></svg>")`,
          opacity: isMobile ? 0 : 0.07,
          mixBlendMode: "overlay",
          WebkitMaskImage: "linear-gradient(to bottom, #000 0%, #000 72%, transparent 100%)",
          maskImage: "linear-gradient(to bottom, #000 0%, #000 72%, transparent 100%)",
        }}
      />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-[18px]">
        <button
          type="button"
          onClick={onMainClick}
          disabled={starting}
          aria-label={vibePlaying ? t("common.pause") : t("home.vibe.play")}
          className="group inline-flex items-center gap-[12px] border-none bg-transparent p-0 text-white cursor-pointer disabled:opacity-70"
          style={{ fontFamily: "var(--font-inter), sans-serif" }}
        >
          <span className="inline-flex h-[30px] w-[30px] items-center justify-center transition-transform duration-200 group-hover:scale-110 group-active:scale-95">
            {starting ? (
              <span className="h-[22px] w-[22px] animate-spin rounded-full border-[2.5px] border-white/30 border-t-white" />
            ) : vibePlaying ? (
              <PauseFill size={30} />
            ) : (
              <PlayFill size={30} />
            )}
          </span>
          <span className="text-[34px] font-[750] leading-none tracking-tight" style={{ textShadow: "0 2px 24px rgba(0,0,0,0.6)" }}>
            {t("home.vibe.title")}
          </span>
        </button>

        <div className="flex flex-wrap items-center justify-center gap-[8px] px-[16px]">
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label={t("home.vibe.settings")}
            className="inline-flex h-[36px] w-[36px] items-center justify-center rounded-full border border-white/15 bg-white/[0.08] text-white/90 hover:bg-white/[0.14] active:scale-95 transition-all cursor-pointer"
          >
            <Settings6Line size={18} />
          </button>
          {!isMobile && onToggleExpanded && (
            <button
              type="button"
              onClick={onToggleExpanded}
              aria-label={expanded ? t("home.vibe.collapse") : t("home.vibe.expand")}
              title={expanded ? t("home.vibe.collapse") : t("home.vibe.expand")}
              className="inline-flex h-[36px] w-[36px] items-center justify-center rounded-full border border-white/15 bg-white/[0.08] text-white/90 hover:bg-white/[0.14] active:scale-95 transition-all cursor-pointer"
            >
              {expanded ? <UpLine size={18} /> : <DownLine size={18} />}
            </button>
          )}
          {active.map((chip) => (
            <span
              key={chip.key}
              className="inline-flex h-[36px] items-center gap-[6px] rounded-full bg-white/[0.1] pl-[14px] pr-[8px] text-[13.5px] font-[550] text-white backdrop-blur-md"
            >
              {chip.text}
              <button
                type="button"
                onClick={() => clear(chip.key)}
                aria-label={t("common.remove") || "Remove"}
                className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-full border-none bg-transparent text-white/70 hover:text-white cursor-pointer"
              >
                <CloseLine size={14} />
              </button>
            </span>
          ))}
        </div>
      </div>

      {createPortal(
        <AnimatePresence>
          {settingsOpen && (
            <motion.div
              key="vibe-settings"
              className="fixed inset-0 z-[200]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <div className="absolute inset-0 bg-black/45" onClick={() => setSettingsOpen(false)} />
              <motion.div
                role="dialog"
                aria-label={t("home.vibe.settings")}
                className={
                  isMobile
                    ? "absolute inset-x-0 bottom-0 max-h-[88vh] overflow-y-auto rounded-t-3xl bg-[#1a1a1d] px-[16px] pt-[10px]"
                    : "absolute right-[12px] top-[12px] bottom-[12px] w-[440px] max-w-[calc(100vw-24px)] overflow-y-auto rounded-2xl border border-white/[0.06] bg-[#1a1a1d] px-[18px] pt-[16px] shadow-[0_20px_60px_rgba(0,0,0,0.5)]"
                }
                style={{ paddingBottom: "calc(var(--lane-safe-bottom, 0px) + 20px)", fontFamily: "var(--font-inter), sans-serif" }}
                initial={isMobile ? { y: "100%" } : { x: "calc(100% + 24px)" }}
                animate={isMobile ? { y: 0 } : { x: 0 }}
                exit={isMobile ? { y: "100%" } : { x: "calc(100% + 24px)" }}
                transition={{ type: "spring", stiffness: 260, damping: 30, mass: 0.8 }}
                // phones: pull the sheet down to close it
                drag={isMobile ? "y" : false}
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={{ top: 0, bottom: 0.8 }}
                dragListener={isMobile}
                onDragEnd={(_, info) => {
                  if (info.offset.y > 110 || info.velocity.y > 600) setSettingsOpen(false);
                }}
              >
                {isMobile && <div className="mx-auto mb-[10px] h-[4px] w-[38px] rounded-full bg-white/25" />}
                <div className="mb-[14px] flex items-center justify-between gap-[12px]">
                  <h3 className="m-0 text-[20px] font-[700] tracking-tight text-white">{t("home.vibe.customize")}</h3>
                  <div className="flex items-center gap-[8px]">
                    <button
                      type="button"
                      onClick={resetSettings}
                      disabled={!settings.character && !settings.mood && !settings.language}
                      aria-label={t("home.vibe.reset")}
                      title={t("home.vibe.reset")}
                      className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-full border-none bg-white/[0.08] text-white/80 hover:bg-white/[0.14] disabled:opacity-35 cursor-pointer"
                    >
                      <Refresh2Line size={17} />
                    </button>
                    {/* phones close it with a swipe down (or a tap outside) */}
                    {!isMobile && (
                      <button
                        type="button"
                        onClick={() => setSettingsOpen(false)}
                        aria-label={t("common.close") || "Close"}
                        className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-full border-none bg-white/[0.08] text-white/80 hover:bg-white/[0.14] cursor-pointer"
                      >
                        <CloseLine size={17} />
                      </button>
                    )}
                  </div>
                </div>

            <p className="m-0 mt-[6px] mb-[10px] text-[11px] font-[600] lowercase text-white/55">{t("home.vibe.by_character")}</p>
            <LayoutGroup id="vibe-character-selector">
            <div className="relative grid w-full grid-cols-3 rounded-xl bg-bg-elevated p-[4px]" role="tablist">
              <motion.span
                aria-hidden
                className="pointer-events-none absolute bottom-[4px] left-[4px] top-[4px] z-0 rounded-lg bg-white/[0.09]"
                style={{ width: "calc((100% - 8px) / 3)" }}
                animate={{
                  x: `${Math.max(0, VIBE_CHARACTERS.indexOf(settings.character ?? "favorite")) * 100}%`,
                  opacity: settings.character ? 1 : 0,
                }}
                transition={{ type: "spring", stiffness: 220, damping: 24, mass: 0.8 }}
              />
              {VIBE_CHARACTERS.map((c) => {
                const on = settings.character === c;
                const { Icon, color } = CHARACTER_ICON[c];
                return (
                  <button
                    key={c}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => toggle("character", c)}
                    className="relative z-10 inline-flex h-[64px] min-w-0 items-center justify-center gap-[5px] rounded-lg border-0 bg-transparent px-[8px] cursor-pointer select-none active:scale-[0.97]"
                  >
                    <Icon className="relative z-10 shrink-0" size={22} style={{ color, filter: "drop-shadow(0 3px 8px rgba(0,0,0,0.35))" }} />
                    <span className="relative z-10 truncate text-[10px] font-[600] leading-[12px] text-white/85">{label.character(c)}</span>
                  </button>
                );
              })}
              <span className="pointer-events-none absolute bottom-[4px] left-1/3 top-[4px] z-20 w-px bg-white/10" />
              <span className="pointer-events-none absolute bottom-[4px] left-2/3 top-[4px] z-20 w-px bg-white/10" />
            </div>
            </LayoutGroup>

            <p className="m-0 mt-[24px] mb-[12px] text-[14px] font-[600] text-white/55">{t("home.vibe.by_mood")}</p>
            <div className="grid grid-cols-4 gap-[8px]">
              {VIBE_MOODS.map((m) => {
                const on = settings.mood === m;
                return (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle("mood", m)}
                    className="flex flex-col items-center gap-[8px] border-none bg-transparent p-0 cursor-pointer"
                  >
                    <span
                      className={`h-[64px] w-[64px] rounded-full transition-all ${on ? "ring-[3px] ring-white ring-offset-[3px] ring-offset-[#121214] scale-105" : ""}`}
                      style={{ background: MOOD_SWATCH[m] }}
                    />
                    <span className="text-[13.5px] font-[550] text-white">{label.mood(m)}</span>
                  </button>
                );
              })}
            </div>

            <p className="m-0 mt-[24px] mb-[12px] text-[14px] font-[600] text-white/55">{t("home.vibe.by_language")}</p>
            {/* one switch for the language (tap the picked one again to clear it),
                and "no vocals" on its own */}
            <LayoutGroup id="vibe-language-selector">
            <div className="flex w-full flex-nowrap items-center gap-[6px]">
              {/* library-style switch, flags only, with dividers */}
              <div className="relative grid min-w-0 flex-1 grid-cols-3 rounded-xl bg-bg-elevated p-[4px]" role="tablist">
                <motion.span
                  aria-hidden
                  className="pointer-events-none absolute bottom-[4px] left-[4px] top-[4px] z-0 rounded-lg bg-white/[0.09]"
                  style={{ width: "calc((100% - 8px) / 3)" }}
                  animate={{
                    x: `${Math.max(0, (["russian", "ukrainian", "english"] as const).indexOf(settings.language as "russian" | "ukrainian" | "english")) * 100}%`,
                    opacity: settings.language && ["russian", "ukrainian", "english"].includes(settings.language) ? 1 : 0,
                  }}
                  transition={{ type: "spring", stiffness: 220, damping: 24, mass: 0.8 }}
                />
                {(["russian", "ukrainian", "english"] as const).map((l) => {
                  const on = settings.language === l;
                  return (
                    <button
                      key={l}
                      type="button"
                      role="tab"
                      aria-selected={on}
                      title={label.language(l)}
                      aria-label={label.language(l)}
                      onClick={() => toggle("language", l)}
                      className="relative z-10 inline-flex h-[36px] min-w-0 items-center justify-center rounded-lg border-0 bg-transparent px-[12px] cursor-pointer select-none active:scale-[0.97]"
                    >
                      <span className={`relative z-10 transition-opacity ${on ? "" : "opacity-75"}`}>
                        <Emoji name={LANGUAGE_FLAG[l]} width={24} />
                      </span>
                    </button>
                  );
                })}
                <span className="pointer-events-none absolute bottom-[8px] left-1/3 top-[8px] z-20 w-px bg-white/10" />
                <span className="pointer-events-none absolute bottom-[8px] left-2/3 top-[8px] z-20 w-px bg-white/10" />
              </div>
              {/* "no vocals" on its own */}
              <button
                type="button"
                aria-pressed={settings.language === "instrumental"}
                title={label.language("instrumental")}
                aria-label={label.language("instrumental")}
                onClick={() => toggle("language", "instrumental")}
                className={`inline-flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-xl border-0 cursor-pointer transition-colors active:scale-[0.97] ${
                  settings.language === "instrumental"
                    ? "bg-white text-black"
                    : "bg-bg-elevated text-text-secondary hover:text-text-primary"
                }`}
              >
                <MicOffLine size={21} />
              </button>
              {/* мьюс: the channel */}
              <button
                type="button"
                title="мьюс"
                aria-label="мьюс"
                onClick={() => window.open("https://t.me/justchannelor", "_blank", "noopener,noreferrer")}
                className="inline-flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-xl border-0 bg-bg-elevated text-text-secondary hover:text-text-primary cursor-pointer transition-colors active:scale-[0.97]"
              >
                <PawFill size={21} />
              </button>
            </div>
            </LayoutGroup>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </section>
  );
}
