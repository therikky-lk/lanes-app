const pendingWrites = new Map<string, string>();
let flushTimer: ReturnType<typeof setTimeout> | undefined;

function cancelScheduledFlush() {
  if (flushTimer === undefined) return;
  clearTimeout(flushTimer);
  flushTimer = undefined;
}

function flushPendingWrites() {
  cancelScheduledFlush();
  if (typeof localStorage === "undefined" || pendingWrites.size === 0) return;
  for (const [name, value] of pendingWrites.entries()) {
    try {
      localStorage.setItem(name, value);
    } catch {}
  }
  pendingWrites.clear();
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", flushPendingWrites);
  window.addEventListener("pagehide", flushPendingWrites);
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushPendingWrites();
  });
}

export const debouncedStorage = {
  getItem: (name: string) => {
    if (typeof window === "undefined" || typeof localStorage === "undefined") return null;
    if (pendingWrites.has(name)) {
      return pendingWrites.get(name)!;
    }
    return localStorage.getItem(name);
  },
  setItem: (name: string, value: string) => {
    if (typeof window === "undefined") return;
    pendingWrites.set(name, value);
    flushTimer ??= setTimeout(flushPendingWrites, 1000);
  },
  removeItem: (name: string) => {
    if (typeof window === "undefined") return;
    pendingWrites.delete(name);
    if (pendingWrites.size === 0) cancelScheduledFlush();
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(name);
    }
  },
  flush: flushPendingWrites,
};
