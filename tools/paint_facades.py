#!/usr/bin/env python
"""Building facade textures for the town kit (Nairobi commercial streets, estates and the CBD),
painted with Pillow + open-licensed fonts. Run by blender/scripts/build_town_kit.py:
  python tools/paint_facades.py <out_dir>

Tiles (one bay wide x one floor high, they repeat across a facade):
  fac_upper.png   2x2 atlas of upper-floor bays: plaster + grilled window, + balcony, office ribbon, apartment
  fac_glass.png   curtain-wall module (tinted per tower by vertex colour)
  fac_shops.png   8 ground-floor shop bays with signboards (fictional businesses), roller shutters, goods
  fac_house.png   house wall with a burglar-barred window (suburban bungalows)
Business names are invented; no real brands or telcos (SPEC 2.5).
"""
import os
import random
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONTS = os.path.join(ROOT, "blender", "fonts")
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "blender", "cache")
os.makedirs(OUT, exist_ok=True)
R = random.Random(11)


def font(name, size):
    return ImageFont.truetype(os.path.join(FONTS, name), size)


def noise_wall(w, h, base, amount=10):
    im = Image.new("RGB", (w, h), base)
    px = im.load()
    for y in range(h):
        for x in range(w):
            n = R.randint(-amount, amount)
            px[x, y] = tuple(max(0, min(255, c + n)) for c in base)
    return im.filter(ImageFilter.GaussianBlur(0.8))


