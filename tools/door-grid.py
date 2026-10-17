"""Draw a metre grid (y along the car, z up; build_real_kit frame) on the side views rendered by
blender/scripts/door_sideviews.py, to read door outlines for the `door_boxes` config.
  python tools/door-grid.py <dir> piece[,piece]
"""
import json
import os
import sys

from PIL import Image, ImageDraw

D = sys.argv[1]
for piece in sys.argv[2].split(","):
    info = json.load(open(os.path.join(D, f"{piece}.json")))
    k = info["px"] / info["ortho"]  # px per metre
    for side in ("left", "right"):
        im = Image.open(os.path.join(D, f"{piece}_{side}.png")).convert("RGB")
        dr = ImageDraw.Draw(im)
        W, H = im.size
        sgn = 1 if side == "left" else -1  # left view: image right = +Y (backwards); right view: = -Y
        y = -info["length"] / 2
        while y <= info["length"] / 2 + 1e-6:
            u = W / 2 + sgn * y * k
            major = abs(round(y * 10) % 5) == 0
            dr.line([(u, 0), (u, H)], fill=(255, 0, 0) if major else (255, 170, 170), width=2 if major else 1)
            if major:
                dr.text((u + 2, 2), f"{y:+.1f}", fill=(200, 0, 0))
            y = round(y + 0.1, 3)
        z = 0.0
        while z <= info["height"] + 1e-6:
            v = H / 2 - (z - info["zc"]) * k
            major = abs(round(z * 10) % 5) == 0
            dr.line([(0, v), (W, v)], fill=(0, 0, 255) if major else (170, 170, 255), width=2 if major else 1)
            if major:
                dr.text((2, v - 12), f"z{z:.1f}", fill=(0, 0, 200))
            z = round(z + 0.1, 3)
        dr.text((W - 260, H - 16), f"{piece} {side} side (front = {'left' if side == 'left' else 'right'})", fill=(0, 0, 0))
        im.save(os.path.join(D, f"{piece}_{side}_grid.png"))
