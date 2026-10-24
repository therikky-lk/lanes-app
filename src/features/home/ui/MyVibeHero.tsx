import { isNativeApp } from "@/shared/platform/native";
import { useEffect, useRef, useState } from "react";
import { CloseLine, HeartFill, LightningFill, PauseFill, PlayFill, Settings6Line, Sparkles2Fill } from "@mingcute/react";
import { playerEngine, usePlayerStore } from "@/features/player";
import { useCoverSrc } from "@/features/covers";
import { useTranslation } from "@/languages";
import type { Track } from "@/shared/types/track";
import { BeatTracker } from "../vibe/audioAnalyser";
import { isVibeContext, sameSettings, startVibe, storedSettings, storeSettings, vibeSettingsOf } from "../vibe/vibeController";
import {
  VIBE_CHARACTERS,
  VIBE_LANGUAGES,
  VIBE_MOODS,
  type VibeCharacter,
  type VibeLanguage,
  type VibeMood,
  type VibeSettings,
} from "../vibe/vibeTaste";
import { DEFAULT_VIBE_PALETTE, lerpPalette, loadVibePalette, rgba, type VibePalette } from "../vibe/vibePalette";

// My Vibe: a dark stage with a smoky ring of light that breathes with the
// music. Its colours follow the picked mood (or the playing cover when no
// mood is picked); the title doubles as the play / pause control.

const HERO_HEIGHT = 340;
// the glow spills a little past the section instead of being cut off
const BLEED = 60;

export const MOOD_PALETTES: Record<VibeMood, VibePalette> = {
  // energetic: hot orange into red
  energetic: [
    [255, 196, 90],
    [255, 112, 40],
    [232, 40, 40],
  ],
  // happy: sunny yellow into lime
  happy: [
    [255, 240, 130],
    [214, 230, 60],
    [120, 200, 60],
  ],
  // calm: soft teal and grey-blue
  calm: [
    [180, 236, 226],
    [70, 190, 190],
    [60, 120, 170],
  ],
  // sad: blue into violet
  sad: [
    [150, 170, 255],
    [96, 92, 230],
    [140, 60, 200],
  ],
};

