import type { PersistStorage, StorageValue } from "zustand/middleware";

type PendingWrite = string | (() => string);
const pendingWrites = new Map<string, PendingWrite>();
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
      localStorage.setItem(name, typeof value === "function" ? value() : value);
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

function queueWrite(name: string, value: PendingWrite) {
  if (typeof window === "undefined") return;
  pendingWrites.set(name, value);
  flushTimer ??= setTimeout(flushPendingWrites, 1000);
}

export const debouncedStorage = {
  getItem: (name: string) => {
    if (typeof window === "undefined" || typeof localStorage === "undefined") return null;
    const value = pendingWrites.get(name);
    if (value !== undefined) return typeof value === "function" ? value() : value;
    return localStorage.getItem(name);
  },
  setItem: queueWrite,
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

export function createDeferredJSONStorage<T>(): PersistStorage<T> {
  return {
    getItem(name) {
      const value = debouncedStorage.getItem(name);
      return value === null ? null : JSON.parse(value) as StorageValue<T>;
    },
    setItem(name, value) {
      // Only the newest snapshot per key gets serialized, at flush time.
      queueWrite(name, () => JSON.stringify(value));
    },
    removeItem: debouncedStorage.removeItem,
  };
}
