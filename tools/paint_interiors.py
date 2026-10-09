#!/usr/bin/env python
"""Interior details for blender/scripts/build_interior_kit.py (Pillow + open-licensed fonts):
wall calendar, film posters for Mkurugenzi's stories (original artwork), family photo frames,
the hoteli menu board, a TV screen and a crochet doily pattern.
  python tools/paint_interiors.py <out_dir>
"""
import os
import random
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONTS = os.path.join(ROOT, "blender", "fonts")
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "blender", "cache")
R = random.Random(5)


def font(name, size):
    return ImageFont.truetype(os.path.join(FONTS, name), size)


def calendar():
    im = Image.new("RGB", (256, 384), (245, 245, 240))
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, 256, 150], fill=(200, 20, 30))
    d.text((128, 60), "2026", font=font("Anton-Regular.ttf", 64), fill=(255, 255, 255), anchor="mm")
    d.text((128, 120), "MAMA NJERI SUPERMARKET", font=font("BebasNeue-Regular.ttf", 22), fill=(255, 230, 120), anchor="mm")
    for r in range(5):
        for c in range(7):
            d.rectangle([14 + c * 33, 170 + r * 40, 40 + c * 33, 200 + r * 40], outline=(150, 150, 150))
            d.text((27 + c * 33, 185 + r * 40), str(r * 7 + c + 1) if r * 7 + c < 31 else "", font=font("BebasNeue-Regular.ttf", 18), fill=(40, 40, 40), anchor="mm")
    im.save(os.path.join(OUT, "int_calendar.png"))


def poster(name, title, tag, bg, fg):
    im = Image.new("RGB", (256, 384), bg)
    d = ImageDraw.Draw(im)
    # silhouette: storyteller in a flat cap (original art)
    d.ellipse([88, 90, 168, 180], fill=tuple(int(c * 0.35) for c in bg))
    d.pieslice([80, 70, 176, 140], 180, 360, fill=tuple(int(c * 0.3) for c in bg))
    d.rounded_rectangle([60, 175, 196, 300], 30, fill=tuple(int(c * 0.35) for c in bg))
    f = font("Anton-Regular.ttf", 46)
    while d.textlength(title, font=f) > 236:
        f = font("Anton-Regular.ttf", f.size - 2)
    d.text((128, 330), title, font=f, fill=fg, anchor="mm")
    d.text((128, 368), tag, font=font("BebasNeue-Regular.ttf", 20), fill=(240, 240, 240), anchor="mm")
    d.text((128, 30), "A MKURUGENZI STORY", font=font("BebasNeue-Regular.ttf", 22), fill=fg, anchor="mm")
    im.save(os.path.join(OUT, f"int_{name}.png"))


def photos():
    im = Image.new("RGB", (512, 256), (90, 60, 40))
    d = ImageDraw.Draw(im)
    for k in range(3):
        x0 = 20 + k * 165
        d.rectangle([x0, 20, x0 + 150, 236], fill=(230, 220, 200))
        d.rectangle([x0 + 10, 30, x0 + 140, 226], fill=(R.randint(120, 180), R.randint(140, 190), R.randint(160, 210)))
        for p in range(R.randint(2, 4)):  # family portrait silhouettes
            cx = x0 + 35 + p * 30
            skin = (R.randint(70, 110), R.randint(45, 70), R.randint(30, 45))
            d.ellipse([cx - 12, 100, cx + 12, 126], fill=skin)
            d.rounded_rectangle([cx - 16, 128, cx + 16, 200], 8, fill=R.choice([(180, 30, 40), (30, 60, 140), (240, 240, 240), (40, 120, 60)]))
    im.save(os.path.join(OUT, "int_photos.png"))


def menu():
    im = Image.new("RGB", (512, 384), (25, 30, 28))
    d = ImageDraw.Draw(im)
    d.text((256, 40), "CHAI MOTO HOTELI", font=font("Anton-Regular.ttf", 44), fill=(255, 205, 40), anchor="mm")
    items = [("Chai", 30), ("Mandazi", 10), ("Chapati", 20), ("Beans na chapo", 120), ("Githeri", 100), ("Pilau", 200)]
    for i, (n, p) in enumerate(items):
        y = 100 + i * 44
        d.text((40, y), n, font=font("PermanentMarker-Regular.ttf", 30), fill=(240, 240, 235), anchor="lm")
        d.text((470, y), f"{p}/=", font=font("PermanentMarker-Regular.ttf", 30), fill=(240, 240, 235), anchor="rm")
    im.save(os.path.join(OUT, "int_menu.png"))


def tv():
    im = Image.new("RGB", (512, 288), (10, 10, 14))
    d = ImageDraw.Draw(im)
    for y in range(288):
        t = y / 288
        d.line([0, y, 512, y], fill=(int(30 + 80 * t), int(20 + 30 * t), int(60 + 40 * (1 - t))))
    d.text((256, 120), "MKURUGENZI", font=font("Anton-Regular.ttf", 72), fill=(255, 200, 40), anchor="mm")
    d.text((256, 190), "STORY TIME • TONIGHT 8PM", font=font("BebasNeue-Regular.ttf", 34), fill=(255, 255, 255), anchor="mm")
    im.save(os.path.join(OUT, "int_tv.png"))


def doily():
    im = Image.new("RGB", (256, 256), (245, 243, 236))
    d = ImageDraw.Draw(im)
    for r in range(120, 10, -14):
        d.ellipse([128 - r, 128 - r, 128 + r, 128 + r], outline=(205, 200, 190), width=3)
    for k in range(24):
        import math
        a = k * math.pi / 12
        d.line([128, 128, 128 + 120 * math.cos(a), 128 + 120 * math.sin(a)], fill=(215, 210, 200), width=2)
    im.filter(ImageFilter.GaussianBlur(0.6)).save(os.path.join(OUT, "int_doily.png"))


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    calendar()
    poster("poster_a", "MAKOSA NI YANGU", "NOW SHOWING", (120, 20, 30), (255, 210, 60))
    poster("poster_b", "UTAFRAAAIA", "THE STORY CONTINUES", (20, 40, 90), (255, 255, 255))
    photos()
    menu()
    tv()
    doily()
    print("[interiors] written to", OUT)
