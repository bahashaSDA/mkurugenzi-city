#!/usr/bin/env python
"""Vehicle liveries (owner photos 9, 10, 12-15), painted with Pillow + open-licensed fonts.
Run by blender/scripts/build_vehicles_kit.py (system Python, Blender's has no Pillow):
  python tools/paint_liveries.py <out_dir>

Image space = one vehicle side: x runs front (left edge) -> rear (right edge) over the length,
y runs roof (top edge) -> ground (bottom edge) over the height. The right-most 4 % is a plain
body-colour strip used by the front, rear and roof faces.
Operator names, slogans and artwork are original (no real Saccos, brands or celebrity faces).
"""
import math
import os
import random
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONTS = os.path.join(ROOT, "blender", "fonts")
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "blender", "cache")
os.makedirs(OUT, exist_ok=True)


def font(name, size):
    return ImageFont.truetype(os.path.join(FONTS, name), size)


ANTON = "Anton-Regular.ttf"
BEBAS = "BebasNeue-Regular.ttf"
MARKER = "PermanentMarker-Regular.ttf"
SCRIPT = "GreatVibes-Regular.ttf"


class Side:
    """Helpers mapping vehicle metres (y from front, z up) to pixels."""

    def __init__(self, w, h, L, H, base):
        self.w, self.h, self.L, self.H = w, h, L, H
        self.im = Image.new("RGB", (w, h), base)
        self.d = ImageDraw.Draw(self.im)
        self.base = base

    def px(self, y, z):  # y: metres from the FRONT, z: metres above ground
        return (int(y / self.L * self.w * 0.96), int((1 - z / self.H) * self.h))

    def rect(self, y0, z0, y1, z1, col):
        a = self.px(y0, z1)
        b = self.px(y1, z0)
        self.d.rectangle([a, b], fill=col)

    def poly(self, pts, col):
        self.d.polygon([self.px(y, z) for y, z in pts], fill=col)

    def text(self, y, z, s, fnt, col, anchor="lm", stroke=0, stroke_col=(0, 0, 0)):
        self.d.text(self.px(y, z), s, font=fnt, fill=col, anchor=anchor, stroke_width=stroke, stroke_fill=stroke_col)

    def mh(self, metres):  # metres -> pixel height
        return max(1, int(metres / self.H * self.h))

    def strip(self):  # plain body colour for front/rear/roof faces
        self.d.rectangle([int(self.w * 0.96), 0, self.w, self.h], fill=self.base)

    def dust(self, amount=0.35):
        dust = Image.new("RGB", self.im.size, (140, 98, 70))
        mask = Image.linear_gradient("L").resize(self.im.size)
        mask = mask.point(lambda v: int((v / 255) ** 5 * 255 * amount))
        self.im = Image.composite(dust, self.im, mask)
        self.d = ImageDraw.Draw(self.im)

    def save(self, name):
        self.im.save(os.path.join(OUT, f"{name}.png"))


# ----------------------------------------------------------------------------- matatu vans
def van(name, L, H, roof_win, base, band, graphics):
    s = Side(1024, 512, L, H, base)
    # black window surround (pillars read black between the glass, as on real NV350/HiAce matatus)
    s.rect(0.62, 1.16, L - 0.1, roof_win, (14, 14, 16))
    if band:  # NTSA yellow waist band with the little gaps (photos 12, 14)
        s.rect(0.0, 0.93, L, 1.05, band)
        for gy in (1.15, 2.05, 3.0, 3.95):
            s.rect(gy, 0.93, gy + 0.025, 1.05, base)
    # sliding door + front door seams, handles, fuel cap
    for y in (0.62, 1.38, 2.42):
        s.rect(y, 0.36, y + 0.012, 2.0 if roof_win > 2 else 1.75, (120, 122, 124))
    s.rect(1.52, 1.2, 1.68, 1.24, (40, 40, 40))
    s.rect(0.75, 1.2, 0.9, 1.24, (40, 40, 40))
    s.d.ellipse([s.px(L - 1.0, 1.0), s.px(L - 0.86, 0.88)], outline=(150, 150, 150), width=2)
    graphics(s)
    s.strip()
    s.dust(0.4)
    s.save(name)


