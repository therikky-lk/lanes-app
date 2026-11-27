import type { Variants } from "framer-motion";

const enter = [0.22, 1, 0.36, 1] as const;
const leave = [0.4, 0, 1, 1] as const;

export const fadeMotion: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.12, ease: "easeOut" } },
  exit: { opacity: 0, transition: { duration: 0.1, ease: "easeIn" } },
};

// Keep the blur radius fixed; fade the backdrop instead of animating the filter.
export const backdropMotion: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.25, ease: "easeInOut" } },
  exit: { opacity: 0, transition: { duration: 0.15, ease: "easeInOut" } },
};

export const modalMotion: Variants = {
  initial: { opacity: 0, y: -24, scale: 0.93, rotateX: -24, filter: "blur(3px)" },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    rotateX: 0,
    filter: "blur(0px)",
    transition: {
      duration: 0.28,
      ease: enter,
      opacity: { duration: 0.22, ease: [0.28, 0, 0.3, 1] },
      filter: { duration: 0.24, ease: "easeOut" },
    },
    transitionEnd: { filter: "none" },
  },
  exit: {
    opacity: 0,
    y: -9,
    scale: 0.95,
    rotateX: -17,
    filter: "blur(3px)",
    transition: {
      duration: 0.14,
      ease: [0.4, 0, 0.7, 1],
      opacity: { duration: 0.14, ease: "easeInOut" },
    },
  },
};

// Never let Motion interpolate perspective from `none`: it passes through
// perspective(0px), which can project the layer across the whole window.
export function modalTransform({ rotateX }: { rotateX?: unknown }, transform: string) {
  return rotateX && transform && transform !== "none" ? `perspective(950px) ${transform}` : transform || "none";
}

export const sheetMotion: Variants = {
  initial: { y: "100%" },
  animate: { y: 0, transition: { duration: 0.32, ease: enter } },
  exit: { y: "100%", transition: { duration: 0.22, ease: leave } },
};

function makePopoverMotion(y: number): Variants {
  return {
    initial: { opacity: 0, scale: 0.96, y },
    animate: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.19, ease: enter } },
    exit: { opacity: 0, scale: 0.98, y: y / 2, transition: { duration: 0.11, ease: "easeIn" } },
  };
}

export const popoverMotion = {
  top: makePopoverMotion(5),
  bottom: makePopoverMotion(-5),
};
