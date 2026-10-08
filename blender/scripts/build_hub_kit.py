"""Mtaa wa Mkurugenzi hub kit: realistic, real-scale pieces built from
research/references/hub-mtaa-wa-mkurugenzi.md, exported as ONE GLB so every piece
shares the same textures and materials (SPEC 5.1 "many buildings share one material").

Usage:
  node tools/fetch-textures.mjs           # CC0 PBR sources (ambientCG)
  blender -b --factory-startup -P blender/scripts/build_hub_kit.py -- --out public/models/raw [--preview blender/previews]

Each piece P is exported as nodes P_LOD0, P_LOD1, P_LOD2 and COL_P (box/hull) at the origin,
ground at z=0. Blender is Z-up; the glTF exporter converts to Y-up.
Weathering (red murram dust at wall bases, grime) is painted into vertex colours (COLOR_0),
which three.js multiplies into the base colour.
"""
import math
import os
import random
import sys

import bmesh
from mathutils import Matrix

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from kitlib import *  # noqa: E402,F401,F403
from kitlib import M, PIECES  # noqa: E402

def shack(name, lod, w, d, h, wall_mat, roof_mat, stones=3, tyre=True, plaster_base=False, rust=0.45):
    """Single room (research: 3.0-3.7 m square, eaves 2.2-2.6 m, mono-pitch 8-15 deg).
    LOD0 full detail; LOD1 slab roof, door + shutter, no clutter; LOD2 walls + roof only."""
    pitch = math.radians(random.uniform(8, 14))
    rise = math.tan(pitch) * d
    mats = [wall_mat, roof_mat, M["timber_blue"], M["steel"], M["stone"], M["rubber"], M["concrete"]]
    bm = bmesh.new()
    # walls: back wall taller (mono-pitch)
    add_box(bm, (w, d, h), (0, 0, h / 2), 0)
    for v in bm.verts:
        if v.co.z > h - 1e-4 and v.co.y > 0:
            v.co.z += rise
    if plaster_base and lod < 2:
        add_box(bm, (w + 0.04, d + 0.04, 0.3), (0, 0, 0.15), 6)
    # door (slightly proud of the front wall) and a small grilled window shutter
    fy = -d / 2 - 0.025
    if lod < 2:
        add_box(bm, (0.82, 0.05, 1.9), (-w * 0.2, fy, 0.95), 2)
        add_box(bm, (0.62, 0.04, 0.55), (w * 0.22, fy, 1.45), 2)  # timber shutter
    if lod == 0:
        for i in range(5):
            add_box(bm, (0.016, 0.03, 0.55), (w * 0.22 - 0.24 + i * 0.12, fy - 0.04, 1.45), 3)
    box_uv(bm, tile=2.0)
    # roof: real corrugated sheet (LOD0) or a slab with the same normal map (LOD1/2),
    # 0.25 m overhang, tilted to the wall heights
    rb = bmesh.new()
    if lod == 0:
        corrugated_sheet(rb, w + 0.5, (d + 0.5) / math.cos(pitch), mat_index=1)
    else:
        flat_sheet(rb, w + 0.5, (d + 0.5) / math.cos(pitch), 1)
    box_uv(rb, tile=1.6)
    mat_roof = Matrix.Translation((0, 0, h + rise / 2 + 0.03)) @ Matrix.Rotation(pitch, 4, "X")
    merge_bm(bm, rb, mat_roof, 1)
    # weights on the roof: stones and an old tyre (research: "held down with stones and old tyres")
    if lod > 0:
        stones, tyre = 0, False
    for _ in range(stones):
        sb = bmesh.new()
        bmesh.ops.create_icosphere(sb, subdivisions=1, radius=random.uniform(0.09, 0.14))
        for v in sb.verts:
            v.co *= random.uniform(0.75, 1.15)
        box_uv(sb, 0.5)
        y = random.uniform(-d / 2, d / 2)
        x = random.uniform(-w / 2 + 0.3, w / 2 - 0.3)
        z = h + rise * (y / d + 0.5) + 0.08
        merge_bm(bm, sb, Matrix.Translation((x, y, z)), 4)
    if tyre:
        tb = bmesh.new()
        bmesh.ops.create_cone(tb, cap_ends=True, segments=16, radius1=0.3, radius2=0.3, depth=0.18)
        bmesh.ops.create_cone(tb, cap_ends=True, segments=12, radius1=0.17, radius2=0.17, depth=0.2)
        box_uv(tb, 0.5)
        y = random.uniform(-d / 4, d / 4)
        merge_bm(bm, tb, Matrix.Translation((random.uniform(-w / 4, w / 4), y, h + rise * (y / d + 0.5) + 0.12)) @ Matrix.Rotation(pitch, 4, "X"), 5)
    ob = new_obj(name, bm, mats)
    # mabati walls rust too (index 0); plastered walls don't
    rust_mats = (0, 1) if wall_mat.name.startswith("mabati") else (1,)
    paint_grime(ob, dust_height=0.5, strength=0.6, streak=0.12, rust=rust, rust_mats=rust_mats)
    return ob


