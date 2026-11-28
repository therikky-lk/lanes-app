import { SystemBars, SystemBarsStyle } from "@capacitor/core";

export function iosKeyboardInset(
  layoutHeight: number,
  viewportHeight: number,
  viewportTop: number,
  scale: number,
  editableFocused: boolean,
): number {
  // A user pinch is not a keyboard resize; leave the zoomed layout alone.
  if (!editableFocused || Math.abs(scale - 1) > 0.02) return 0;
  return Math.max(0, Math.round(layoutHeight - viewportHeight - viewportTop));
}

export function installIOSLayout(): void {
  const root = document.documentElement;
  root.dataset.lanePlatform = "ios";

  const viewport = window.visualViewport;
  if (viewport) {
    const updateKeyboard = () => {
      const focused = document.activeElement;
      const editable = focused?.matches(
        'textarea, [contenteditable="true"], input:not([type]), input:is([type="text"], [type="email"], [type="password"], [type="search"], [type="tel"], [type="url"], [type="number"])',
      ) ?? false;
      const inset = iosKeyboardInset(root.clientHeight, viewport.height, viewport.offsetTop, viewport.scale, editable);
      root.style.setProperty("--lane-ios-keyboard-inset", `${inset}px`);
    };
    for (const event of ["resize", "scroll"]) viewport.addEventListener(event, updateKeyboard);
    for (const event of ["focusin", "focusout"]) {
      document.addEventListener(event, () => window.requestAnimationFrame(updateKeyboard));
    }
    updateKeyboard();
  }

  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)");
  let previousStyle: SystemBarsStyle | undefined;
  const updateStatusBar = () => {
    const path = window.location.hash.split("?")[0];
    const darkSurface = path === "#/login" || path === "#/player" ||
      root.dataset.theme === "dark" || (!root.dataset.theme && prefersDark.matches);
    const style = darkSurface ? SystemBarsStyle.Dark : SystemBarsStyle.Light;
    if (style === previousStyle) return;
    previousStyle = style;
    void SystemBars.setStyle({ style }).catch(() => { previousStyle = undefined; });
  };
  new MutationObserver(updateStatusBar).observe(root, { attributes: true, attributeFilter: ["data-theme"] });
  window.addEventListener("hashchange", updateStatusBar);
  prefersDark.addEventListener("change", updateStatusBar);
  updateStatusBar();
}