def van_plain(s):
    s.text(1.45, 1.0, "MKURUGENZI LINE", font(BEBAS, 38), (232, 92, 20))
    s.text(2.65, 1.0, "Shuttle", font(SCRIPT, 34), (40, 40, 40))
    s.text(s.L - 0.45, 0.82, "14 PASS", font(BEBAS, 22), (30, 30, 30))


def van_pimp(s):
    # black swoosh stripes along the body and a script tag, LED-era "uliza" style (photo 15)
    for i, (z, th) in enumerate([(0.62, 0.05), (0.72, 0.025)]):
        pts = []
        for k in range(41):
            y = s.L * k / 40
            pts.append((y, z + 0.08 * math.sin(k / 40 * math.pi * 1.4) + i * 0.02))
        s.d.line([s.px(y, z) for y, z in pts], fill=(10, 10, 12), width=s.mh(th))
    s.text(s.L - 1.1, 0.78, "Uliza Story", font(MARKER, 34), (12, 12, 14))
    s.text(0.62, 0.78, "MKURUGENZI", font(ANTON, 30), (12, 12, 14))
    s.text(1.6, 1.08, "WAKURUGENZI 254", font(BEBAS, 22), (0, 160, 140))


# ----------------------------------------------------------------------------- nganya / bus
PALETTES = [
    dict(base=(14, 14, 18), a=(255, 30, 120), b=(20, 200, 255), c=(255, 205, 20), name="MKURUGENZI", slogan="MAISHA NI STORY"),
    dict(base=(245, 245, 245), a=(30, 60, 220), b=(230, 20, 40), c=(10, 10, 10), name="UTAFRAAAIA", slogan="WAKURUGENZI TUKO PAMOJA"),
    dict(base=(70, 0, 30), a=(255, 120, 0), b=(140, 255, 60), c=(255, 255, 255), name="STORYTELLER", slogan="KILA MTU ANA STORY"),
]


