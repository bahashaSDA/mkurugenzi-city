"""Vehicles kit (owner photos): matatu 14-seater van (white, yellow waist stripe), pimped nganya
minibus (full graffiti, tinted glass, chrome, LED underglow, roof rack, screens and speakers),
plain sacco bus (red/blue), and a private saloon car. All right-hand drive with the passenger
door on the LEFT (Kenya). Real dimensions:
  matatu_van  5.38 x 1.88 x 2.28 m  (Hiace-class high roof)
  nganya      7.6  x 2.3  x 3.0  m  (Isuzu NQR-class 33-seater)
  sacco_bus   8.2  x 2.35 x 3.0  m
  car_saloon  4.3  x 1.7  x 1.5  m
Liveries are original procedural artwork (no real Sacco names, brands or celebrity faces, SPEC 2.5).
Vehicle forward = -Y in Blender (+Z in three.js). Seat anchors are mirrored in src/systems/vehicles/specs.ts.
"""
import math
import os
import random
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from kitlib import *  # noqa: E402,F401,F403
from kitlib import M, PIECES, ROOT  # noqa: E402

GEN = os.path.join(ROOT, "blender", "cache")
os.makedirs(GEN, exist_ok=True)

GLASS = pbr("vehicle_glass_tint", color=(0.04, 0.05, 0.06), rough=0.06, metal=0.1)  # runtime: semi-transparent
TYRE = M["rubber"]
CHROME = pbr("chrome", color=(0.9, 0.9, 0.92), rough=0.12, metal=1.0)
STEEL_RIM = pbr("rim_steel", color=(0.55, 0.55, 0.56), rough=0.35, metal=0.9)
BLACK = pbr("trim_black", color=(0.02, 0.02, 0.02), rough=0.6, metal=0.0)
HEAD = pbr("headlight_glow", color=(1.0, 0.97, 0.88), rough=0.1, metal=0.0)
TAIL = pbr("taillight_glow", color=(0.9, 0.03, 0.02), rough=0.2, metal=0.0)
SEAT = pbr("seat_fabric", color=(0.06, 0.06, 0.07), rough=0.9, metal=0.0)
SEAT_RED = pbr("seat_red", color=(0.35, 0.02, 0.03), rough=0.75, metal=0.0)
LED = pbr("led_glow", color=(0.75, 0.15, 1.0), rough=0.3, metal=0.0)
LED_BLUE = pbr("led_blue_glow", color=(0.1, 0.5, 1.0), rough=0.3, metal=0.0)
SCREEN = pbr("screen_glow", color=(0.25, 0.55, 0.95), rough=0.2, metal=0.0)
DASH = pbr("dashboard", color=(0.05, 0.05, 0.05), rough=0.7, metal=0.0)
FLOOR = pbr("vehicle_floor", color=(0.12, 0.12, 0.12), rough=0.9, metal=0.0)
PLATE_F = pbr("plate_white", color=(0.92, 0.92, 0.9), rough=0.5, metal=0.0)
PLATE_R = pbr("plate_yellow", color=(0.95, 0.75, 0.05), rough=0.5, metal=0.0)
INK = pbr("plate_ink", color=(0.02, 0.02, 0.02), rough=0.6, metal=0.0)


# ----------------------------------------------------------------------------- livery painting
def _font_mask(text, w, h):
    """Rasterise text with Blender's font into a numpy mask (render a text object orthographically)."""
    from PIL import Image  # noqa: F401  (Pillow is bundled? fall back below)


def livery_image(name, w, h, painter):
    path = os.path.join(GEN, f"{name}.png")
    img = np.zeros((h, w, 3), dtype=np.float32)
    painter(img)
    im = bpy.data.images.new(name, w, h)
    px = np.ones((h, w, 4), dtype=np.float32)
    px[..., :3] = img[::-1]  # top-down painter -> Blender bottom-up
    im.pixels.foreach_set(px.ravel())
    im.filepath_raw = path
    im.file_format = "PNG"
    im.save()
    return im


