export type ThemeHSV = { h: number; s: number; v: number };

export function parseThemeHex(value: string): string | undefined {
  const hex = value.trim().replace(/^#/, "");
  if (/^[0-9a-f]{6}$/i.test(hex)) return `#${hex.toLowerCase()}`;
}

export function hexToThemeHSV(hex: string): ThemeHSV {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const range = max - Math.min(r, g, b);
  const hue = !range ? 0 : max === r ? (g - b) / range : max === g ? 2 + (b - r) / range : 4 + (r - g) / range;
  return { h: (hue * 60 + 360) % 360, s: max ? 100 * range / max : 0, v: 100 * max };
}

export function themeHSVToHex({ h, s, v }: ThemeHSV): string {
  const value = v / 100;
  const channel = (offset: number) => {
    const k = (offset + h / 60) % 6;
    return Math.round(255 * value * (1 - s / 100 * Math.max(0, Math.min(k, 4 - k, 1)))).toString(16).padStart(2, "0");
  };
  return `#${channel(5)}${channel(3)}${channel(1)}`;
}
