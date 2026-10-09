#!/usr/bin/env python
"""Photographic facade tiles for the town kit (owner feedback: buildings looked like cartoons).

Replaces the illustrated upper-floor, glass and house tiles written by tools/paint_facades.py with
crops of real building photographs (ambientCG facades, CC0). Same atlas layout, so the kit's
geometry and UVs are untouched: each tile is exactly one window bay by one floor.

  python tools/paint_facades_photo.py <out_dir>      (run after paint_facades.py)

Sources (blender/textures/_facades/, fetched by tools/fetch-textures.mjs): Facade018A (brick and
window bays), Facade020A (concrete frame), Facade019A (office bays), Facade006 (glass curtain wall).
Shop fronts keep their hand-painted signage (that is what Nairobi shops look like).
"""
import os
import sys

from PIL import Image, ImageEnhance, ImageFilter, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "blender", "textures", "_facades")
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "blender", "cache")
S = 512


def load(name):
    return Image.open(os.path.join(SRC, f"{name}.jpg")).convert("RGB")


def aligned_bay(im, period_x, period_y, frac_x=0.0, frac_y=0.0):
    """One bay x one floor, starting at the brightest wall column/row so the window sits centred.
    The source tiles seamlessly, so crops that cross the edge wrap around."""
    g = ImageOps.grayscale(im)
    w, h = g.size
    px = g.load()
    col = [sum(px[x, y] for y in range(0, h, 3)) for x in range(w)]
    row = [sum(px[x, y] for x in range(0, w, 3)) for y in range(h)]
    pw, ph = int(round(period_x)), int(round(period_y))
    ox = max(range(pw), key=lambda x: sum(col[(x + k * pw) % w] for k in range(w // pw)))
    oy = max(range(ph), key=lambda y: sum(row[(y + k * ph) % h] for k in range(h // ph)))
    ox = int(ox + frac_x * pw) % w
    oy = int(oy + frac_y * ph) % h
    big = Image.new("RGB", (w * 2, h * 2))
    for i in (0, 1):
        for j in (0, 1):
            big.paste(im, (i * w, j * h))
    return big.crop((ox, oy, ox + pw, oy + ph)).resize((S, S), Image.LANCZOS)


def grade(t, warm=1.0, sat=1.0, bright=1.0, dust=0.0):
    t = ImageEnhance.Color(t).enhance(sat)
    t = ImageEnhance.Brightness(t).enhance(bright)
    r, g, b = t.split()
    r = r.point(lambda v: min(255, int(v * warm)))
    b = b.point(lambda v: int(v / warm))
    t = Image.merge("RGB", (r, g, b))
    if dust:
        # Nairobi murram dust settles on the lower part of every bay
        grad = Image.linear_gradient("L").resize((S, S)).point(lambda v: int((v / 255) ** 3 * 255 * dust))
        t = Image.composite(Image.new("RGB", (S, S), (176, 140, 104)), t, grad)
    return t


def window_box(t):
    """Bounding box of the window (its dark frame) in the middle of a bay tile."""
    g = ImageOps.grayscale(t)
    px = g.load()
    xs, ys = [], []
    for y in range(int(S * 0.1), int(S * 0.97), 2):
        for x in range(int(S * 0.08), int(S * 0.92), 2):
            if px[x, y] < 100:
                xs.append(x)
                ys.append(y)
    if not xs:
        return (S // 5, S // 5, 4 * S // 5, 4 * S // 5)
    xs.sort()
    ys.sort()
    k = len(xs) // 50
    x0, y0, x1, y1 = xs[k], ys[k], xs[-1 - k], ys[-1 - k]
    # the top frame bar is the first row that is dark across most of the window width
    for y in range(y0, y1):
        dark = sum(1 for x in range(x0, x1, 3) if px[x, y] < 100)
        if dark > 0.6 * (x1 - x0) / 3:
            y0 = y
            break
    return (x0, y0, x1, y1)


def glassify(t, seed=0, curtain=None):
    """Turn the flat window panes into glass: a sky reflection fading into a dark room, a sun
    streak, sometimes a curtain. Panes = pixels close to the pane colour, inside the window."""
    import random
    from PIL import ImageDraw
    r = random.Random(seed)
    x0, y0, x1, y1 = window_box(t)
    px = t.load()
    samples = [px[int(x0 + (x1 - x0) * f), int(y0 + (y1 - y0) * 0.55)] for f in (0.3, 0.35, 0.65, 0.7)]
    pane = max(samples, key=sum)
    mask = Image.new("L", t.size, 0)
    pm = mask.load()
    for y in range(y0, y1):
        for x in range(x0, x1):
            c = px[x, y]
            if abs(c[0] - pane[0]) + abs(c[1] - pane[1]) + abs(c[2] - pane[2]) < 60:
                pm[x, y] = 255
    mask = mask.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))
    sky = Image.linear_gradient("L").resize((S, S))
    glass = Image.merge("RGB", [sky.point(lambda v, a=a, b=b: int(a + (b - a) * v / 255)) for a, b in ((150, 26), (168, 32), (182, 40))])
    streak = Image.new("L", (S, S), 0)
    xs = r.randint(0, S)
    ImageDraw.Draw(streak).polygon([(xs, 0), (xs + 60, 0), (xs - 140, S), (xs - 200, S)], fill=70)
    glass = Image.composite(Image.new("RGB", (S, S), (235, 240, 245)), glass, streak.filter(ImageFilter.GaussianBlur(18)))
    if curtain:
        cm = Image.new("L", (S, S), 0)
        w = (x1 - x0) // 3
        box = [x0, y0, x0 + w, y1] if r.random() < 0.5 else [x1 - w, y0, x1, y1]
        ImageDraw.Draw(cm).rectangle(box, fill=210)
        glass = Image.composite(Image.new("RGB", (S, S), curtain), glass, cm.filter(ImageFilter.GaussianBlur(5)))
    return Image.composite(glass, t, mask)


def plaster_bay(window_from):
    """Cream painted plaster (real CC0 photo texture) with the framed window pasted in."""
    pl = Image.open(os.path.join(ROOT, "blender", "textures", "PaintedPlaster017", "PaintedPlaster017_1K-JPG_Color.jpg")).convert("RGB").resize((S, S))
    pl = grade(pl, warm=1.08, sat=0.7, bright=1.18)
    x0, y0, x1, y1 = window_box(window_from)
    win = window_from.crop((x0, y0, x1, y1))
    shadow = Image.new("L", (S, S), 0)
    from PIL import ImageDraw
    ImageDraw.Draw(shadow).rectangle([x0 + 4, y0 + 6, x1 + 6, y1 + 10], fill=90)
    pl = Image.composite(Image.new("RGB", (S, S), (70, 62, 52)), pl, shadow.filter(ImageFilter.GaussianBlur(5)))
    pl.paste(win, (x0, y0))
    return pl


def floor_band(t, colour=(150, 146, 138)):
    """A concrete slab edge at the bottom of each floor (reads as storeys from afar)."""
    band = Image.new("RGB", (S, 18), colour)
    t.paste(band, (0, S - 18))
    return t


def upper():
    brick = load("Facade018A")
    frame = load("Facade020A")
    office = load("Facade019A")
    atlas = Image.new("RGB", (S * 2, S * 2))
    # 0: brick walk-up flat bay (Eastlands look)
    b0 = glassify(aligned_bay(brick, 1024 / 6, 1024 / 6), 1, curtain=(150, 40, 40))
    atlas.paste(floor_band(grade(b0, warm=1.05, dust=0.25)), (0, 0))
    # 1: painted concrete frame with a big window (balcony bay)
    b1 = glassify(aligned_bay(frame, 1024 / 6, 1024 / 6, frac_x=0.5), 2, curtain=(60, 90, 150))
    atlas.paste(floor_band(grade(b1, warm=1.08, sat=0.9, bright=1.08, dust=0.2), (170, 164, 152)), (S, 0))
    # 2: office bay (concrete and glazing)
    atlas.paste(floor_band(grade(glassify(aligned_bay(office, 1024 / 6, 1024 / 6), 3), warm=1.02, dust=0.12), (120, 120, 118)), (0, S))
    # 3: cream painted plaster with a window (the most common Nairobi flat)
    b3 = plaster_bay(glassify(aligned_bay(brick, 1024 / 6, 1024 / 6), 4, curtain=(200, 170, 60)))
    atlas.paste(floor_band(grade(b3, warm=1.02, dust=0.3), (196, 188, 172)), (S, S))
    atlas.save(os.path.join(OUT, "fac_upper.png"))


def glass():
    """Curtain wall: the office bay's frame, panes glassified with a stronger sky reflection."""
    office = load("Facade006")
    t = office.crop((0, 0, 146, 128)).resize((S, S), Image.LANCZOS)
    g = ImageOps.grayscale(t)
    frame = g.point(lambda v: 255 if v > 175 else 0).filter(ImageFilter.MaxFilter(3))
    sky = Image.linear_gradient("L").resize((S, S))
    glass = Image.merge("RGB", [sky.point(lambda v, a=a, b=b: int(a + (b - a) * v / 255)) for a, b in ((176, 44), (196, 58), (210, 70))])
    from PIL import ImageDraw
    cloud = Image.new("L", (S, S), 0)
    d = ImageDraw.Draw(cloud)
    for cx, cy, r in ((120, 90, 70), (210, 120, 60), (380, 70, 90)):
        d.ellipse([cx - r, cy - r // 2, cx + r, cy + r // 2], fill=110)
    glass = Image.composite(Image.new("RGB", (S, S), (236, 240, 244)), glass, cloud.filter(ImageFilter.GaussianBlur(22)))
    t = Image.composite(Image.new("RGB", (S, S), (78, 84, 90)), glass, frame)
    t.save(os.path.join(OUT, "fac_glass.png"))


def house():
    brick = load("Facade018A")
    t = grade(plaster_bay(glassify(aligned_bay(brick, 1024 / 6, 1024 / 6), 5, curtain=(180, 140, 90))), warm=1.06, dust=0.35)
    plinth = Image.new("RGB", (S, 60), (150, 128, 100))
    t.paste(plinth, (0, S - 60))
    t.save(os.path.join(OUT, "fac_house.png"))


if __name__ == "__main__":
    upper()
    glass()
    house()
    print("[facades] photographic tiles written to", OUT)
