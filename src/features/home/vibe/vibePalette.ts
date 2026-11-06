export type RGB = [number, number, number];
export type VibePalette = [core: RGB, mid: RGB, edge: RGB];

export const DEFAULT_VIBE_PALETTE: VibePalette = [
  [255, 227, 154],
  [255, 138, 31],
  [234, 61, 47],
];

function hsl(h: number, s: number, l: number): RGB {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

/** A slow, seamless full-spectrum cycle while no track supplies a cover. */
export function ambientVibePalette(seconds: number): VibePalette {
  const hue = 285 + seconds * 4;
  return [hsl(hue + 12, 0.9, 0.82), hsl(hue, 0.92, 0.56), hsl(hue + 42, 0.88, 0.38)];
}

export function lerpPalette(a: VibePalette, b: VibePalette, t: number): VibePalette {
  return a.map((ca, i) => ca.map((v, j) => v + (b[i][j] - v) * t) as RGB) as VibePalette;
}

export function rgba(c: RGB, alpha = 1): string {
  return `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${alpha})`;
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max ? d / max : 0, max];
}

/** picks the two most present vivid hues of an image */
export function paletteFromPixels(data: Uint8ClampedArray): VibePalette {
  const bins = new Array(72).fill(0);
  const hueSum = new Array(72).fill(0);
  const saturationSum = new Array(72).fill(0);
  let opaque = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    opaque++;
    const [h, s, v] = rgbToHsv(data[i], data[i + 1], data[i + 2]);
    // Include pastels and dark artwork instead of collapsing them to orange.
    if (s < 0.08 || v < 0.06) continue;
    const w = Math.pow(s, 1.3) * Math.pow(v, 0.8);
    const bin = Math.floor(h / 5) % 72;
    bins[bin] += w;
    hueSum[bin] += h * w;
    saturationSum[bin] += s * w;
  }
  const ranked = bins
    .map((w, i) => ({ w, h: w ? hueSum[i] / w : 0, s: w ? saturationSum[i] / w : 0 }))
    .filter((b) => b.w > 0)
    .sort((a, b) => b.w - a.w);
  if (ranked.length === 0) return opaque ? [[245, 245, 250], [155, 155, 168], [55, 55, 68]] : DEFAULT_VIBE_PALETTE;
  const main = ranked[0].h;
  const hueDist = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
  const second = ranked.find((b) => hueDist(b.h, main) >= 25)?.h ?? (main + 28) % 360;
  const saturation = Math.min(0.96, Math.max(0.3, ranked[0].s * 1.1));
  return [hsl(main + 12, saturation, 0.82), hsl(main, saturation, 0.56), hsl(second, saturation * 0.95, 0.48)];
}

const cache = new Map<string, VibePalette>();

export function loadVibePalette(src: string | null | undefined): Promise<VibePalette> {
  if (!src) return Promise.resolve(DEFAULT_VIBE_PALETTE);
  const hit = cache.get(src);
  if (hit) return Promise.resolve(hit);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = c.height = 32;
        const ctx = c.getContext("2d", { willReadFrequently: true });
        if (!ctx) return resolve(DEFAULT_VIBE_PALETTE);
        ctx.drawImage(img, 0, 0, 32, 32);
        const p = paletteFromPixels(ctx.getImageData(0, 0, 32, 32).data);
        cache.set(src, p);
        resolve(p);
      } catch {
        resolve(DEFAULT_VIBE_PALETTE);
      }
    };
    img.onerror = () => resolve(DEFAULT_VIBE_PALETTE);
    img.src = src;
  });
}
