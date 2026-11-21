declare module "gifenc" {
  type Palette = number[][];
  export function quantize(data: Uint8Array | Uint8ClampedArray, colors: number): Palette;
  export function applyPalette(data: Uint8Array | Uint8ClampedArray, palette: Palette): Uint8Array;
  export function GIFEncoder(): {
    writeFrame(data: Uint8Array, width: number, height: number, options: { palette: Palette; delay: number; repeat?: number }): void;
    finish(): void;
    bytes(): Uint8Array;
  };
}