def livery_material(name, img, rough=0.35, metal=0.15):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = img
    b = nt.nodes["Principled BSDF"]
    nt.links.new(t.outputs["Color"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    return mat


def paint_rect(img, x0, y0, x1, y1, col):
    h, w, _ = img.shape
    img[int(y0 * h):int(y1 * h), int(x0 * w):int(x1 * w)] = col


def paint_matatu_white(img):
    """White van, yellow waist stripe with small gaps (owner photos 12/14), faint dust at the sill."""
    img[:] = (0.86, 0.87, 0.86)
    paint_rect(img, 0.0, 0.58, 1.0, 0.66, (0.95, 0.7, 0.04))
    for gx in np.linspace(0.08, 0.92, 6):
        paint_rect(img, gx, 0.58, gx + 0.012, 0.66, (0.86, 0.87, 0.86))
    h = img.shape[0]
    dust = np.linspace(0, 1, h)[:, None] ** 6
    img[:] = img * (1 - dust[..., None] * 0.35) + np.array([0.55, 0.38, 0.27]) * dust[..., None] * 0.35


def paint_bus_red(img):
    """Red sacco bus with a blue lower band and white pinstripe (owner photo 10)."""
    img[:] = (0.62, 0.04, 0.05)
    paint_rect(img, 0.0, 0.72, 1.0, 1.0, (0.05, 0.12, 0.45))
    paint_rect(img, 0.0, 0.70, 1.0, 0.72, (0.95, 0.95, 0.95))


def paint_nganya(img, seed):
    """Original graffiti livery: deep base, neon gradient sweeps, splatter, stars, bold slogans."""
    rng = np.random.default_rng(seed)
    h, w, _ = img.shape
    yy, xx = np.mgrid[0:h, 0:w]
    base = np.array(((0.03, 0.03, 0.04), (0.35, 0.0, 0.05), (0.02, 0.05, 0.25))[seed % 3])
    img[:] = base
    for _ in range(6):  # neon sweeps
        c = rng.choice([(1.0, 0.1, 0.5), (0.1, 0.8, 1.0), (1.0, 0.75, 0.05), (0.6, 1.0, 0.1), (0.8, 0.2, 1.0)])
        cy, amp, fq, th = rng.uniform(0.2, 0.8) * h, rng.uniform(10, 60), rng.uniform(0.004, 0.02), rng.uniform(6, 22)
        band = np.abs(yy - (cy + amp * np.sin(xx * fq + rng.uniform(0, 6)))) < th
        img[band] = img[band] * 0.2 + np.array(c) * 0.8
    for _ in range(900):  # paint splatter
        x, y, r = rng.integers(0, w), rng.integers(0, h), rng.integers(2, 7)
        m = (xx - x) ** 2 + (yy - y) ** 2 < r * r
        img[m] = rng.choice([(1, 1, 1), (1.0, 0.8, 0.0), (0.0, 0.9, 1.0), (1.0, 0.1, 0.5)])
    for _ in range(25):  # stars
        x, y, r = rng.integers(0, w), rng.integers(0, h // 2), rng.integers(6, 14)
        ang = np.arctan2(yy - y, xx - x)
        rad = np.hypot(xx - x, yy - y)
        m = rad < r * (0.55 + 0.45 * np.cos(5 * ang)) ** 2
        img[m] = (1.0, 0.95, 0.4)
    # yellow waist line required on matatus
    paint_rect(img, 0.0, 0.62, 1.0, 0.655, (1.0, 0.8, 0.05))


def text_texture_overlay(img, text, x, y, size_px, col, w_frac):
    """Draw big block letters using Blender's font rendered to a mask (pure numpy fallback:
    simple 5x7 bitmap font, scaled) so the script needs no extra Python packages."""
    FONT = {
        "A": ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
        "B": ["11110", "10001", "11110", "10001", "10001", "10001", "11110"],
        "D": ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
        "E": ["11111", "10000", "11110", "10000", "10000", "10000", "11111"],
        "F": ["11111", "10000", "11110", "10000", "10000", "10000", "10000"],
        "G": ["01111", "10000", "10000", "10111", "10001", "10001", "01111"],
        "I": ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
        "K": ["10001", "10010", "11100", "10010", "10001", "10001", "10001"],
        "L": ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
        "M": ["10001", "11011", "10101", "10001", "10001", "10001", "10001"],
        "N": ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
        "O": ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
        "R": ["11110", "10001", "11110", "10100", "10010", "10001", "10001"],
        "S": ["01111", "10000", "01110", "00001", "00001", "10001", "01110"],
        "T": ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
        "U": ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
        "V": ["10001", "10001", "10001", "10001", "01010", "01010", "00100"],
        "W": ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
        "Y": ["10001", "01010", "00100", "00100", "00100", "00100", "00100"],
        "Z": ["11111", "00010", "00100", "01000", "10000", "10000", "11111"],
        "4": ["10010", "10010", "10010", "11111", "00010", "00010", "00010"],
        "6": ["01110", "10000", "11110", "10001", "10001", "10001", "01110"],
        "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
        "8": ["01110", "10001", "01110", "10001", "10001", "10001", "01110"],
        "'": ["00100", "00100", "00000", "00000", "00000", "00000", "00000"],
        " ": ["00000"] * 7,
    }
    h, w, _ = img.shape
    cell = size_px / 7
    x0 = int(x * w)
    y0 = int(y * h)
    for ch in text:
        glyph = FONT.get(ch, FONT[" "])
        for r, line in enumerate(glyph):
            for c, bit in enumerate(line):
                if bit == "1":
                    img[int(y0 + r * cell):int(y0 + (r + 1) * cell), int(x0 + c * cell * w_frac):int(x0 + (c + 1) * cell * w_frac)] = col
        x0 += int(6 * cell * w_frac)


# ----------------------------------------------------------------------------- body building
def side_uv(bm, L, H):
    """UVs: side faces project (y, z) across the livery; other faces get a small patch."""
    uv = bm.loops.layers.uv.verify()
    bm.normal_update()
    for f in bm.faces:
        n = f.normal
        for l in f.loops:
            co = l.vert.co
            if abs(n.x) > 0.6:
                # livery reads left-to-right for a viewer standing beside either side
                u = (co.y + L / 2) / L
                l[uv].uv = (u if n.x > 0 else 1 - u, co.z / H)
            else:
                l[uv].uv = (0.5 + co.x * 0.05, co.z / H)


def body_shell(bm, L, W, H, nose, wind, sill, mat):
    """Van/bus shell: box with a raked windscreen and rounded vertical edges."""
    sh = bmesh.new()
    bmesh.ops.create_cube(sh, size=1.0)
    bmesh.ops.scale(sh, vec=(W, L, H - sill), verts=sh.verts)
    bmesh.ops.translate(sh, vec=(0, 0, sill + (H - sill) / 2), verts=sh.verts)
    for v in sh.verts:  # rake the top-front edge back to form the windscreen slope
        if v.co.y < 0 and v.co.z > H - 0.01:
            v.co.y += wind
    bmesh.ops.bevel(sh, geom=[e for e in sh.edges if abs((e.verts[0].co - e.verts[1].co).normalized().z) > 0.9],
                    offset=0.09, segments=3, affect="EDGES")
    if nose:  # short bonnet in front of the windscreen (vans)
        add_box(sh, (W * 0.96, nose, 0.55), (0, -L / 2 - nose / 2 + 0.02, sill + 0.5), 0)
    for f in sh.faces:
        f.material_index = mat
    tmp = bpy.data.meshes.new("t")
    sh.to_mesh(tmp)
    sh.free()
    bm.from_mesh(tmp)
    bpy.data.meshes.remove(tmp)


def wheel(bm, x, y, r, w, tyre_idx, rim_idx, sides=18):
    t = bmesh.new()
    bmesh.ops.create_cone(t, cap_ends=True, segments=sides, radius1=r, radius2=r, depth=w)
    tmp = bpy.data.meshes.new("t")
    t.to_mesh(tmp)
    t.free()
    tmp.transform(Matrix.Translation((x, y, r)) @ Matrix.Rotation(math.pi / 2, 4, "Y"))
    for p in tmp.polygons:
        p.material_index = tyre_idx
    bm.from_mesh(tmp)
    bpy.data.meshes.remove(tmp)
    rb = bmesh.new()
    bmesh.ops.create_cone(rb, cap_ends=True, segments=sides, radius1=r * 0.62, radius2=r * 0.62, depth=0.02)
    sgn = 1 if x > 0 else -1
    merge_bm(bm, rb, Matrix.Translation((x + sgn * (w / 2 + 0.005), y, r)) @ Matrix.Rotation(math.pi / 2, 4, "Y"), rim_idx)


def plate(bm, y, z, front, mi_plate, mi_ink, text):
    add_box(bm, (0.52, 0.02, 0.12), (0, y, z), mi_plate)
    t = text_mesh(text, 0.07, depth=0.003, resolution=1)
    sgn = -1 if front else 1
    merge_bm(bm, t, Matrix.Translation((0, y + sgn * 0.013, z)) @ Matrix.Rotation(math.pi / 2 * (1 if front else -1), 4, "X")
             @ (Matrix.Rotation(math.pi, 4, "Z") if not front else Matrix.Identity(4)), mi_ink)


def vehicle(name, lod, kind):
    random.seed(hash(name) & 0xFFFF)
    spec = {
        "matatu_van": dict(L=5.38, W=1.88, H=2.28, nose=0.45, wind=0.55, sill=0.32, r=0.33, wheelbase=3.1, rows=4, aisle=False),
        "nganya": dict(L=7.6, W=2.3, H=3.0, nose=0.0, wind=0.25, sill=0.55, r=0.45, wheelbase=4.2, rows=8, aisle=True),
        "sacco_bus": dict(L=8.2, W=2.35, H=3.0, nose=0.0, wind=0.25, sill=0.55, r=0.45, wheelbase=4.5, rows=9, aisle=True),
        "car_saloon": dict(L=4.3, W=1.7, H=1.48, nose=0.0, wind=0.0, sill=0.3, r=0.31, wheelbase=2.55, rows=2, aisle=False),
    }[kind]
    L, W, H, sill, r = spec["L"], spec["W"], spec["H"], spec["sill"], spec["r"]
    # livery
    if kind == "matatu_van":
        img = livery_image(f"liv_{name}", 1024, 512, paint_matatu_white)
    elif kind == "sacco_bus":
        def p(i):
            paint_bus_red(i)
            text_texture_overlay(i, "MKURU MOVERS", 0.18, 0.18, 60, (0.97, 0.97, 0.97), 0.45)
        img = livery_image(f"liv_{name}", 1024, 512, p)
    elif kind == "car_saloon":
        col = random.choice([(0.75, 0.75, 0.76), (0.86, 0.86, 0.85), (0.08, 0.08, 0.1), (0.35, 0.05, 0.05), (0.2, 0.25, 0.32)])
        img = livery_image(f"liv_{name}", 64, 64, lambda i: i.__setitem__(slice(None), col))
    else:
        def p(i):
            paint_nganya(i, seed=len(name))
            text_texture_overlay(i, "MKURUGENZI", 0.12, 0.2, 70, (1.0, 0.85, 0.1), 0.42)
            text_texture_overlay(i, "UTAFRAAAIA", 0.2, 0.72, 42, (1.0, 1.0, 1.0), 0.38)
        img = livery_image(f"liv_{name}", 2048, 1024, p)
    body = livery_material(f"body_{name}", img, rough=0.3 if kind != "car_saloon" else 0.25, metal=0.25)
    mats = [body, GLASS, TYRE, CHROME if kind == "nganya" else STEEL_RIM, BLACK, HEAD, TAIL, SEAT_RED if kind == "nganya" else SEAT,
            LED, SCREEN, DASH, FLOOR, PLATE_F, PLATE_R, INK, LED_BLUE]
    BODY, GL, TY, RIM, BK, HL, TL, ST, LD, SC, DS, FL, PF, PR, IK, LB = range(16)
    bm = bmesh.new()
    body_shell(bm, L, W, H, spec["nose"], spec["wind"], sill, BODY)
    # windows: side band + windscreen + rear
    win_lo, win_hi = sill + (H - sill) * 0.52, H - 0.12
    if kind == "car_saloon":
        win_lo, win_hi = sill + (H - sill) * 0.55, H - 0.05
    for sx in (-1, 1):
        add_box(bm, (0.02, L * 0.78, win_hi - win_lo), (sx * (W / 2 + 0.006), 0.05 * L, (win_lo + win_hi) / 2), GL)
    ws = bmesh.new()
    add_box(ws, (W * 0.88, 0.02, (win_hi - win_lo) * 1.1), (0, 0, 0), GL)
    merge_bm(bm, ws, Matrix.Translation((0, -L / 2 + spec["wind"] * 0.5 - 0.01, (win_lo + win_hi) / 2))
             @ Matrix.Rotation(-math.atan2(spec["wind"], H - win_lo) if spec["wind"] else 0, 4, "X"), GL)
    add_box(bm, (W * 0.82, 0.02, (win_hi - win_lo) * 0.85), (0, L / 2 + 0.005, (win_lo + win_hi) / 2), GL)
    # wheels (track inside the body width), arches as black trims
    wb = spec["wheelbase"]
    for y in (-wb / 2 - 0.1, wb / 2 - 0.1):
        for sx in (-1, 1):
            wheel(bm, sx * (W / 2 - 0.12), y, r, 0.24 if kind != "car_saloon" else 0.2, TY, RIM, sides=(18, 12, 8)[lod])
            add_box(bm, (0.04, r * 2.3, 0.08), (sx * (W / 2 + 0.01), y, r * 2 + 0.02), BK)
    if kind in ("nganya", "sacco_bus"):  # rear duals
        for sx in (-1, 1):
            wheel(bm, sx * (W / 2 - 0.36), wb / 2 - 0.1, r, 0.22, TY, RIM, sides=(18, 12, 8)[lod])
    # lights, bumpers, plates
    for sx in (-1, 1):
        add_box(bm, (0.3, 0.04, 0.16), (sx * (W / 2 - 0.25), -L / 2 - spec["nose"] - 0.01, sill + 0.45), HL)
        add_box(bm, (0.12, 0.04, 0.35), (sx * (W / 2 - 0.12), L / 2 + 0.01, sill + 0.55), TL)
    add_box(bm, (W + 0.04, 0.12, 0.22), (0, -L / 2 - spec["nose"] - 0.03, sill + 0.15), RIM if kind == "nganya" else BK)
    add_box(bm, (W + 0.04, 0.12, 0.22), (0, L / 2 + 0.03, sill + 0.15), BK)
    if lod == 0:
        plate(bm, -L / 2 - spec["nose"] - 0.1, sill + 0.15, True, PF, IK, "KMK 254M")
        plate(bm, L / 2 + 0.1, sill + 0.15, False, PR, IK, "KMK 254M")
        # mirrors
        for sx in (-1, 1):
            add_box(bm, (0.04, 0.12, 0.22), (sx * (W / 2 + 0.18), -L / 2 + spec["wind"] + 0.1, win_lo + 0.1), BK)
    if kind == "matatu_van" and lod == 0:  # black/white chequered rear (owner photo 14)
        for i in range(6):
            add_box(bm, (0.12, 0.02, 0.2), (-0.7 + i * 0.28, L / 2 + 0.04, sill + 0.55), BK if i % 2 else PF)
    if kind == "nganya":
        add_box(bm, (W * 0.9, L * 0.55, 0.06), (0, 0.2, H + 0.12), RIM)  # roof rack (chrome)
        for x in (-W * 0.42, W * 0.42):
            add_box(bm, (0.04, L * 0.55, 0.12), (x, 0.2, H + 0.06), RIM)
        add_box(bm, (W * 0.95, L * 0.92, 0.03), (0, 0, sill - 0.03), LD)  # LED underglow strip
        add_box(bm, (W * 0.9, 0.3, 0.08), (0, L / 2 - 0.1, H + 0.05), BK)  # spoiler
    # interior (LOD0 only): floor, seats, dashboard, steering wheel on the RIGHT, LEDs, screens, speakers
    if lod == 0:
        add_box(bm, (W - 0.15, L - 0.6, 0.05), (0, 0.1, sill + 0.05), FL)
        add_box(bm, (W - 0.2, 0.35, 0.35), (0, -L / 2 + spec["wind"] + 0.45, win_lo - 0.1), DS)
        swb = bmesh.new()
        bmesh.ops.create_cone(swb, cap_ends=False, segments=12, radius1=0.19, radius2=0.19, depth=0.03)
        # right-hand drive: steering wheel on the right (Blender -X)
        merge_bm(bm, swb, Matrix.Translation((-(W / 2 - 0.45), -L / 2 + spec["wind"] + 0.75, win_lo + 0.05)) @ Matrix.Rotation(1.1, 4, "X"), BK)
        for seat in SEATS[kind]:
            sx, sy = seat
            add_box(bm, (0.44, 0.44, 0.1), (sx, sy, sill + 0.45), ST)
            add_box(bm, (0.44, 0.08, 0.55), (sx, sy + 0.22, sill + 0.75), ST)
        if kind in ("nganya", "matatu_van"):
            add_box(bm, (0.03, L * 0.8, 0.02), (-W / 2 + 0.12, 0.1, H - 0.18), LD if kind == "nganya" else LB)
            add_box(bm, (0.03, L * 0.8, 0.02), (W / 2 - 0.12, 0.1, H - 0.18), LD if kind == "nganya" else LB)
        if kind == "nganya":
            for y in (-L / 2 + 1.4, 0.0, L / 2 - 1.6):
                add_box(bm, (0.9, 0.05, 0.5), (0, y, H - 0.42), SC)  # TV screens
            for sx in (-1, 1):
                for y in (-1.5, 0.5, 2.5):
                    sp = bmesh.new()
                    bmesh.ops.create_cone(sp, cap_ends=True, segments=10, radius1=0.12, radius2=0.12, depth=0.05)
                    merge_bm(bm, sp, Matrix.Translation((sx * (W / 2 - 0.08), y, H - 0.5)) @ Matrix.Rotation(math.pi / 2, 4, "Y"), BK)
    side_uv(bm, L, H)
    ob = new_obj(name, bm, mats)
    paint_grime(ob, dust_height=0.55, strength=0.35)
    return ob


# seat anchors (x, y) in Blender space; mirrored in src/systems/vehicles/specs.ts
SEATS = {
    "matatu_van": [(x, y) for y in (-0.55, 0.35, 1.25, 2.1) for x in (-0.55, 0.0, 0.55)][:12] + [(-0.45, -1.45)],
    "nganya": [(x, -2.6 + 0.75 * i) for i in range(8) for x in (-0.75, -0.3, 0.55)],
    "sacco_bus": [(x, -2.9 + 0.75 * i) for i in range(9) for x in (-0.75, -0.3, 0.55)],
    "car_saloon": [(-0.38, -0.2), (0.38, -0.2), (-0.38, 0.75), (0.38, 0.75)],
}


def _box_col(L, W, H, nose=0.0):
    return lambda ob: [((0, -nose / 2, H / 2), (W, L + nose, H))]


for kind, (L, W, H, nose) in {"matatu_van": (5.38, 1.88, 2.28, 0.45), "nganya": (7.6, 2.3, 3.0, 0.0),
                              "sacco_bus": (8.2, 2.35, 3.0, 0.0), "car_saloon": (4.3, 1.7, 1.48, 0.0)}.items():
    variants = 3 if kind in ("nganya", "car_saloon") else 1
    for vi in range(variants):
        nm = kind if variants == 1 else f"{kind}_{vi}"
        built = []
        for lod in range(3):
            ob = vehicle(nm, lod, kind)
            ob.name = f"{nm}_LOD{lod}"
            built.append(ob)
        PIECES[nm] = (built[0], _box_col(L, W, H, nose), built[1:])


def _shots(shot, x):
    for nm in ("matatu_van", "nganya_0", "sacco_bus"):
        vx = PIECES[nm][0].location.x
        shot(f"veh_{nm}.png", (vx - 7, -6.5, 2.2), (vx, 0, 1.3))


finish("vehicles_kit.glb", _shots)
