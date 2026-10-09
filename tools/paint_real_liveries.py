#!/usr/bin/env python
"""Airbrushed liveries for the real (Sketchfab) matatus and nganyas.

  python tools/paint_real_liveries.py <out_dir>

Image space = one vehicle side, front at the left edge, roof at the top (blender/scripts/build_real_kit.py
projects it onto both flanks, mirrored on the right side so lettering always reads forwards).
Look: glossy automotive airbrush (deep gradients, light streaks, chrome lettering with bevel and
drop shadow), the NTSA yellow band, original slogans only. No cartoon faces, no real Saccos or brands.
"""
import math
import os
import random
import sys

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONTS = os.path.join(ROOT, "blender", "fonts")
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "blender", "cache", "real")
os.makedirs(OUT, exist_ok=True)
W, H = 2048, 1024


def font(name, size):
    return ImageFont.truetype(os.path.join(FONTS, name), size)


def vgrad(top, bottom):
    g = Image.linear_gradient("L").resize((W, H))
    return Image.composite(Image.new("RGB", (W, H), bottom), Image.new("RGB", (W, H), top), g)


def glow_stroke(im, pts, col, width, blur):
    layer = Image.new("RGB", (W, H), (0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.line(pts, fill=col, width=width, joint="curve")
    soft = layer.filter(ImageFilter.GaussianBlur(blur))
    core = layer.filter(ImageFilter.GaussianBlur(1.2))
    return ImageChops.add(ImageChops.add(im, soft), core)


def wave(y0, amp, freq, phase, x0=0, x1=W):
    return [(x, y0 + amp * math.sin(x / W * freq * math.tau + phase)) for x in range(x0, x1 + 1, 16)]


def chrome_text(im, xy, text, fnt, top=(255, 238, 170), bottom=(196, 120, 10), anchor="mm", tilt=0):
    """Gradient-filled lettering with dark outline, highlight bevel and a soft drop shadow."""
    mask = Image.new("L", (W, H), 0)
    ImageDraw.Draw(mask).text(xy, text, font=fnt, fill=255, anchor=anchor)
    if tilt:
        mask = mask.transform((W, H), Image.AFFINE, (1, tilt, -tilt * xy[1], 0, 1, 0), resample=Image.BICUBIC)
    shadow = mask.filter(ImageFilter.GaussianBlur(10))
    im.paste((0, 0, 0), (10, 14), shadow.point(lambda v: int(v * 0.75)))
    outline = mask.filter(ImageFilter.MaxFilter(13))
    im.paste((15, 10, 20), (0, 0), outline)
    bbox = mask.getbbox() or (0, 0, W, H)
    g = Image.new("RGB", (W, H), bottom)
    h = max(1, bbox[3] - bbox[1])
    grad = Image.linear_gradient("L").resize((W, h))
    band = Image.composite(Image.new("RGB", (W, h), bottom), Image.new("RGB", (W, h), top), grad)
    g.paste(band, (0, bbox[1]))
    im.paste(g, (0, 0), mask)
    # bevel highlight: mask minus itself shifted down-right
    hi = ImageChops.subtract(mask, ImageChops.offset(mask, 3, 4)).filter(ImageFilter.GaussianBlur(1))
    im.paste((255, 255, 255), (0, 0), hi.point(lambda v: int(v * 0.8)))


def sparkle(im, n, seed):
    r = random.Random(seed)
    layer = Image.new("RGB", (W, H), (0, 0, 0))
    d = ImageDraw.Draw(layer)
    for _ in range(n):
        x, y = r.randrange(W), r.randrange(int(H * 0.08), int(H * 0.5))
        s = r.choice((2, 2, 3, 5))
        d.ellipse([x - s, y - s, x + s, y + s], fill=(255, 255, 255))
    return ImageChops.add(im, layer.filter(ImageFilter.GaussianBlur(1.5)))


def gloss(im):
    """Clear-coat: a soft horizontal sky reflection band and a darker rocker panel."""
    hl = Image.linear_gradient("L").resize((W, H)).point(lambda v: int(70 * math.exp(-((v / 255 - 0.33) / 0.07) ** 2)))
    im = Image.composite(Image.new("RGB", (W, H), (255, 255, 255)), im, hl)
    dark = Image.linear_gradient("L").resize((W, H)).point(lambda v: int(150 * max(0.0, (v / 255 - 0.82) / 0.18)))
    return Image.composite(Image.new("RGB", (W, H), (8, 8, 10)), im, dark)


def yellow_band(im, y=0.47, h=0.022):
    ImageDraw.Draw(im).rectangle([0, int(H * y), W, int(H * (y + h))], fill=(250, 198, 20))


def dust(im, amount=0.22):
    m = Image.linear_gradient("L").resize((W, H)).point(lambda v: int((v / 255) ** 6 * 255 * amount))
    return Image.composite(Image.new("RGB", (W, H), (150, 110, 80)), im, m)


def nganya(idx):
    pal = [
        ((12, 10, 26), (60, 8, 70), [(255, 40, 140), (40, 200, 255), (255, 200, 20)], "MKURUGENZI", "MAISHA NI STORY", (255, 236, 160), (210, 110, 10)),
        ((4, 18, 30), (6, 70, 90), [(20, 240, 200), (255, 120, 20), (240, 240, 255)], "UTAFRAAAIA", "I GOT YOU, WAKURUGENZI", (230, 255, 250), (20, 150, 170)),
        ((30, 4, 6), (120, 10, 14), [(255, 210, 40), (255, 90, 30), (255, 255, 255)], "WAKURUGENZI", "YOUNG & STUPID EXPRESS", (255, 250, 220), (230, 150, 20)),
    ][idx]
    top, bottom, cols, word, slogan, ctop, cbot = pal
    im = vgrad(top, bottom)
    r = random.Random(idx * 7 + 1)
    for k, c in enumerate(cols * 2):
        pts = wave(H * (0.52 + 0.1 * r.random()), 30 + 60 * r.random(), 0.6 + r.random(), r.random() * 6)
        im = glow_stroke(im, pts, c, 6 + 6 * (k % 2), 18)
    im = sparkle(im, 220, idx)
    yellow_band(im)
    chrome_text(im, (W * 0.5, H * 0.66), word, font("Anton-Regular.ttf", 230), ctop, cbot, tilt=-0.18)
    chrome_text(im, (W * 0.52, H * 0.82), slogan, font("PermanentMarker-Regular.ttf", 74), (255, 255, 255), (190, 190, 200), tilt=-0.12)
    d = ImageDraw.Draw(im)
    # route and destination board on the flank above the windows
    d.text((W * 0.08, H * 0.06), "46  TAO • MTAA • KIBERA", font=font("BebasNeue-Regular.ttf", 64), fill=(255, 230, 120))
    d.text((W * 0.92, H * 0.92), f"KDM {311 + idx * 47}{'MKG'[idx]}", font=font("BebasNeue-Regular.ttf", 46), fill=(220, 220, 220), anchor="rm")
    im = gloss(im)
    im = dust(im)
    im.save(os.path.join(OUT, f"rliv_nganya_{idx}.png"))


def matatu(idx):
    """NTSA white van with the yellow band and hand-lettered route (a few are black 'pimped')."""
    pimped = idx == 2
    im = vgrad((26, 26, 30), (6, 6, 8)) if pimped else vgrad((236, 236, 232), (206, 206, 200))
    d = ImageDraw.Draw(im)
    if pimped:
        for c in ((255, 40, 140), (40, 200, 255)):
            im = glow_stroke(im, wave(H * 0.6, 40, 1.1, idx + (c[0] > 100)), c, 8, 16)
        chrome_text(im, (W * 0.52, H * 0.64), "STORY TIME", font("Anton-Regular.ttf", 190), tilt=-0.15)
        d = ImageDraw.Draw(im)
    else:
        yellow_band(im, 0.5, 0.04)
        d.text((W * 0.5, H * 0.62), "MKURUGENZI SHUTTLE  •  ROUTE 46", font=font("BebasNeue-Regular.ttf", 92), fill=(30, 30, 34), anchor="mm")
        d.text((W * 0.5, H * 0.72), "TAO  –  MTAA  –  KIBERA  –  FREDDIE'S", font=font("BebasNeue-Regular.ttf", 64), fill=(160, 20, 30), anchor="mm")
    d.text((W * 0.9, H * 0.9), "14 PASS.", font=font("BebasNeue-Regular.ttf", 44), fill=(200, 200, 200) if pimped else (60, 60, 60), anchor="rm")
    im = gloss(im)
    im = dust(im, 0.3)
    im.save(os.path.join(OUT, f"rliv_matatu_{idx}.png"))


def bus(idx):
    """A Sacco city bus: two-tone body, a sweep, the operator name (fictional) and the route."""
    top, low, sweep, name = [((236, 236, 230), (176, 20, 30), (250, 198, 20), "MKURUGENZI SACCO"),
                             ((236, 236, 230), (20, 70, 160), (60, 190, 230), "WAKURUGENZI LINE")][idx]
    im = vgrad(top, top)
    d = ImageDraw.Draw(im)
    d.rectangle([0, int(H * 0.55), W, H], fill=low)
    d.polygon([(0, int(H * 0.55)), (W * 0.55, int(H * 0.55)), (W * 0.8, int(H * 0.38)), (W, int(H * 0.38)), (W, int(H * 0.45)), (W * 0.82, int(H * 0.45)), (W * 0.58, int(H * 0.62)), (0, int(H * 0.62))], fill=sweep)
    d.text((W * 0.5, H * 0.75), name, font=font("Anton-Regular.ttf", 120), fill=(255, 255, 255), anchor="mm")
    d.text((W * 0.5, H * 0.9), "ROUTE 33  ·  STAGE  -  CBD  -  EXPRESSWAY", font=font("BebasNeue-Regular.ttf", 58), fill=(255, 240, 200), anchor="mm")
    im = gloss(im)
    im = dust(im, 0.3)
    im.save(os.path.join(OUT, f"rliv_bus_{idx}.png"))


for i in range(3):
    nganya(i)
    matatu(i)
for i in range(2):
    bus(i)
print("[liveries] written to", OUT)
