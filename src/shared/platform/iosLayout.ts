export function iosKeyboardInsets(
  layoutHeight: number,
  viewportHeight: number,
  viewportTop: number,
  scale: number,
  editableFocused: boolean,
): { top: number; bottom: number } {
  // A user pinch is not a keyboard resize; leave the zoomed layout alone.
  if (!editableFocused || Math.abs(scale - 1) > 0.02) return { top: 0, bottom: 0 };
  const top = Math.max(0, Math.round(viewportTop));
  return { top, bottom: Math.max(0, Math.round(layoutHeight - viewportHeight - top)) };
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
      const insets = iosKeyboardInsets(root.clientHeight, viewport.height, viewport.offsetTop, viewport.scale, editable);
      root.style.setProperty("--lane-ios-viewport-top", `${insets.top}px`);
      root.style.setProperty("--lane-ios-keyboard-inset", `${insets.bottom}px`);
    };
    for (const event of ["resize", "scroll"]) viewport.addEventListener(event, updateKeyboard);
    for (const event of ["focusin", "focusout"]) {
      document.addEventListener(event, () => window.requestAnimationFrame(updateKeyboard));
    }
    updateKeyboard();
  }
}
