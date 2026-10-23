import { useSyncExternalStore } from "react";
import { isNativeApp } from "@/shared/platform/native";

const QUERY = "(max-width: 720px)";

function getSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  return isNativeApp() || window.matchMedia(QUERY).matches;
}

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/** phone layout: the Android app, or any window narrower than a tablet */
export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

export function isMobileLayout(): boolean {
  return getSnapshot();
}
