import { useState, useRef, useCallback, memo } from "react";
import { motion } from "framer-motion";

export interface TimelineSliderProps {
  positionMs: number;
  durationMs: number;
  onSeek: (positionMs: number) => void;
  className?: string;
  style?: React.CSSProperties;
  trackClassName?: string;
  fillClassName?: string;
  size?: "xs" | "sm" | "md" | "lg";
  trackBg?: string;
  trackActiveBg?: string;
  fillColor?: string;
  showTime?: boolean;
  onScrub?: (positionMs: number) => void;
}

export function formatPlaybackTime(ms: number): string {
  if (!ms || ms < 0) return "0:00";
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

export const TimelineSlider = memo(function TimelineSlider({
  positionMs,
  durationMs,
  onSeek,
  className = "",
  style,
  trackClassName = "",
  fillClassName = "",
  size = "md",
  trackBg,
  trackActiveBg,
  fillColor,
  showTime = false,
  onScrub,
}: TimelineSliderProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [scrubPosition, setScrubPosition] = useState<number | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  const duration = Math.max(0, durationMs);
  const currentPosition =
    isDragging && scrubPosition !== null
      ? scrubPosition
      : Math.min(Math.max(0, positionMs), duration || Infinity);

  const progress =
    duration > 0 ? Math.min(1, Math.max(0, currentPosition / duration)) : 0;
  const percentage = progress * 100;

  const calculatePositionFromPointer = useCallback(
    (clientX: number): number => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return currentPosition;
      const ratio = Math.max(
        0,
        Math.min(1, (clientX - rect.left) / rect.width),
      );
      return ratio * duration;
    },
    [currentPosition, duration],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.stopPropagation();
      e.preventDefault();
      setIsDragging(true);
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);

      const targetPos = calculatePositionFromPointer(e.clientX);
      let lastPos = targetPos;
      setScrubPosition(targetPos);
      onScrub?.(targetPos);

      const onPointerMove = (ev: PointerEvent) => {
        const pos = calculatePositionFromPointer(ev.clientX);
        lastPos = pos;
        setScrubPosition(pos);
        onScrub?.(pos);
      };

      const onPointerUp = (ev: PointerEvent) => {
        // a cancelled touch (the phone took the gesture) carries no real
        // position: keep where the finger last was
        const finalPos = ev.type === "pointercancel" ? lastPos : calculatePositionFromPointer(ev.clientX);
        setIsDragging(false);
        setScrubPosition(null);
        try {
          (e.target as HTMLElement).releasePointerCapture?.(ev.pointerId);
        } catch {}
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        window.removeEventListener("pointercancel", onPointerUp);
        onSeek(finalPos);
      };

      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onPointerUp);
    },
    [calculatePositionFromPointer, onScrub, onSeek],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (duration <= 0) return;
      const step = 5000; // 5 seconds
      if (e.key === "ArrowRight") {
        e.preventDefault();
        onSeek(Math.min(duration, currentPosition + step));
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        onSeek(Math.max(0, currentPosition - step));
      } else if (e.key === "Home") {
        e.preventDefault();
        onSeek(0);
      } else if (e.key === "End") {
        e.preventDefault();
        onSeek(duration);
      }
    },
    [currentPosition, duration, onSeek],
  );

  const containerHeights = {
    xs: "h-[16px]",
    sm: "h-[20px]",
    md: "h-[24px]",
    lg: "h-[28px]",
  }[size];

  const baseTrackHeights = {
    xs: "h-[3px]",
    sm: "h-[3px]",
    md: "h-[4px]",
    lg: "h-[4px]",
  }[size];

  // vertical "stick" thumb: short at rest, taller while hovered / dragged
  const thumbHeights = { xs: [11, 14], sm: [13, 16], md: [15, 19], lg: [17, 21] }[size];

  const isActive = isHovered || isDragging;

  const defaultTrackBg = trackBg ?? "rgba(255, 255, 255, 0.16)";
  const defaultTrackActiveBg = trackActiveBg ?? "rgba(255, 255, 255, 0.30)";

  return (
    <div
      className={`group relative flex ${containerHeights} items-center select-none prevent-seek ${className}`}
      style={style}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {showTime && (
        <span className="text-[11px] tabular-nums text-text-tertiary w-[36px] text-right shrink-0 pr-[8px]">
          {formatPlaybackTime(currentPosition)}
        </span>
      )}

      <div
        role="slider"
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={duration}
        aria-valuenow={currentPosition}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        // phones: the finger drags the slider, the page / player sheet doesn't
        // pan or scroll under it (that cancelled every seek)
        style={{ touchAction: "none" }}
        className="relative flex h-full flex-1 items-center cursor-pointer outline-none"
      >
        <motion.div
          ref={trackRef}
          initial={false}
          animate={{
            backgroundColor: isActive ? defaultTrackActiveBg : defaultTrackBg,
          }}
          transition={{
            type: "spring",
            stiffness: 400,
            damping: 30,
            mass: 0.8,
          }}
          className={`relative w-full rounded-full overflow-hidden origin-center ${baseTrackHeights} ${trackClassName}`}
        >
          <div
            className={`absolute inset-y-0 left-0 rounded-full transition-[width] ease-out ${
              isDragging ? "duration-0" : "duration-100"
            } ${fillClassName || "bg-text-primary"}`}
            style={{
              width: `${percentage}%`,
              ...(fillColor ? { backgroundColor: fillColor } : {}),
            }}
          />
        </motion.div>
        <div
          aria-hidden
          className={`pointer-events-none absolute top-1/2 w-[4px] rounded-full shadow-[0_0_6px_rgba(0,0,0,0.35)] transition-[height,left] ease-out ${
            isDragging ? "duration-0" : "duration-100"
          } ${fillClassName || "bg-text-primary"}`}
          style={{
            left: `${percentage}%`,
            height: isActive ? thumbHeights[1] : thumbHeights[0],
            transform: "translate(-50%, -50%)",
            ...(fillColor ? { backgroundColor: fillColor } : {}),
          }}
        />
      </div>

      {showTime && (
        <span className="text-[11px] tabular-nums text-text-tertiary w-[36px] shrink-0 pl-[8px]">
          {formatPlaybackTime(duration)}
        </span>
      )}
    </div>
  );
});

export default TimelineSlider;
