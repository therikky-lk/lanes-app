/**
 * Rounded-rectangle signed-distance normals encoded as an SVG displacement map.
 * The body slightly magnifies the backdrop, with stronger bending at the rim.
 * RGB 128/128 is neutral; the red/green channels carry horizontal/vertical offsets.
 */
export const LENS_DISPLACEMENT_SCALE = 64;

export function createLensMap(width: number, height: number, radius: number) {
  const ratio = Math.min(1, 1024 / width, 1024 / height);
  const mapWidth = Math.max(1, Math.round(width * ratio));
  const mapHeight = Math.max(1, Math.round(height * ratio));
  const pixels = new Uint8ClampedArray(mapWidth * mapHeight * 4);
  const rim = Math.min(28, height * .48, width * .48);
  // Limit the spatial derivative, not merely the maximum displacement.
  // A sine-shaped rim folds the sample coordinates back over themselves,
  // duplicating text into bands even with a small displacement amplitude.
  const strength = Math.min(6.5, rim * .245);
  const r = Math.min(radius, width / 2, height / 2);
  for (let y = 0; y < mapHeight; y++) {
    for (let x = 0; x < mapWidth; x++) {
      const px = (x + .5) * width / mapWidth - width / 2;
      const py = (y + .5) * height / mapHeight - height / 2;
      const qx = Math.abs(px) - (width / 2 - r);
      const qy = Math.abs(py) - (height / 2 - r);
      const ox = Math.max(qx, 0);
      const oy = Math.max(qy, 0);
      const length = Math.hypot(ox, oy);
      const distance = -(length + Math.min(Math.max(qx, qy), 0) - r);
      let nx = 0;
      let ny = 0;
      if (length > 0) {
        nx = Math.sign(px) * ox / length;
        ny = Math.sign(py) * oy / length;
      } else if (qx > qy) {
        nx = Math.sign(px);
      } else {
        ny = Math.sign(py);
      }
      const bend = distance >= 0 && distance < rim
        ? strength * (1 - distance / rim) ** 2
        : 0;
      // A clear convex body, not just a narrow warped border: text behind the
      // panel grows vertically as in the reference. Keep sampling bounded on
      // wide/tall surfaces, and never apply this map to foreground controls.
      const dx = Math.max(-24, Math.min(24, -px * .024 - nx * bend));
      const dy = Math.max(-24, Math.min(24, -py * .24 - ny * bend));
      const i = (y * mapWidth + x) * 4;
      pixels[i] = 128 + dx / LENS_DISPLACEMENT_SCALE * 255;
      pixels[i + 1] = 128 + dy / LENS_DISPLACEMENT_SCALE * 255;
      pixels[i + 2] = 128;
      pixels[i + 3] = 255;
    }
  }
  return { width: mapWidth, height: mapHeight, pixels };
}
