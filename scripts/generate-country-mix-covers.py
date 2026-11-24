"""Generate the Top 25 cover mosaics from the local flag art (requires Pillow)."""

from pathlib import Path
import re

from PIL import Image, ImageEnhance


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
catalog = (ROOT / "src/features/home/vibe/vibeLanguages.ts").read_text()
countries = sorted(set(re.findall(r'"([A-Z]{2})"', catalog)))
output = PUBLIC / "country-mix-tiles"
output.mkdir(exist_ok=True)

for country in countries:
    flag = Image.open(PUBLIC / "vibe-flags" / f"{country}.png").convert("RGBA")
    left, top, right, bottom = flag.getbbox()
    cropped = flag.crop((left + 5, top + 8, right - 5, bottom - 8))
    pixels = Image.alpha_composite(Image.new("RGBA", cropped.size, "white"), cropped)
    pixels = pixels.convert("RGB").resize((5, 4), Image.Resampling.BOX)
    pixels = ImageEnhance.Color(pixels).enhance(1.3)
    tiles = []
    for y in range(4):
        for x in range(5):
            rgb = pixels.getpixel((x, y))
            light = 0.71 + x * 0.1 + (0.06 if (x + y) % 2 else 0)
            lift = max(0, x - 2) * 16
            color = "#" + "".join(f"{round(max(0, min(255, c * light + lift))):02x}" for c in rgb)
            tiles.append(f'<rect x="{x}" y="{y}" width="1" height="1" fill="{color}"/>')
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 5 4" preserveAspectRatio="none" shape-rendering="crispEdges">'
        + "".join(tiles)
        + "</svg>\n"
    )
    (output / f"{country}.svg").write_text(svg)
