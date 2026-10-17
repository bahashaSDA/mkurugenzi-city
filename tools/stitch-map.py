"""Stitch the tiles photographed by tools/render-map.mjs into the satellite map the map screens draw
(src/ui/satMap.ts):

  public/map/sat/overview.webp   the whole world, 2048 px (drawn when zoomed out, and the minimap)
  public/map/sat/{i}_{j}.webp    8 x 8 detail tiles of 1024 px, 500 m each (loaded as you zoom in)

Image x = world x (west -> east), image y = world z (north = -Z at the top), matching the map.

  node tools/render-map.mjs <tiles> 16 512 -2000,-2000,2000,2000
  python tools/stitch-map.py <tiles> [N=16]
"""
import os
import sys

from PIL import Image, ImageEnhance

SRC = sys.argv[1]
N = int(sys.argv[2]) if len(sys.argv) > 2 else 16
OUT = os.path.join(os.path.dirname(__file__), "..", "public", "map", "sat")
DETAIL = 8  # detail grid
os.makedirs(OUT, exist_ok=True)

px = Image.open(os.path.join(SRC, "0_0.png")).size[0]
full = Image.new("RGB", (N * px, N * px))
for j in range(N):
    for i in range(N):
        full.paste(Image.open(os.path.join(SRC, f"{i}_{j}.png")).convert("RGB"), (i * px, j * px))

# a satellite photo is a little crisper and more saturated than a flat noon render
full = ImageEnhance.Contrast(full).enhance(1.12)
full = ImageEnhance.Color(full).enhance(1.15)

full.resize((2048, 2048), Image.LANCZOS).save(os.path.join(OUT, "overview.webp"), quality=78, method=6)
step = full.size[0] // DETAIL
for j in range(DETAIL):
    for i in range(DETAIL):
        t = full.crop((i * step, j * step, (i + 1) * step, (j + 1) * step))
        if t.size[0] != 1024:
            t = t.resize((1024, 1024), Image.LANCZOS)
        t.save(os.path.join(OUT, f"{i}_{j}.webp"), quality=74, method=6)
total = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
print(f"[stitch] {N}x{N} tiles of {px}px -> overview + {DETAIL}x{DETAIL} detail, {total / 1e6:.1f} MB")