@piece("shack_mabati_green", lods=True)
def _(name, lod):
    return shack(name, lod, 3.3, 3.2, 2.35, M["wall_green"], M["roof_rust"])


@piece("shack_mabati_blue", lods=True)
def _(name, lod):
    return shack(name, lod, 3.0, 3.5, 2.25, M["wall_blue"], M["roof_rust"], stones=4, tyre=False)


@piece("shack_mud_plaster", lods=True)
def _(name, lod):
    return shack(name, lod, 3.6, 3.0, 2.45, M["mud_plaster"], M["roof_new"], stones=2, plaster_base=True, rust=0.15)


def kiosk(name, lod, body_mat, sign_lines, side_word, sign_mat, text_mat):
    """Nairobi roadside kiosk, built from reference photos (research/visual-references/kiosks:
    Argwings Kodhek Rd, Tigoni Rd, Chaka Rd). Welded sheet-steel box in one enamel colour:
    canted lower front, welded-wire mesh hatch with centre bar, perforated vent strip, white
    price-circle stickers, raised sign box, painted side graphic, glued posters, mabati lean-to
    at the back, on a broken concrete slab. Brands are fictional (SPEC 2.5).
    Real proportions (est. from a 1.75 m person and a standard door): 2.2 W x 1.5 D x 2.35 H."""
    w, d, h = 2.2, 1.5, 2.35
    win0, win1 = 1.08, 1.9  # serving hatch, counter height to header
    cant = 0.2  # lower front leans out by 20 cm at counter height
    mats = [body_mat, M["mesh_dark"], M["concrete"], sign_mat, text_mat, M["sign_white"],
            M["roof_rust"], M["vent_hole"], M["timber"]] + M["poster"] + [
            M["poster"][0], M["poster"][1], M["poster"][2], M["plastic_red"], M["plastic_yellow"], M["sign_white"]]
    POSTER0 = 9
    bm = bmesh.new()

    # broken concrete slab, irregular outline
    sb = bmesh.new()
    ring = []
    for i in range(10):
        a = i / 10 * 2 * math.pi
        rr = 1.0 + random.uniform(-0.12, 0.1)
        ring.append((math.cos(a) * (w / 2 + 0.35) * rr, math.sin(a) * (d / 2 + 0.45) * rr - 0.15))
    top = [sb.verts.new((x, y, 0.1)) for x, y in ring]
    bot = [sb.verts.new((x, y, -0.05)) for x, y in ring]
    sb.faces.new(top)
    sb.faces.new(list(reversed(bot)))
    for i in range(len(ring)):
        j = (i + 1) % len(ring)
        sb.faces.new((bot[i], bot[j], top[j], top[i]))
    merge_bm(bm, sb, Matrix.Identity(4), 2)

    # lower body: counter-height box whose front leans outward with height (the canted panel)
    lower = bmesh.new()
    add_box(lower, (w, d, win0 - 0.1), (0, 0, 0.1 + (win0 - 0.1) / 2), 0)
    for v in lower.verts:
        if v.co.y < 0:
            v.co.y -= cant * (v.co.z - 0.1) / (win0 - 0.1)
    merge_bm(bm, lower, Matrix.Identity(4), 0)
    # counter ledge on top of the canted panel
    add_box(bm, (w + 0.06, 0.32, 0.04), (0, -d / 2 - cant + 0.12, win0 + 0.02), 0)
    # upper walls: sides, back, header band (hatch opening in front)
    add_box(bm, (0.06, d, h - win0), (-w / 2 + 0.03, 0, win0 + (h - win0) / 2), 0)
    add_box(bm, (0.06, d, h - win0), (w / 2 - 0.03, 0, win0 + (h - win0) / 2), 0)
    add_box(bm, (w, 0.06, h - win0), (0, d / 2 - 0.03, win0 + (h - win0) / 2), 0)
    add_box(bm, (w, 0.06, h - win1), (0, -d / 2 + 0.03, win1 + (h - win1) / 2), 0)
    # flat steel roof with overhang
    add_box(bm, (w + 0.3, d + 0.3, 0.05), (0, -0.05, h + 0.025), 0)

    # welded-wire mesh hatch: two panes either side of a centre bar
    fy = -d / 2 - 0.005
    add_box(bm, (0.045, 0.04, win1 - win0), (0, fy, (win0 + win1) / 2), 0)
    if lod == 0:
        x = -w / 2 + 0.09
        while x < w / 2 - 0.08:
            add_box(bm, (0.006, 0.006, win1 - win0 - 0.04), (x, fy, (win0 + win1) / 2), 1)
            x += 0.06
        z = win0 + 0.04
        while z < win1 - 0.02:
            add_box(bm, (w - 0.16, 0.006, 0.006), (0, fy - 0.004, z), 1)
            z += 0.06
    elif lod == 1:
        add_box(bm, (w - 0.16, 0.01, win1 - win0 - 0.04), (0, fy, (win0 + win1) / 2), 1)

    # stock behind the mesh: two shelves packed with goods (crates of soda, bread, packets),
    # the way every reference kiosk is stocked floor to ceiling
    if lod < 2:
        GOODS = [M["poster"][0], M["poster"][1], M["poster"][2], M["plastic_red"], M["plastic_yellow"], M["sign_white"]]
        for zi, z in enumerate((win0 + 0.02, win0 + 0.42)):
            add_box(bm, (w - 0.16, 0.42, 0.025), (0, d / 2 - 0.3, z), 8)  # timber shelf
            if lod == 0:
                x = -w / 2 + 0.12
                while x < w / 2 - 0.15:
                    gw, gh = random.uniform(0.07, 0.16), random.uniform(0.12, 0.3)
                    gi = random.randrange(len(GOODS))
                    add_box(bm, (gw, random.uniform(0.08, 0.2), gh), (x + gw / 2, d / 2 - 0.3 + random.uniform(-0.08, 0.08), z + 0.0125 + gh / 2), 12 + gi)
                    x += gw + random.uniform(0.005, 0.03)
    # price-circle stickers on the header and a perforated vent strip along the top
    if lod < 2:
        for i in range(4):
            cb = bmesh.new()
            bmesh.ops.create_cone(cb, cap_ends=True, segments=16, radius1=0.1, radius2=0.1, depth=0.006)
            merge_bm(bm, cb, Matrix.Translation((-0.66 + i * 0.44, -d / 2 - 0.004, 2.03)) @ Matrix.Rotation(math.pi / 2, 4, "X"), 5)
    if lod == 0:
        for i in range(34):
            vb = bmesh.new()
            bmesh.ops.create_cone(vb, cap_ends=True, segments=6, radius1=0.014, radius2=0.014, depth=0.004)
            merge_bm(bm, vb, Matrix.Translation((-w / 2 + 0.1 + i * (w - 0.2) / 33, -d / 2 - 0.003, 2.25)) @ Matrix.Rotation(math.pi / 2, 4, "X"), 7)
            if i % 2 == 0:  # the side panels are perforated too
                vb = bmesh.new()
                bmesh.ops.create_cone(vb, cap_ends=True, segments=6, radius1=0.014, radius2=0.014, depth=0.004)
                merge_bm(bm, vb, Matrix.Translation((-w / 2 - 0.003, -d / 2 + 0.08 + i * (d - 0.16) / 33, 2.25)) @ Matrix.Rotation(math.pi / 2, 4, "Y"), 7)

    # raised sign box above the roof, slightly forward
    add_box(bm, (w + 0.4, 0.12, 0.6), (0, -d / 2 + 0.05, h + 0.36), 3)
    add_box(bm, (0.05, 0.05, 0.3), (-w / 2 + 0.2, -d / 2 + 0.12, h + 0.1), 1)  # bracket
    add_box(bm, (0.05, 0.05, 0.3), (w / 2 - 0.2, -d / 2 + 0.12, h + 0.1), 1)
    box_uv(bm, tile=1.5)
    for i, line in enumerate(sign_lines[: (2, 1, 0)[lod]]):
        tb = text_mesh(line, 0.2 if i == 0 else 0.11, depth=0.006, resolution=(3, 1, 1)[lod])
        merge_bm(bm, tb, Matrix.Translation((0, -d / 2 - 0.015, h + 0.43 - i * 0.2)) @ Matrix.Rotation(math.pi / 2, 4, "X"), 4)
    # big painted brand word on the street-facing side panel (like the soda-brand murals)
    if lod < 2 and side_word:
        tb = text_mesh(side_word, 0.36, depth=0.004, resolution=(3, 1, 1)[lod])
        side = Matrix.Translation((-w / 2 - 0.006, 0.0, 0.62)) @ Matrix.Rotation(-math.pi / 2, 4, "Z") @ Matrix.Rotation(math.pi / 2, 4, "X")
        merge_bm(bm, tb, side, 5)
    # glued posters, slightly askew (paper, not paint)
    if lod < 2:
        for k, (px, pz, pw, ph) in enumerate(((-0.78, 0.62, 0.3, 0.42), (0.7, 1.55, 0.26, 0.36), (0.55, 0.55, 0.32, 0.22))):
            pb = bmesh.new()
            add_box(pb, (pw, 0.003, ph), (0, 0, 0), 0)
            y = -d / 2 - 0.01 - (cant * (pz - 0.1) / (win0 - 0.1) if pz < win0 else 0.0)
            merge_bm(bm, pb, Matrix.Translation((px, y, pz)) @ Matrix.Rotation(random.uniform(-0.06, 0.06), 4, "Y"), POSTER0 + k % 3)

    # mabati lean-to behind on two timber poles (storage/cover)
    if lod < 2:
        rb = bmesh.new()
        if lod == 0:
            corrugated_sheet(rb, w + 0.4, 1.4, mat_index=6)
        else:
            flat_sheet(rb, w + 0.4, 1.4, 6)
        box_uv(rb, 1.6)
        merge_bm(bm, rb, Matrix.Translation((0, d / 2 + 0.68, 2.0)) @ Matrix.Rotation(math.radians(12), 4, "X"), 6)
        for x in (-w / 2, w / 2):
            add_box(bm, (0.08, 0.08, 1.85), (x, d / 2 + 1.3, 0.92), 8)
    ob = new_obj(name, bm, mats)
    paint_grime(ob, dust_height=0.7, strength=0.55, streak=0.12, rust=0.35, rust_mats=(0, 6))
    return ob


