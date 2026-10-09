#!/usr/bin/env python
"""Mkurugenzi merch artwork for crowd outfits (owner request: dress the city in the real range from
mkurugenzi.ke, Abel's own brand): the "MK" chest mark with the signature underneath, in white and
black, and the faint botanical leaf print of the Botanical tees. Drawn here (study of the shop
photos, no photo pixels used) with open-licensed fonts.
  python tools/paint_merch.py <out_dir>
"""
import math
import os
import random
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONTS = os.path.join(ROOT, "blender", "fonts")
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "blender", "cache")


def logo(colour, name):
    """Geometric M with a K arm (like the brand mark) over a handwritten signature."""
    S = 256
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    c = colour + (255,)
    # M: two posts and a V
    d.polygon([(40, 150), (40, 40), (72, 40), (104, 95), (104, 150), (84, 150), (84, 100), (60, 64), (60, 150)], fill=c)
    # K arm sharing the right post
    d.polygon([(104, 95), (150, 40), (178, 40), (126, 100), (180, 150), (150, 150), (104, 108)], fill=c)
    f = ImageFont.truetype(os.path.join(FONTS, "GreatVibes-Regular.ttf"), 56)
    d.text((118, 192), "Mkurugenzi", font=f, fill=c, anchor="mm")
    d.line([(40, 214), (200, 206)], fill=c, width=3)
    im.save(os.path.join(OUT, name))


def botanical():
    S = 512
    im = Image.new("L", (S, S), 255)
    d = ImageDraw.Draw(im)
    rnd = random.Random(3)
    for _ in range(40):  # large tropical leaves, faint grey
        cx, cy, L, a = rnd.uniform(0, S), rnd.uniform(0, S), rnd.uniform(60, 140), rnd.uniform(0, math.pi * 2)
        for k in range(-6, 7):
            t = k / 6
            px = cx + math.cos(a) * L * t
            py = cy + math.sin(a) * L * t
            w = L * 0.35 * (1 - t * t)
            d.line([(px, py), (px + math.cos(a + 1.2) * w, py + math.sin(a + 1.2) * w)], fill=200, width=6)
            d.line([(px, py), (px + math.cos(a - 1.2) * w, py + math.sin(a - 1.2) * w)], fill=200, width=6)
    im.filter(ImageFilter.GaussianBlur(1.5)).save(os.path.join(OUT, "merch_botanical.png"))


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    logo((245, 245, 245), "merch_logo_white.png")
    logo((18, 18, 20), "merch_logo_black.png")
    logo((60, 32, 20), "merch_logo_brown.png")
    botanical()
    print("[merch] written to", OUT)
