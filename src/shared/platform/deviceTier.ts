import { isNativeApp } from "./native";

// Weak phones (Galaxy A17 on Helio G99 / Exynos 1330, other Mali-G5x/G68 and
// low Adreno chips) draw the same app with cheaper effects: fewer frames for
// the decorative animations and lighter blur. Nothing is turned off.
//
// The verdict can be forced from the console for testing:
//   localStorage.setItem("lane_perf_tier", "low" | "high")

export type DeviceTier = "low" | "normal";

const OVERRIDE_KEY = "lane_perf_tier";

// GPUs of budget and older mid-range chips
const WEAK_GPU =
  /mali-(?:t\d+|g(?:31|51|52|57|68|71|72|76))\b|adreno[^0-9]*(?:[1-5]\d\d|6[0-1]\d)\b|powervr|\bimg\b|ge8320|bxm-/i;

let cached: DeviceTier | null = null;

function gpuRenderer(): string {
  try {
    const canvas = document.createElement("canvas");
    const gl = (canvas.getContext("webgl") || canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (!gl) return "";
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const name = String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return name;
  } catch {
    return "";
  }
}

export function deviceTier(): DeviceTier {
  if (cached) return cached;
  let forced: string | null = null;
  try {
    forced = localStorage.getItem(OVERRIDE_KEY);
  } catch {}
  if (forced === "low" || forced === "high") {
    cached = forced === "low" ? "low" : "normal";
    return cached;
  }
  // desktops are never treated as weak
  if (typeof navigator === "undefined" || !isNativeApp()) {
    cached = "normal";
    return cached;
  }
  const cores = navigator.hardwareConcurrency || 8;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  cached = cores <= 4 || memory <= 2 || WEAK_GPU.test(gpuRenderer()) ? "low" : "normal";
  return cached;
}

export function isLowEndDevice(): boolean {
  return deviceTier() === "low";
}
