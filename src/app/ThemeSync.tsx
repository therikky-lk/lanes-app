import { useEffect } from "react";
import { flushSync } from "react-dom";
import { useTheme } from "next-themes";
import { useIsMobile } from "@/shared/hooks/useIsMobile";
import { DEFAULT_CUSTOM_COLOR, useThemePreferences, type ThemeSettings } from "@/shared/theme/themePreferences";
import "./theme-transition.css";

type Transition = { ready: Promise<void>; finished: Promise<void>; skipTransition: () => void };
let active: Transition | undefined;
let lastPointer: { x: number; y: number; at: number } | undefined;

export function animateThemeChange(update: () => void) {
  const doc = document as Document & { startViewTransition?: (update: () => void) => Transition };
  if (!doc.startViewTransition || matchMedia("(prefers-reduced-motion: reduce)").matches) {
    update();
    return;
  }
  active?.skipTransition();
  const point = lastPointer && Date.now() - lastPointer.at < 1000 ? lastPointer : { x: innerWidth / 2, y: innerHeight / 2 };
  const radius = Math.hypot(Math.max(point.x, innerWidth - point.x), Math.max(point.y, innerHeight - point.y));
  const transition = doc.startViewTransition(update);
  active = transition;
  void transition.ready.then(() => {
    document.documentElement.animate(
      { clipPath: [`circle(0px at ${point.x}px ${point.y}px)`, `circle(${radius}px at ${point.x}px ${point.y}px)`] },
      { duration: 650, easing: "cubic-bezier(.22,1,.36,1)", pseudoElement: "::view-transition-new(root)", fill: "both" },
    );
  }).catch(() => {});
  void transition.finished.catch(() => {}).finally(() => { if (active === transition) active = undefined; });
}

export function ThemeSync() {
  const { setTheme } = useTheme();
  const isMobile = useIsMobile();
  useEffect(() => {
    const onPointer = (event: PointerEvent) => { lastPointer = { x: event.clientX, y: event.clientY, at: Date.now() }; };
    document.addEventListener("pointerdown", onPointer, true);
    return () => document.removeEventListener("pointerdown", onPointer, true);
  }, []);
  useEffect(() => {
    const apply = ({ preset, customColor }: ThemeSettings, animate: boolean) => {
      const effective = preset === "liquid-glass" && (!isMobile || window.linerElectron) ? "dark" : preset;
      const root = document.documentElement;
      const seed = customColor ?? DEFAULT_CUSTOM_COLOR;
      const themeChanged = root.dataset.colorTheme !== effective
        || (effective === "custom" && root.style.getPropertyValue("--lane-custom-seed") !== seed);
      const update = () => {
        root.dataset.colorTheme = effective;
        root.style.setProperty("--lane-custom-seed", seed);
        setTheme(effective === "system" ? "system" : effective === "light" ? "light" : "dark");
      };
      if (animate && themeChanged) {
        animateThemeChange(() => flushSync(update));
      } else update();
    };
    apply(useThemePreferences.getState(), false);
    return useThemePreferences.subscribe((state, previous) => {
      if (state.preset !== previous.preset || state.customColor !== previous.customColor) apply(state, true);
    });
  }, [isMobile, setTheme]);
  return null;
}
