type VisibilityListener = (visible: boolean) => void;

let visible = true;
let subscribed = false;
let desktopVisible = true;
const listeners = new Set<VisibilityListener>();

export function applyWindowVisibility(next: boolean): void {
  if (next === visible) return;
  visible = next;
  for (const listener of listeners) listener(visible);
}

function ensureSubscribed(): void {
  if (subscribed || typeof window === "undefined") return;
  subscribed = true;
  const update = () => applyWindowVisibility(desktopVisible && (typeof document === "undefined" || !document.hidden));
  window.linerElectron?.onWindowStateChange?.((state) => {
    desktopVisible = state.isVisible !== false;
    update();
  });
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", update);
  update();
}

export function isWindowVisible(): boolean {
  ensureSubscribed();
  return visible;
}

export function onWindowVisibilityChange(listener: VisibilityListener): () => void {
  ensureSubscribed();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