def window(d, x0, y0, x1, y1, grill=True, curtain=None):
    d.rectangle([x0 - 6, y0 - 6, x1 + 6, y1 + 10], fill=(200, 198, 192))  # surround + sill
    d.rectangle([x0, y0, x1, y1], fill=(46, 58, 66))
    # sky reflection gradient
    for k in range(y1 - y0):
        t = k / max(1, y1 - y0)
        d.line([x0, y0 + k, x1, y0 + k], fill=(int(70 + 60 * (1 - t)), int(88 + 60 * (1 - t)), int(100 + 70 * (1 - t))))
    if curtain:
        d.rectangle([x0 + 2, y0 + 2, x0 + (x1 - x0) // 3, y1 - 2], fill=curtain)
    mx = (x0 + x1) // 2
    d.rectangle([mx - 2, y0, mx + 2, y1], fill=(225, 225, 222))  # frame
    d.rectangle([x0, (y0 + y1) // 2 - 2, x1, (y0 + y1) // 2 + 2], fill=(225, 225, 222))
    if grill:  # burglar bars: every Nairobi window has them
        for gx in range(x0 + 10, x1, 18):
            d.line([gx, y0, gx, y1], fill=(30, 30, 30), width=3)
        d.line([x0, y0 + (y1 - y0) // 4, x1, y0 + (y1 - y0) // 4], fill=(30, 30, 30), width=3)


def upper_tiles():
    S = 512
    atlas = Image.new("RGB", (S * 2, S * 2))
    # 0: plaster bay with grilled window
    t = noise_wall(S, S, (232, 226, 214))
    d = ImageDraw.Draw(t)
    window(d, 120, 150, 392, 400, curtain=(150, 40, 40))
    d.rectangle([0, S - 26, S, S], fill=(205, 198, 186))  # floor band
    atlas.paste(t, (0, 0))
    # 1: balcony bay: sliding door + rail + plant
    t = noise_wall(S, S, (236, 222, 200))
    d = ImageDraw.Draw(t)
    window(d, 90, 110, 422, 470, grill=False, curtain=(60, 90, 150))
    d.rectangle([60, 360, 452, 372], fill=(60, 60, 60))
    for x in range(70, 452, 22):
        d.line([x, 372, x, 470], fill=(60, 60, 60), width=4)
    d.ellipse([380, 300, 440, 360], fill=(50, 120, 50))
    d.rectangle([0, S - 26, S, S], fill=(205, 192, 172))
    atlas.paste(t, (S, 0))
    # 2: office ribbon window (concrete band + continuous glazing)
    t = noise_wall(S, S, (196, 194, 188), 6)
    d = ImageDraw.Draw(t)
    d.rectangle([0, 120, S, 420], fill=(60, 76, 88))
    for k in range(300):
        tt = k / 300
        d.line([0, 120 + k, S, 120 + k], fill=(int(70 + 80 * (1 - tt)), int(90 + 80 * (1 - tt)), int(105 + 90 * (1 - tt))))
    for x in range(0, S, 128):
        d.rectangle([x, 120, x + 5, 420], fill=(40, 42, 44))
    atlas.paste(t, (0, S))
    # 3: apartment bay with washing on the balcony rail (very Nairobi)
    t = noise_wall(S, S, (240, 236, 228))
    d = ImageDraw.Draw(t)
    window(d, 140, 120, 372, 330, curtain=(200, 170, 60))
    d.rectangle([30, 380, 482, 392], fill=(70, 70, 70))
    for x in range(40, 482, 26):
        d.line([x, 392, x, 480], fill=(70, 70, 70), width=4)
    for k in range(5):
        x = 50 + k * 85
        c = R.choice([(200, 40, 40), (40, 90, 200), (240, 240, 240), (230, 180, 40), (40, 150, 90)])
        d.rectangle([x, 380, x + 60, 440 + R.randint(0, 30)], fill=c)
    d.rectangle([0, S - 26, S, S], fill=(214, 206, 196))
    atlas.paste(t, (S, S))
    atlas.save(os.path.join(OUT, "fac_upper.png"))


def glass_tile():
    S = 512
    t = Image.new("RGB", (S, S))
    d = ImageDraw.Draw(t)
    for k in range(S):
        tt = k / S
        d.line([0, k, S, k], fill=(int(120 + 90 * (1 - tt)), int(150 + 80 * (1 - tt)), int(170 + 70 * (1 - tt))))
    for x in (0, S // 2):
        d.rectangle([x, 0, x + 8, S], fill=(55, 60, 66))
    d.rectangle([0, S - 40, S, S], fill=(55, 60, 66))  # spandrel at the slab
    d.rectangle([0, 0, S, 6], fill=(55, 60, 66))
    t.save(os.path.join(OUT, "fac_glass.png"))


SHOPS = [
    ("MAMA NJERI SUPERMARKET", (200, 30, 40), (255, 255, 255)),
    ("WAKURUGENZI BARBERSHOP", (20, 20, 22), (255, 200, 30)),
    ("SHIKO CHEMIST", (20, 140, 70), (255, 255, 255)),
    ("BABA OTIENO HARDWARE", (240, 190, 20), (20, 20, 20)),
    ("MOBILE MONEY AGENT", (30, 110, 60), (255, 255, 255)),
    ("STAR CYBER & PRINTING", (20, 60, 170), (255, 255, 255)),
    ("BIBI BEAUTY SALON", (220, 60, 150), (255, 255, 255)),
    ("NYAMA ZONE BUTCHERY", (150, 20, 20), (255, 230, 200)),
]


def shop_tiles():
    S = 512
    atlas = Image.new("RGB", (S * 8, S))
    for i, (name, bg, fg) in enumerate(SHOPS):
        t = noise_wall(S, S, (226, 220, 206))
        d = ImageDraw.Draw(t)
        d.rectangle([0, 18, S, 120], fill=bg)  # signboard
        f = font("Anton-Regular.ttf", 56)
        while d.textlength(name, font=f) > S - 30 and f.size > 20:
            f = font("Anton-Regular.ttf", f.size - 2)
        d.text((S // 2, 69), name, font=f, fill=fg, anchor="mm")
        # roller shutter half up over a lit shop interior with goods on shelves
        d.rectangle([40, 140, S - 40, S], fill=(40, 34, 30))
        for y in range(220, S - 40, 60):
            d.rectangle([60, y, S - 60, y + 6], fill=(120, 100, 80))
            for x in range(70, S - 70, 26):
                d.rectangle([x, y - 34, x + 18, y], fill=R.choice([(220, 40, 40), (40, 120, 220), (240, 200, 40), (240, 240, 240), (60, 170, 80)]))
        for y in range(140, 220, 8):  # rolled shutter slats
            d.line([40, y, S - 40, y], fill=(150, 150, 152), width=5)
        d.rectangle([0, S - 20, S, S], fill=(150, 146, 140))
        atlas.paste(t, (i * S, 0))
    atlas.resize((S * 8 * 5 // 8, S * 5 // 8), Image.LANCZOS).save(os.path.join(OUT, "fac_shops.png"))  # keep the kit under budget


def house_tile():
    S = 512
    t = noise_wall(S, S, (240, 232, 214))
    d = ImageDraw.Draw(t)
    window(d, 130, 140, 382, 360, curtain=(180, 140, 90))
    d.rectangle([0, S - 60, S, S], fill=(170, 150, 120))  # plinth
    t.save(os.path.join(OUT, "fac_house.png"))


def sign(name, text, bg, fg, w=1024, h=192, fnt="Anton-Regular.ttf"):
    im = Image.new("RGB", (w, h), bg)
    d = ImageDraw.Draw(im)
    f = font(fnt, int(h * 0.62))
    while d.textlength(text, font=f) > w - 40:
        f = font(fnt, f.size - 4)
    d.text((w // 2, h // 2), text, font=f, fill=fg, anchor="mm")
    im.save(os.path.join(OUT, f"{name}.png"))


if __name__ == "__main__":
    upper_tiles()
    glass_tile()
    shop_tiles()
    house_tile()
    sign("sign_tower", "MKURUGENZI", (8, 8, 10), (255, 200, 40))
    sign("sign_arena", "WAKURUGENZI ARENA", (14, 14, 18), (255, 255, 255))
    sign("sign_studio", "PHIL-IT STUDIOS", (10, 10, 10), (240, 240, 240))
    sign("sign_school", "FREDDIE'S SCHOOL", (20, 60, 150), (255, 255, 255))
    sign("sign_petrol", "MK ENERGY", (200, 20, 30), (255, 255, 255))
    sign("sign_church", "KANISA LA AMANI", (240, 240, 236), (60, 40, 30), fnt="BebasNeue-Regular.ttf")
    print("[facades] written to", OUT)
