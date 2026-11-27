import { useArtworkInteractionStore } from "../store/artworkInteractionStore";
import { isNativeApp } from "@/shared/platform/native";
import { isLowEndDevice } from "@/shared/platform/deviceTier";
import { memo, useEffect, useRef, useState } from "react";
import { KawarpEngine } from "../engine/kawarpEngine";
import { backdropMotion, type VisualQuality } from "../store/visualQualityStore";
import { getCoverElement, useCoverElement } from "@/features/covers";

export const KAWARP_RESIZE_SETTLE_MS = 300;
// phones: a much smaller surface and fewer blur passes keep it smooth
// weak phones (Helio G99…): smaller still, it's a soft blurred background anyway
export const KAWARP_RENDER_SCALE = isNativeApp() ? (isLowEndDevice() ? 0.22 : 0.28) : 0.5;

interface KawarpWrapperProps {
  src?: string;
  quality?: VisualQuality;
  paused?: boolean;
  onLoad?: () => void;
  onError?: (err: Error) => void;
}

export const KawarpWrapper = memo(function KawarpWrapper({ src, quality = "all", paused = false, onLoad, onError }: KawarpWrapperProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<KawarpEngine | null>(null);
  const interacting = useArtworkInteractionStore(state => state.active);
  const imageLoad = useRef<{ src: string; promise: Promise<void> } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const coverElement = useCoverElement(src);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let engine: KawarpEngine | null = null;
    try {
      engine = new KawarpEngine(canvas, {
        blurPasses: isNativeApp() ? (isLowEndDevice() ? 3 : 4) : 4,
        transitionDuration: 1000,
        scale: 1.18,
        dithering: 0.008,
        // phones redraw every frame, nothing reads the canvas back
        preserveDrawingBuffer: !isNativeApp(),
      });
      engineRef.current = engine;
      engine.start();
    } catch (err) {
      onError?.(err instanceof Error ? err : new Error(String(err)));
      return;
    }

    return () => {
      engine?.dispose();
      engineRef.current = null;
      imageLoad.current = null;
    };
  }, [onError]);

  useEffect(() => {
    engineRef.current?.setMotion(backdropMotion(quality, isNativeApp(), isLowEndDevice()));
  }, [quality, onError]);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    let settleTimer: ReturnType<typeof setTimeout> | null = null;
    let surfaceWidth = 0;
    let surfaceHeight = 0;

    const surfaceSize = () => {
      const rect = container.getBoundingClientRect();
      // Size the GPU buffer to the actual player, not the user's whole monitor.
      return { width: Math.round(rect.width), height: Math.round(rect.height) };
    };

    const applySize = () => {
      const { width, height } = surfaceSize();
      if (width <= 0 || height <= 0) return;
      if (width === surfaceWidth && height === surfaceHeight) return;
      surfaceWidth = width;
      surfaceHeight = height;
      canvas.width = Math.max(1, Math.round(width * KAWARP_RENDER_SCALE));
      canvas.height = Math.max(1, Math.round(height * KAWARP_RENDER_SCALE));
      engineRef.current?.resize();
    };

    const scheduleSize = () => {
      const { width, height } = surfaceSize();
      if (width === surfaceWidth && height === surfaceHeight) return;
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = setTimeout(() => {
        settleTimer = null;
        applySize();
      }, KAWARP_RESIZE_SETTLE_MS);
    };

    const resizeObserver = new ResizeObserver(scheduleSize);
    resizeObserver.observe(container);
    window.addEventListener("resize", scheduleSize, { passive: true });
    applySize();

    return () => {
      if (settleTimer) clearTimeout(settleTimer);
      resizeObserver.disconnect();
      window.removeEventListener("resize", scheduleSize);
    };
  }, []);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (interacting || paused) engine.stop();
    else engine.start();
  }, [interacting, paused]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !src) return;

    let isCancelled = false;
    const element = coverElement || getCoverElement(src);

    if (imageLoad.current?.src !== src) imageLoad.current = { src, promise: engine.loadImage(src, element) };
    imageLoad.current.promise
      .then(() => {
        if (isCancelled) return;
        setLoaded(true);
        onLoad?.();
      })
      .catch((err) => {
        if (isCancelled) return;
        if (imageLoad.current?.src === src) imageLoad.current = null;
        onError?.(err instanceof Error ? err : new Error(String(err)));
      });

    return () => {
      isCancelled = true;
    };
  }, [src, coverElement, onLoad, onError]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pointer-events-none overflow-hidden"
    >
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 block h-full w-full transition-opacity duration-500 ${
          loaded ? "opacity-100" : "opacity-0"
        }`}
      />
    </div>
  );
});

export default KawarpWrapper;
