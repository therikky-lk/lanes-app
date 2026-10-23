import { isNativeApp } from "@/shared/platform/native";
import { useEffect, useMemo, useRef, useState } from "react";
import { PauseFill, PlayFill, Refresh2Line } from "@mingcute/react";
import { playerEngine, usePlayerStore } from "@/features/player";
import { useCoverSrc } from "@/features/covers";
import { useTranslation } from "@/languages";
import type { Track } from "@/shared/types/track";
import { BeatTracker } from "../vibe/audioAnalyser";
import { isVibeContext, pickVibeSeed, startVibe } from "../vibe/vibeController";
import {
  DEFAULT_VIBE_PALETTE,
  lerpPalette,
  loadVibePalette,
  rgba,
  type VibePalette,
} from "../vibe/vibePalette";

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
}

// the canvas bleeds past the section so the glow fades out instead of being cut
const BLEED_Y = 170;
const BLEED_X = 120;
const HERO_HEIGHT = 400;

export interface MyVibeHeroProps {
  liked?: Track[];
  recent?: Track[];
  trending?: Track[];
}

function blobRadius(a: number, t: number, bass: number, beat: number): number {
  return (
    1 +
    0.075 * Math.sin(3 * a + t * 1.1) +
    0.05 * Math.sin(5 * a - t * 1.7 + 1.3) +
    0.045 * Math.sin(2 * a + t * 0.6 + 2.1) +
    0.02 * Math.sin(9 * a + t * 2.3) * (0.4 + bass) +
    bass * 0.09 +
    beat * 0.035 * Math.sin(7 * a + t * 3)
  );
}

function traceBlob(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, t: number, bass: number, beat: number) {
  const n = 120;
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * blobRadius(a, t, bass, beat);
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.96]);
  }
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % n];
    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2;
    if (i === 0) ctx.moveTo(mx, my);
    else ctx.quadraticCurveTo(x0, y0, mx, my);
  }
  const [x0, y0] = pts[0];
  const [x1, y1] = pts[1];
  ctx.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
  ctx.closePath();
}

