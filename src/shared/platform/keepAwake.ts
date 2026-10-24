// Keeps Lane from being put to sleep while a long job runs (a big import).
// Android: a foreground service with a progress notification and wake locks;
// desktop: a power-save blocker so the app isn't suspended. Also tells whether
// Android's battery optimization may freeze Lane in the background (which
// cuts background playback on many phones) and asks to lift it.
import { registerPlugin } from "@capacitor/core";
import { isNativeApp } from "./native";

interface Progress {
  title?: string;
  text?: string;
  progress?: number;
  max?: number;
}

const LaneKeepAwake = registerPlugin<{
  start(options: Progress): Promise<void>;
  update(options: Progress): Promise<void>;
  stop(): Promise<void>;
  batteryStatus(): Promise<{ supported: boolean; ignoring: boolean }>;
  requestBatteryExemption(): Promise<{ ignoring: boolean }>;
}>("LaneKeepAwake");

let holders = 0;

/** hold the app awake until the returned release is called */
export async function keepAwake(initial: Progress): Promise<{ update: (p: Progress) => void; release: () => void }> {
  holders += 1;
  try {
    if (isNativeApp()) await LaneKeepAwake.start(initial);
    else await window.linerElectron?.keepAwake?.(true);
  } catch {
    // best effort: the job still runs, it may just pause with the screen off
  }
  let released = false;
  return {
    update: (p) => {
      if (released || !isNativeApp()) return;
      void LaneKeepAwake.update(p).catch(() => {});
    },
    release: () => {
      if (released) return;
      released = true;
      holders = Math.max(0, holders - 1);
      if (holders > 0) return;
      if (isNativeApp()) void LaneKeepAwake.stop().catch(() => {});
      else void window.linerElectron?.keepAwake?.(false)?.catch?.(() => {});
    },
  };
}

/** Android only: is Lane allowed to run in the background without being frozen */
export async function batteryOptimizationStatus(): Promise<{ supported: boolean; ignoring: boolean }> {
  if (!isNativeApp()) return { supported: false, ignoring: true };
  try {
    return await LaneKeepAwake.batteryStatus();
  } catch {
    return { supported: false, ignoring: true };
  }
}

/** Android only: shows the system prompt to let Lane run in the background */
export async function requestBatteryExemption(): Promise<boolean> {
  if (!isNativeApp()) return true;
  try {
    return (await LaneKeepAwake.requestBatteryExemption()).ignoring;
  } catch {
    return false;
  }
}