/** the swatch for each mood in the settings */
const MOOD_SWATCH: Record<VibeMood, string> = {
  energetic: "linear-gradient(160deg,#ffb347,#ff5a1f 55%,#e8282a)",
  happy: "linear-gradient(160deg,#fff27a,#c6e43a 55%,#58c43c)",
  calm: "linear-gradient(160deg,#a8f0e0,#3fc4c0 55%,#2f78b4)",
  sad: "linear-gradient(160deg,#8fa4ff,#5a55e6 55%,#8a3fd1)",
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

export default function MyVibeHero({ liked, recent, trending }: MyVibeHeroProps) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const status = usePlayerStore((s) => s.status);
  const playbackContext = usePlayerStore((s) => s.playbackContext);
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const cover = useCoverSrc(currentTrack?.coverUrl);
  const [starting, setStarting] = useState(false);
  const [settings, setSettings] = useState<VibeSettings>(() => storedSettings());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const mood = settings.mood;

  const vibeActive = isVibeContext(playbackContext) && !!currentTrack;
  const isPlaying = status === "playing" || status === "loading";
  const playingSettings = vibeSettingsOf(playbackContext);
  const sameAsPlaying = !!playingSettings && sameSettings(playingSettings, settings);
  const vibePlaying = vibeActive && isPlaying && sameAsPlaying;

  const live = useRef({ playing: false, target: DEFAULT_VIBE_PALETTE as VibePalette });
  live.current.playing = status === "playing" && vibeActive;

  // colours: the mood's own, or the playing cover's when no mood is picked
  useEffect(() => {
    if (mood) {
      live.current.target = MOOD_PALETTES[mood];
      return;
    }
    let cancelled = false;
    void loadVibePalette(currentTrack ? cover || currentTrack.coverUrl : null).then((p) => {
      if (!cancelled) live.current.target = p;
    });
    return () => {
      cancelled = true;
    };
  }, [mood, cover, currentTrack]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    // phones: no canvas shadows (expensive there), 1x pixels, ~30 fps
    const lite = isNativeApp() || window.innerWidth < 700;
    const tracker = new BeatTracker();
    let palette: VibePalette = live.current.target;
    let raf = 0;
    let last = performance.now();
    let lastDraw = 0;
    let time = Math.random() * 100;
    let visible = true;
    let w = 0;
    let h = 0;
    let dpr = 1;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = lite ? 1 : Math.min(2, window.devicePixelRatio || 1);
      w = rect.width;
      h = rect.height;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible && !raf) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    });
    io.observe(wrap);

    function frame(now: number) {
      raf = 0;
      if (!visible || document.hidden) return;
      if (lite && now - lastDraw < 32) {
        raf = requestAnimationFrame(frame);
        return;
      }
      lastDraw = now;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      const { bass, level } = tracker.next(dt, live.current.playing);
      const motion = reduced ? 0.3 : 1;
      time += dt * (0.35 + level * 0.8) * motion;
      palette = lerpPalette(palette, live.current.target, Math.min(1, dt * 2.2));
      const [core, mid, edge] = palette;
      const b = bass * motion;

      const c = ctx!;
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, w, h);
      c.globalCompositeOperation = "lighter";

      const cx = w / 2;
      const cy = h / 2;
      const R = Math.min(w * 0.36, (h - BLEED * 2) * 0.42, 260);
      const squash = 0.82;

      // a few offset passes of the ring, each wider and fainter: reads as
      // smoke / light rather than a hard line
      const passes = lite ? 4 : 6;
      for (let i = 0; i < passes; i++) {
        const k = i / (passes - 1);
        const color = i % 3 === 0 ? core : i % 3 === 1 ? mid : edge;
        const offsetT = time + i * 0.35;
        const r = R * (0.94 + k * 0.12);
        traceRing(c, cx + Math.sin(offsetT * 0.6 + i) * R * 0.03, cy + Math.cos(offsetT * 0.5 + i) * R * 0.03, r, offsetT, b, squash);
        c.strokeStyle = rgba(color, (0.5 - k * 0.32) * (0.75 + b * 0.5));
        c.lineWidth = (lite ? 10 : 6) + k * (lite ? 26 : 34) + b * 10;
        if (!lite) {
          c.shadowColor = rgba(color, 0.9);
          c.shadowBlur = 24 + k * 30 + b * 30;
        }
        c.stroke();
      }
      c.shadowBlur = 0;

      // brighter flare that slides around the ring
      const fa = time * 0.7;
      const fr = R * ringRadius(fa, time, b);
      const fx = cx + Math.cos(fa) * fr;
      const fy = cy + Math.sin(fa) * fr * squash;
      const flare = c.createRadialGradient(fx, fy, 0, fx, fy, R * 0.45);
      flare.addColorStop(0, rgba(core, 0.55 + b * 0.3));
      flare.addColorStop(1, rgba(core, 0));
      c.fillStyle = flare;
      c.fillRect(fx - R, fy - R, R * 2, R * 2);

      // keep the middle dark so the title reads
      c.globalCompositeOperation = "destination-out";
      const hole = c.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 0.86);
      hole.addColorStop(0, "rgba(0,0,0,0.9)");
      hole.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = hole;
      c.fillRect(0, 0, w, h);
      c.globalCompositeOperation = "source-over";

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
  const clear = (key: keyof VibeSettings) => {
    const next = { ...settings, [key]: null };
    setSettings(next);
    storeSettings(next);
    if (vibeActive) void launch(next);
  };

  return (
    <section
      ref={wrapRef}
      className="relative w-full select-none"
      style={{ height: HERO_HEIGHT, marginTop: "var(--lane-safe-top, 0px)" }}
      aria-label={t("home.vibe.title")}
    >
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute"
        style={{ top: -BLEED, bottom: -BLEED, left: 0, right: 0, width: "100%", height: `calc(100% + ${BLEED * 2}px)` }}
        aria-hidden="true"
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

      {settingsOpen && (
        <div
          className="fixed inset-0 z-[200] flex items-end justify-center bg-black/55 backdrop-blur-sm sm:items-center"
          onClick={() => setSettingsOpen(false)}
        >
          <div
            role="dialog"
            aria-label={t("home.vibe.settings")}
            className="w-full max-w-[520px] rounded-t-3xl bg-[#121214] px-[16px] pt-[14px] sm:rounded-3xl"
            style={{ paddingBottom: "calc(var(--lane-safe-bottom, 0px) + 20px)", fontFamily: "var(--font-inter), sans-serif" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-[8px] h-[4px] w-[36px] rounded-full bg-white/20 sm:hidden" />

            <p className="m-0 mt-[8px] mb-[12px] text-center text-[15px] font-[600] text-white/55">{t("home.vibe.by_character")}</p>
            <div className="grid grid-cols-3 gap-[8px]">
              {VIBE_CHARACTERS.map((c) => {
                const on = settings.character === c;
                const { Icon, color } = CHARACTER_ICON[c];
                return (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle("character", c)}
                    className={`flex h-[112px] flex-col items-center justify-center gap-[10px] rounded-2xl border cursor-pointer transition-colors ${
                      on ? "border-white/70 bg-white/[0.12]" : "border-transparent bg-white/[0.05] hover:bg-white/[0.08]"
                    }`}
                  >
                    <Icon size={40} style={{ color, filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.4))" }} />
                    <span className="text-[14px] font-[550] text-white">{label.character(c)}</span>
                  </button>
                );
              })}
            </div>

            <p className="m-0 mt-[22px] mb-[12px] text-center text-[15px] font-[600] text-white/55">{t("home.vibe.by_mood")}</p>
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

            <p className="m-0 mt-[22px] mb-[12px] text-center text-[15px] font-[600] text-white/55">{t("home.vibe.by_language")}</p>
            <div className="grid grid-cols-3 gap-[8px]">
              {VIBE_LANGUAGES.map((l) => {
                const on = settings.language === l;
                return (
                  <button
                    key={l}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle("language", l)}
                    className={`h-[52px] rounded-full border text-[14px] font-[550] cursor-pointer transition-colors ${
                      on ? "border-white bg-white text-black" : "border-transparent bg-white/[0.07] text-white hover:bg-white/[0.11]"
                    }`}
                  >
                    {label.language(l)}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