@piece("kiosk_pesa", lods=True)
def _(name, lod):
    return kiosk(name, lod, M["kiosk_green"], ["PESA HARAKA AGENT", "TUMA  -  TOA  -  LIPA"], "PESA",
                 M["sign_white"], M["sign_black"])


@piece("kiosk_duka", lods=True)
def _(name, lod):
    return kiosk(name, lod, M["kiosk_red"], ["MAMA WANJIKU KIOSK", "SODA BARIDI  -  MKATE  -  AIRTIME"], "SODA",
                 M["sign_red"], M["sign_white"])


@piece("block_flat", lods=True)
def _(name, lod):
    """Eastlands walk-up (research: 3-4 storeys, 3.0 m floor-to-floor, 1.2 m balconies).
    LOD1: no grille bars, balusters or washing; LOD2: shell, parapet and windows."""
    w, d, floors, fh = 12.0, 9.0, 3, 3.0
    H = floors * fh
    mats = [M["paint_cream"], M["concrete"], M["steel"], M["glass_dark"], M["plastic_black"]] + M["cloth"]
    bm = bmesh.new()
    add_box(bm, (w, d, H), (0, 0, H / 2), 0)
    add_box(bm, (w + 0.1, d + 0.1, 0.5), (0, 0, 0.25), 1)  # rendered concrete base band
    add_box(bm, (w + 0.2, d + 0.2, 0.9), (0, 0, H + 0.45), 1)  # parapet
    for f in range(floors):
        z = f * fh
        for bx in (-3.6, 0.0, 3.6):
            # windows with grilles on the front
            add_box(bm, (1.4, 0.06, 1.3), (bx - 0.9, -d / 2 - 0.01, z + 1.65), 3)
            if lod == 2:
                continue
            for i in range(6 if lod == 0 else 0):
                add_box(bm, (0.015, 0.03, 1.3), (bx - 1.5 + i * 0.24, -d / 2 - 0.05, z + 1.65), 2)
            if f > 0:
                # balcony slab + railing + door
                add_box(bm, (2.0, 1.2, 0.15), (bx + 0.9, -d / 2 - 0.6, z), 1)
                add_box(bm, (2.0, 0.05, 0.05), (bx + 0.9, -d / 2 - 1.18, z + 1.08), 2)  # handrail
                for i in range(11 if lod == 0 else 0):
                    add_box(bm, (0.02, 0.02, 0.95), (bx - 0.05 + i * 0.19, -d / 2 - 1.18, z + 0.6), 2)
                add_box(bm, (0.9, 0.06, 2.1), (bx + 0.9, -d / 2 - 0.01, z + 1.05), 3)
                # washing line with clothes
                for k in range(4 if lod == 0 else 0):
                    add_box(bm, (0.38, 0.02, 0.55), (bx + 0.2 + k * 0.45, -d / 2 - 1.0, z + 1.6), 5 + random.randrange(5))
    # black water tanks on the roof (research: 500-1000 L plastic tanks)
    for tx in (-3.5, 2.5):
        tb = bmesh.new()
        bmesh.ops.create_cone(tb, cap_ends=True, segments=(18, 10, 6)[lod], radius1=0.55, radius2=0.55, depth=1.3)
        merge_bm(bm, tb, Matrix.Translation((tx, 1.5, H + 0.65)), 4)
    box_uv(bm, tile=2.5)
    ob = new_obj(name, bm, mats)
    paint_grime(ob, dust_height=0.9, strength=0.55, streak=0.15)
    return ob