def storyteller_portrait(s, y, z, size, pal):
    """Original airbrush-style art: a storyteller in a flat cap and round glasses (stylised Abel,
    likeness approved for the project), with a halo of colour, like the portraits on photo 9."""
    cx, cy = s.px(y, z)
    r = int(size / s.H * s.h)
    glow = Image.new("RGBA", s.im.size, (0, 0, 0, 0))
    g = ImageDraw.Draw(glow)
    g.ellipse([cx - r * 1.35, cy - r * 1.35, cx + r * 1.35, cy + r * 1.35], fill=pal["a"] + (170,))
    glow = glow.filter(ImageFilter.GaussianBlur(r * 0.25))
    s.im.paste(glow, (0, 0), glow)
    d = ImageDraw.Draw(s.im)
    skin = (92, 56, 36)
    d.rounded_rectangle([cx - r * 1.05, cy + r * 0.55, cx + r * 1.05, cy + r * 1.6], r // 2, fill=(110, 70, 40))  # tweed jacket
    d.polygon([(cx - r * 0.25, cy + r * 0.55), (cx + r * 0.25, cy + r * 0.55), (cx, cy + r * 1.15)], fill=(240, 240, 240))  # shirt
    d.polygon([(cx - r * 0.07, cy + r * 0.62), (cx + r * 0.07, cy + r * 0.62), (cx, cy + r * 1.1)], fill=(30, 30, 30))  # tie
    d.ellipse([cx - r * 0.55, cy - r * 0.7, cx + r * 0.55, cy + r * 0.7], fill=skin)  # head
    d.ellipse([cx - r * 0.45, cy + r * 0.1, cx + r * 0.45, cy + r * 0.72], fill=(35, 25, 20))  # beard
    d.ellipse([cx - r * 0.42, cy + r * 0.05, cx + r * 0.42, cy + r * 0.55], fill=skin)
    for sx in (-1, 1):  # round glasses
        d.ellipse([cx + sx * r * 0.24 - r * 0.17, cy - r * 0.2, cx + sx * r * 0.24 + r * 0.17, cy + r * 0.12], outline=(20, 20, 20), width=max(2, r // 14))
    d.line([cx - r * 0.07, cy - r * 0.05, cx + r * 0.07, cy - r * 0.05], fill=(20, 20, 20), width=max(2, r // 16))
    d.pieslice([cx - r * 0.65, cy - r * 0.95, cx + r * 0.65, cy - r * 0.05], 180, 360, fill=(150, 112, 70))  # flat cap
    d.polygon([(cx - r * 0.1, cy - r * 0.5), (cx + r * 0.75, cy - r * 0.42), (cx + r * 0.6, cy - r * 0.3), (cx - r * 0.1, cy - r * 0.38)], fill=(130, 95, 60))  # peak


def nganya(name, idx, L=7.6, H=3.02):
    pal = PALETTES[idx]
    s = Side(2048, 1024, L, H, pal["base"])
    rnd = random.Random(idx * 7 + 1)
    # neon sweeps + spray splatter
    for _ in range(5):
        c = rnd.choice([pal["a"], pal["b"], pal["c"]])
        z0, amp, fq, th = rnd.uniform(0.7, 1.4), rnd.uniform(0.05, 0.25), rnd.uniform(0.6, 2.2), rnd.uniform(0.03, 0.09)
        ph = rnd.uniform(0, 6.3)
        pts = [(L * k / 160, z0 + amp * math.sin(k / 160 * L * fq + ph)) for k in range(161)]
        s.d.line([s.px(y, z) for y, z in pts], fill=c, width=s.mh(th))
    for _ in range(1200):
        y, z, r = rnd.uniform(0, L), rnd.uniform(0.5, 3.0), rnd.uniform(0.004, 0.02)
        a, b = s.px(y - r, z + r), s.px(y + r, z - r)
        s.d.ellipse([a, b], fill=rnd.choice([pal["a"], pal["b"], pal["c"], (255, 255, 255)]))
    # windows band (black), portraits between window bays, big name on the lower panel
    s.rect(0.55, 1.5, L - 0.15, 2.62, (12, 12, 14))
    storyteller_portrait(s, 1.2, 1.0, 0.5, pal)
    storyteller_portrait(s, L - 1.05, 1.0, 0.5, pal)
    s.text(L / 2, 1.02, pal["name"], font(ANTON, 150), pal["c"], anchor="mm", stroke=6, stroke_col=pal["a"])
    s.text(L / 2, 0.66, pal["slogan"], font(MARKER, 64), (255, 255, 255), anchor="mm", stroke=3, stroke_col=(0, 0, 0))
    s.text(L * 0.62, 2.85, "UTAFRAAAIA • STORIES • BASS", font(BEBAS, 54), pal["c"], anchor="mm")
    s.rect(0.0, 1.38, L, 1.42, (255, 205, 20))  # thin yellow line
    s.strip()
    s.dust(0.25)
    s.save(name)
    # headboard sign above the windscreen (glows at night)
    hb = Image.new("RGB", (1024, 160), (8, 8, 10))
    d = ImageDraw.Draw(hb)
    d.text((512, 80), pal["name"], font=font(ANTON, 118), fill=pal["c"], anchor="mm", stroke_width=4, stroke_fill=pal["a"])
    hb.save(os.path.join(OUT, f"{name}_head.png"))


def sacco_bus(name, L=8.2, H=3.02):
    s = Side(2048, 1024, L, H, (196, 18, 30))
    s.rect(0, 0.0, L, 1.05, (24, 52, 160))  # blue lower body (photo 10)
    s.rect(0, 1.05, L, 1.1, (245, 245, 245))
    s.rect(0, 2.75, L, H, (245, 245, 245))  # white roof cap
    s.rect(0.55, 1.5, L - 0.15, 2.62, (12, 12, 14))
    s.text(1.0, 1.3, "MKURU MOVERS LTD", font(BEBAS, 70), (255, 255, 255))
    s.text(L - 2.2, 0.75, "Route 111", font(MARKER, 46), (255, 255, 255))
    s.strip()
    s.dust(0.35)
    s.save(name)
    hb = Image.new("RGB", (1024, 160), (245, 245, 245))
    ImageDraw.Draw(hb).text((512, 80), "MKURU", font=font(ANTON, 118), fill=(24, 52, 160), anchor="mm")
    hb.save(os.path.join(OUT, f"{name}_head.png"))


if __name__ == "__main__":
    van("liv_matatu_van", 5.38, 2.28, 2.06, (232, 234, 232), (240, 182, 10), van_plain)
    van("liv_matatu_pimp", 5.3, 1.98, 1.78, (238, 240, 242), None, van_pimp)
    for i in range(3):
        nganya(f"liv_nganya_{i}", i)
    sacco_bus("liv_sacco_bus")
    print("[liveries] written to", OUT)
