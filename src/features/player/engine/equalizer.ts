// Standard octave centres for a ten-band graphic equalizer.
export const EQ_BANDS = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
export const EQ_MIN_DB = -12;
export const EQ_MAX_DB = 12;
export const EQ_MAX_CUSTOM_PRESETS = 12;
export const EQ_PRESET_NAME_MAX = 24;
export const FLAT_EQ = EQ_BANDS.map(() => 0);
export type EqPresetCategory = "enhance" | "genre" | "accent";
export interface EqCustomPreset { id: string; name: string; gains: number[] }
interface EqPreset { id: string; category: EqPresetCategory; gains: number[] }
export const EQ_PRESETS: EqPreset[] = [
  { id: "hifi", category: "enhance", gains: [2, 1, 0, -1, -0.5, 0, 1, 2, 2, 1] },
  { id: "clarity", category: "enhance", gains: [0, -1, -1, -2, -1, 1, 2, 2, 1, 0] },
  { id: "warmth", category: "enhance", gains: [1, 2, 2, 1, 0, 0, -1, -1, -2, -2] },
  { id: "spacious", category: "enhance", gains: [1, 0, -1, -1, -2, -1, 1, 2, 1, 2] },
  { id: "headphones", category: "enhance", gains: [2, 2, 0, -1, 0, 1, 2, 1, 0, 1] },
  { id: "laptop", category: "enhance", gains: [-5, -3, 1, 3, 2, 0, 1, 2, 0, -1] },
  { id: "night", category: "enhance", gains: [-3, -2, -1, 0, 1, 2, 1, 0, -2, -3] },
  { id: "punch", category: "enhance", gains: [0, 3, 2, -1, -2, 0, 2, 1, 0, 0] },
  { id: "smooth", category: "enhance", gains: [1, 1, 0, 0, 0, -1, -2, -3, -1, 0] },
  { id: "pop", category: "genre", gains: [1, 2, 1, 0, -1, 1, 2, 2, 1, 0] },
  { id: "rock", category: "genre", gains: [2, 3, 1, -1, -2, 0, 2, 3, 2, 1] },
  { id: "hiphop", category: "genre", gains: [5, 4, 2, 0, -1, 0, 1, 0, 2, 1] },
  { id: "electronic", category: "genre", gains: [4, 3, 0, -1, -2, 1, 2, 1, 3, 2] },
  { id: "jazz", category: "genre", gains: [1, 2, 0, 1, 0, -1, 1, 2, 1, 1] },
  { id: "classical", category: "genre", gains: [1, 1, 0, 0, 0, 0, 1, 2, 3, 2] },
  { id: "bass", category: "accent", gains: [5, 6, 3, 1, 0, 0, 0, 0, 0, 0] },
  { id: "vocal", category: "accent", gains: [-3, -2, 0, 1, 3, 4, 3, 1, -1, -2] },
  { id: "treble", category: "accent", gains: [0, 0, 0, 0, 0, 1, 3, 4, 4, 3] },
];
export function clampEqGain(value: number) {
  return Number.isFinite(value) ? Math.max(EQ_MIN_DB, Math.min(EQ_MAX_DB, Math.round(value * 2) / 2)) : 0;
}
export function normalizeEqGains(value: unknown): number[] {
  return EQ_BANDS.map((_, index) => Array.isArray(value) && typeof value[index] === "number" ? clampEqGain(value[index]) : 0);
}
export function normalizeEqCustomPresets(value: unknown): EqCustomPreset[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap(item => {
    if (!item || typeof item.id !== "string" || seen.has(item.id) || typeof item.name !== "string" || !item.name.trim()) return [];
    seen.add(item.id);
    return [{ id: item.id, name: item.name.trim().slice(0, EQ_PRESET_NAME_MAX), gains: normalizeEqGains(item.gains) }];
  }).slice(0, EQ_MAX_CUSTOM_PRESETS);
}
export function isEqActive(enabled: boolean, gains: number[]) { return enabled && gains.some(gain => Math.abs(gain) > 0.01); }
export function eqPreampDb(gains: number[]) { return -Math.max(0, ...normalizeEqGains(gains)); }
export function formatEqFrequency(value: number) { return value >= 1000 ? `${value / 1000}k` : String(value); }