@piece("power_pole")
def _(name):
    """Treated timber pole ~9 m, crossarm with ceramic insulators (research street-furniture.md)."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=10, radius1=0.14, radius2=0.1, depth=9.0)
    bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, 4.5))
    for f in bm.faces:
        f.material_index = 0
    add_box(bm, (1.8, 0.1, 0.1), (0, 0, 8.4), 0)
    for x in (-0.8, -0.3, 0.3, 0.8):
        ib = bmesh.new()
        bmesh.ops.create_cone(ib, cap_ends=True, segments=8, radius1=0.05, radius2=0.035, depth=0.14)
        merge_bm(bm, ib, Matrix.Translation((x, 0, 8.52)), 1)
    # meter box hanging low on the pole (fictional "TAA POWER")
    add_box(bm, (0.3, 0.15, 0.4), (0, -0.2, 2.6), 2)
    box_uv(bm, tile=1.0)
    ob = new_obj(name, bm, [M["pole"], M["ceramic"], M["rust_metal"]])
    paint_grime(ob, dust_height=0.8, strength=0.5)
    return ob


@piece("water_tank", collider="hull")
def _(name):
    """1,000 L black ribbed plastic tank on a block stand."""
    bm = bmesh.new()
    add_box(bm, (1.3, 1.3, 0.4), (0, 0, 0.2), 1)
    tb = bmesh.new()
    bmesh.ops.create_cone(tb, cap_ends=True, segments=24, radius1=0.58, radius2=0.55, depth=1.3)
    # horizontal ribs
    for v in tb.verts:
        v.co.x *= 1 + 0.02 * math.sin(v.co.z * 18)
        v.co.y *= 1 + 0.02 * math.sin(v.co.z * 18)
    merge_bm(bm, tb, Matrix.Translation((0, 0, 1.05)), 0)
    lb = bmesh.new()
    bmesh.ops.create_cone(lb, cap_ends=True, segments=16, radius1=0.2, radius2=0.2, depth=0.06)
    merge_bm(bm, lb, Matrix.Translation((0, 0, 1.73)), 0)
    box_uv(bm, 1.0)
    ob = new_obj(name, bm, [M["plastic_black"], M["concrete"]])
    paint_grime(ob, dust_height=0.7, strength=0.45)
    return ob


@piece("jerrican", collider="box")
def _(name):
    """Yellow 20 L jerrican (about 0.4 x 0.2 x 0.45 m incl. handle)."""
    bm = bmesh.new()
    add_box(bm, (0.36, 0.18, 0.38), (0, 0, 0.19), 0)
    bmesh.ops.bevel(bm, geom=[e for e in bm.edges], offset=0.03, segments=2, affect="EDGES")
    add_box(bm, (0.18, 0.03, 0.06), (0.05, 0, 0.41), 0)
    cb = bmesh.new()
    bmesh.ops.create_cone(cb, cap_ends=True, segments=10, radius1=0.035, radius2=0.035, depth=0.05)
    merge_bm(bm, cb, Matrix.Translation((-0.12, 0, 0.405)), 1)
    box_uv(bm, 0.5)
    ob = new_obj(name, bm, [M["plastic_yellow"], M["plastic_red"]])
    paint_grime(ob, dust_height=0.25, strength=0.4)
    return ob


@piece("plastic_chair", collider="box")
def _(name):
    """Monobloc garden chair: seat 0.45 m, back 0.85 m."""
    bm = bmesh.new()
    add_box(bm, (0.46, 0.44, 0.04), (0, 0, 0.45), 0)
    for x in (-0.2, 0.2):
        for y in (-0.19, 0.19):
            lb = bmesh.new()
            bmesh.ops.create_cone(lb, cap_ends=True, segments=8, radius1=0.028, radius2=0.022, depth=0.45)
            merge_bm(bm, lb, Matrix.Translation((x * 1.08, y * 1.08, 0.225)), 0)
    add_box(bm, (0.46, 0.035, 0.42), (0, 0.22, 0.68), 0)
    for x in (-0.24, 0.24):
        add_box(bm, (0.035, 0.42, 0.035), (x, 0.0, 0.64), 0)  # armrests
    box_uv(bm, 0.5)
    ob = new_obj(name, bm, [M["plastic_red"]])
    paint_grime(ob, dust_height=0.2, strength=0.35)
    return ob



def _shots(shot, x):
    shot("kit_overview.png", (x / 2, -26, 9), (x / 2, 0, 1.5))
    shot("kit_closeup_shacks.png", (5, -9, 2.2), (6, 0, 1.4))
    kx = PIECES["kiosk_duka"][0].location.x
    shot("kit_closeup_kiosks.png", (kx - 3.2, -5.2, 1.7), (kx - 1.0, 0, 1.4))
    shot("kit_kiosk_front.png", (kx, -4.5, 1.6), (kx, 0, 1.5))


finish("hub_kit.glb", _shots)