function drawSpark(ctx: CanvasRenderingContext2D, s: Spark, color: string) {
  const alpha = Math.sin((s.life / s.max) * Math.PI);
  const r = s.size * (0.6 + alpha * 0.6);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  // 4-point twinkle
  ctx.moveTo(s.x, s.y - r * 2.4);
  ctx.quadraticCurveTo(s.x, s.y, s.x + r * 2.4, s.y);
  ctx.quadraticCurveTo(s.x, s.y, s.x, s.y + r * 2.4);
  ctx.quadraticCurveTo(s.x, s.y, s.x - r * 2.4, s.y);
  ctx.quadraticCurveTo(s.x, s.y, s.x, s.y - r * 2.4);
  ctx.fill();
  ctx.globalAlpha = 1;
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

  const vibeActive = isVibeContext(playbackContext) && !!currentTrack;
  const isPlaying = status === "playing" || status === "loading";
  const vibePlaying = vibeActive && isPlaying;

  const hasSeeds = useMemo(
    () => (liked?.length ?? 0) + (recent?.length ?? 0) + (trending?.length ?? 0) > 0,
    [liked, recent, trending],
  );

  // live state the render loop reads without re-subscribing
  const live = useRef({ playing: false, target: DEFAULT_VIBE_PALETTE as VibePalette });
  live.current.playing = status === "playing";

  useEffect(() => {
    let cancelled = false;
    void loadVibePalette(currentTrack ? cover || currentTrack.coverUrl : null).then((p) => {
      if (!cancelled) live.current.target = p;
    });
    return () => {
      cancelled = true;
    };
  }, [cover, currentTrack]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    // phones: canvas shadows are very expensive there, so draw at 1x, ~30 fps,
    // and fake the glow with gradients only
    const lite = isNativeApp() || window.innerWidth < 700;
    let lastDraw = 0;
    const tracker = new BeatTracker();
    let palette: VibePalette = DEFAULT_VIBE_PALETTE;
    const sparks: Spark[] = [];
    let raf = 0;
    let last = performance.now();
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

      const { bass, level, beat } = tracker.next(dt, live.current.playing);
      const motion = reduced ? 0.35 : 1;
      time += dt * (0.55 + level * 0.9) * motion;
      palette = lerpPalette(palette, live.current.target, Math.min(1, dt * 1.8));
      const [core, mid, edge] = palette;

      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx!.clearRect(0, 0, w, h);

      const cx = w / 2;
      const cy = BLEED_Y + HERO_HEIGHT * 0.47;
      const R = Math.min((w - BLEED_X * 2) * 0.36, HERO_HEIGHT * 0.36) * (1 + bass * 0.05 * motion);
      const b = bass * motion;
      const bt = beat * motion;

      // soft halo that breathes with the low end
      const haloR = Math.min(R * 2.4, cy - 4, h - cy - 4);
      const halo = ctx!.createRadialGradient(cx, cy, R * 0.4, cx, cy, haloR);
      halo.addColorStop(0, rgba(mid, (lite ? 0.45 : 0.2) + b * 0.25));
      halo.addColorStop(0.5, rgba(edge, 0.07 + b * 0.08));
      halo.addColorStop(1, rgba(edge, 0));
      ctx!.fillStyle = halo;
      ctx!.fillRect(0, 0, w, h);

      // main body
      const gx = cx + Math.sin(time * 0.7) * R * 0.18;
      const gy = cy + Math.cos(time * 0.5) * R * 0.14;
      const body = ctx!.createRadialGradient(gx, gy, R * 0.05, cx, cy, R * 1.15);
      body.addColorStop(0, rgba([255, 250, 235], 0.95));
      body.addColorStop(0.22 - bt * 0.04, rgba(core, 1));
      body.addColorStop(0.62, rgba(mid, 1));
      body.addColorStop(1, rgba(edge, 1));
      ctx!.save();
      ctx!.shadowColor = rgba(mid, 0.85);
      ctx!.shadowBlur = lite ? 0 : 50 + b * 70 + bt * 30;
      traceBlob(ctx!, cx, cy, R, time, b, bt);
      ctx!.fillStyle = body;
      ctx!.fill();
      ctx!.restore();

      // fiery rim
      ctx!.save();
      ctx!.globalCompositeOperation = "lighter";
      traceBlob(ctx!, cx, cy, R * 1.005, time, b, bt);
      ctx!.strokeStyle = rgba(core, 0.18 + b * 0.25 + bt * 0.2);
      ctx!.lineWidth = 3 + b * 4;
      ctx!.shadowColor = rgba(core, 0.9);
      ctx!.shadowBlur = lite ? 0 : 18 + b * 22;
      ctx!.stroke();

      // inner shimmer that flashes on the beat
      const ix = cx + Math.cos(time * 0.9) * R * 0.12;
      const iy = cy - R * 0.08 + Math.sin(time * 0.6) * R * 0.06;
      const ir = R * (0.55 + b * 0.12);
      const inner = ctx!.createRadialGradient(ix, iy, 0, ix, iy, ir);
      inner.addColorStop(0, rgba([255, 255, 240], 0.2 + bt * 0.35));
      inner.addColorStop(1, rgba(core, 0));
      ctx!.shadowBlur = 0;
      ctx!.fillStyle = inner;
      ctx!.beginPath();
      ctx!.arc(ix, iy, ir, 0, Math.PI * 2);
      ctx!.fill();

      // sparks: burst on beats, a few idle twinkles otherwise
      const spawn = (count: number, speed: number) => {
        for (let i = 0; i < count; i++) {
          const a = Math.random() * Math.PI * 2;
          const rr = R * blobRadius(a, time, b, bt) * (0.55 + Math.random() * 0.5);
          const v = speed * (0.4 + Math.random());
          sparks.push({
            x: cx + Math.cos(a) * rr,
            y: cy + Math.sin(a) * rr,
            vx: Math.cos(a) * v,
            vy: Math.sin(a) * v - 6,
            life: 0,
            max: 0.7 + Math.random() * 0.9,
            size: 1.4 + Math.random() * 2.4,
          });
        }
      };
      if (!reduced) {
        if (beat > 0.97 && live.current.playing) spawn(5 + Math.round(bass * 6), 60);
        if (Math.random() < dt * (live.current.playing ? 2.5 : 0.8)) spawn(1, 12);
      }
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.life += dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.vx *= 0.97;
        s.vy *= 0.97;
        if (s.life >= s.max) sparks.splice(i, 1);
        else drawSpark(ctx!, s, rgba([255, 248, 220], 1));
      }
      if (sparks.length > 160) sparks.splice(0, sparks.length - 160);
      ctx!.restore();

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

  const launch = async () => {
    const seed = pickVibeSeed({ liked, recent, trending });
    if (!seed) return;
    setStarting(true);
    try {
      await startVibe(seed);
    } finally {
      setStarting(false);
    }
  };

  const onMainClick = () => {
    if (vibeActive) {
      if (isPlaying) playerEngine.pause();
      else playerEngine.resume();
      return;
    }
    void launch();
  };

  const subtitle = vibeActive && currentTrack
    ? `${currentTrack.title}${currentTrack.artists ? ` — ${currentTrack.artists}` : ""}`
    : hasSeeds
      ? t("home.vibe.subtitle") || "Personal stream"
      : t("home.vibe.empty") || "Play a few tracks and your vibe will tune in";

  return (
    <section
      ref={wrapRef}
      className="relative w-full select-none"
      style={{ position: "relative", height: HERO_HEIGHT, overflow: "visible", zIndex: 0 }}
      aria-label={t("home.vibe.title") || "My Vibe"}
    >
      <canvas
        ref={canvasRef}
        className="pointer-events-none"
        style={{
          position: "absolute",
          top: -BLEED_Y,
          bottom: -BLEED_Y,
          left: -BLEED_X,
          right: -BLEED_X,
          width: `calc(100% + ${BLEED_X * 2}px)`,
          height: `calc(100% + ${BLEED_Y * 2}px)`,
        }}
        aria-hidden="true"
      />
      <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ paddingBottom: 14 }}>
        <button
          type="button"
          onClick={onMainClick}
          disabled={!hasSeeds || starting}
          aria-label={vibePlaying ? t("player.pause") || "Pause" : t("home.vibe.play") || "Play My Vibe"}
          className="w-[80px] h-[80px] rounded-full bg-white text-black flex items-center justify-center shadow-[0_8px_40px_rgba(0,0,0,0.35)] transition-transform duration-200 ease-out hover:scale-[1.07] active:scale-95 disabled:opacity-60 disabled:hover:scale-100 cursor-pointer"
        >
          {vibePlaying ? <PauseFill size={30} /> : <PlayFill size={30} className="translate-x-[2px]" />}
        </button>
        <h2
          className="mt-[18px] mb-0 text-white text-[32px] font-bold tracking-tight leading-none"
          style={{ textShadow: "0 2px 18px rgba(0,0,0,0.45)", fontFamily: "var(--font-inter), sans-serif" }}
        >
          {t("home.vibe.title") || "My Vibe"}
        </h2>
        <p
          className="mt-[10px] mb-0 max-w-[80%] truncate text-white/85 text-[14px]"
          style={{ textShadow: "0 1px 10px rgba(0,0,0,0.5)" }}
        >
          {subtitle}
        </p>
        {vibeActive && (
          <button
            type="button"
            onClick={() => void launch()}
            disabled={starting}
            className="mt-[12px] inline-flex items-center gap-1.5 rounded-full bg-black/30 hover:bg-black/40 md:backdrop-blur-md px-3 py-1.5 text-[12px] text-white/90 transition-colors cursor-pointer"
          >
            <Refresh2Line size={14} />
            {t("home.vibe.another") || "Another vibe"}
          </button>
        )}
      </div>
    </section>
  );
}
