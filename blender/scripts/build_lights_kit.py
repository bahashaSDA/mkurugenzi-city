"""Street lighting kit for Mkurugenzi City (replaces the primitive cylinder + box streetlights).

Pieces (real proportions, Nairobi street furniture as reference: galvanised octagonal poles with
cobra-head sodium lanterns on town roads, tall grey LED columns on the CBD and the expressway,
decorative post-top lanterns in the leafy estates):
  lamp_cobra        8.5 m tapered octagonal galvanised pole, curved arm, cobra-head lantern with a
                    prismatic bowl, base plate with anchor bolts on a concrete plinth, access hatch
  lamp_led          10 m round grey column, upswept arm, slim LED luminaire with an emitter panel
  lamp_led_double   the same column with two arms (expressway median)
  lamp_post         4.2 m cast post with a fluted base and a four-pane lantern (estates)

Lens materials are named lamp_*_lens: the game lights them at night only (src/world/StreetLights).
Arms point along -Y (the front, toward the road). Ground at z = 0. Hand-made LODs.

  blender -b --factory-startup -P blender/scripts/build_lights_kit.py -- --out public/models/raw [--preview blender/previews]
"""
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from kitlib import *  # noqa: E402,F401,F403
from kitlib import M, PIECES, add_box, box_uv, finish, merge_bm, new_obj, paint_grime, painted_steel, pbr, piece  # noqa: E402

GALV = pbr("lamp_galvanised", "Metal021", tint=(0.78, 0.8, 0.82), metal=0.7, rough=0.42)
GREY = painted_steel("lamp_paint_grey", (0.16, 0.17, 0.18), rough=0.5)
BLACK = painted_steel("lamp_paint_black", (0.035, 0.035, 0.04), rough=0.45)
ALU = pbr("lamp_aluminium", color=(0.6, 0.62, 0.64), rough=0.35, metal=0.85)
CONC = M["concrete"]
SODIUM = pbr("lamp_sodium_lens", color=(0.95, 0.72, 0.45), rough=0.25, metal=0.0)
LED = pbr("lamp_led_lens", color=(0.86, 0.9, 0.95), rough=0.2, metal=0.0)
WARM = pbr("lamp_warm_lens", color=(0.98, 0.86, 0.62), rough=0.3, metal=0.0)


# ----------------------------------------------------------------------------- mesh helpers
def lathe(bm, profile, segments, mat, rot=0.0, cap_bottom=True, cap_top=True):
    """Revolve a (radius, z) profile around Z. Octagonal poles: segments=8 with rot=pi/8."""
    rings = []
    for r, z in profile:
        ring = []
        for i in range(segments):
            a = rot + 2 * math.pi * i / segments
            ring.append(bm.verts.new((r * math.cos(a), r * math.sin(a), z)))
        rings.append(ring)
    faces = []
    for a, b in zip(rings, rings[1:]):
        for i in range(segments):
            j = (i + 1) % segments
            faces.append(bm.faces.new((a[i], a[j], b[j], b[i])))
    if cap_bottom and profile[0][0] > 1e-4:
        faces.append(bm.faces.new(list(reversed(rings[0]))))
    if cap_top and profile[-1][0] > 1e-4:
        faces.append(bm.faces.new(rings[-1]))
    for f in faces:
        f.material_index = mat
    return faces


def sweep(bm, pts, radius, segments, mat):
    """A round tube along a polyline (parallel-transport frames, so it never twists)."""
    pts = [Vector(p) for p in pts]
    tangents = []
    for i in range(len(pts)):
        a = pts[max(0, i - 1)]
        b = pts[min(len(pts) - 1, i + 1)]
        tangents.append((b - a).normalized())
    normal = tangents[0].orthogonal().normalized()
    rings = []
    for i, (p, t) in enumerate(zip(pts, tangents)):
        if i:
            # carry the previous normal along (parallel transport)
            normal = (normal - t * normal.dot(t)).normalized()
        binorm = t.cross(normal)
        ring = []
        for k in range(segments):
            a = 2 * math.pi * k / segments
            ring.append(bm.verts.new(p + (normal * math.cos(a) + binorm * math.sin(a)) * radius))
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        for k in range(segments):
            j = (k + 1) % segments
            bm.faces.new((a[k], a[j], b[j], b[k])).material_index = mat
    bm.faces.new(list(reversed(rings[0]))).material_index = mat
    bm.faces.new(rings[-1]).material_index = mat


def bezier(p0, p1, p2, n):
    out = []
    for i in range(n + 1):
        t = i / n
        out.append(tuple((1 - t) ** 2 * a + 2 * (1 - t) * t * b + t * t * c for a, b, c in zip(p0, p1, p2)))
    return out


def ellipsoid_half(bm, center, size, mat, top=True, segs=16, rings=6):
    """Half an ellipsoid (top or bottom), its flat side closed: housings, bowls, lantern caps."""
    sx, sy, sz = size
    cx, cy, cz = center
    rows = []
    for r in range(rings + 1):
        phi = (math.pi / 2) * r / rings  # 0 at the equator .. pi/2 at the pole
        z = math.sin(phi) * (1 if top else -1)
        rad = math.cos(phi)
        if r == rings:
            rows.append([bm.verts.new((cx, cy, cz + z * sz))])
            break
        rows.append([bm.verts.new((cx + rad * math.cos(2 * math.pi * k / segs) * sx, cy + rad * math.sin(2 * math.pi * k / segs) * sy, cz + z * sz)) for k in range(segs)])
    for a, b in zip(rows, rows[1:]):
        for k in range(segs):
            j = (k + 1) % segs
            quad = (a[k], a[j], b[j % len(b)], b[k % len(b)]) if len(b) > 1 else (a[k], a[j], b[0])
            f = bm.faces.new(quad if top else tuple(reversed(quad)))
            f.material_index = mat
    cap = bm.faces.new(list(reversed(rows[0])) if top else rows[0])
    cap.material_index = mat


def bolts(bm, half, z, mat, lod):
    if lod > 0:
        return
    for sx in (-1, 1):
        for sy in (-1, 1):
            b = bmesh.new()
            bmesh.ops.create_cone(b, cap_ends=True, segments=6, radius1=0.028, radius2=0.028, depth=0.03)
            merge_bm(bm, b, Matrix.Translation((sx * half, sy * half, z + 0.015)), mat)
            b = bmesh.new()
            bmesh.ops.create_cone(b, cap_ends=True, segments=8, radius1=0.014, radius2=0.014, depth=0.06)
            merge_bm(bm, b, Matrix.Translation((sx * half, sy * half, z + 0.04)), mat)


def finish_piece(name, bm, mats, pole_mats=(1,), uv_tile=1.0):
    box_uv(bm, tile=uv_tile)
    ob = new_obj(name, bm, mats)
    for p in ob.data.polygons:
        p.use_smooth = True
    # road dust at the foot, weather streaks and a little rust where water runs (galvanised ages)
    paint_grime(ob, dust_height=0.9, strength=0.45, streak=0.18, rust=0.12, rust_mats=pole_mats)
    return ob


# ----------------------------------------------------------------------------- pieces
def plinth(bm, lod, w=0.55, h=0.32):
    add_box(bm, (w, w, h), (0, 0, h / 2 - 0.05), 0)  # concrete foundation, 5 cm below the pavement


@piece("lamp_cobra", collider=lambda ob: [((0, 0, 1.4), (0.36, 0.36, 2.8))], lods=True)
def _(name, lod):
    """Town roads: galvanised octagonal pole, curved arm, cobra-head HPS lantern."""
    mats = [CONC, GALV, ALU, SODIUM, BLACK]
    C, G, A, L, B = range(5)
    H = 8.5
    bm = bmesh.new()
    plinth(bm, lod)
    add_box(bm, (0.36, 0.36, 0.025), (0, 0, 0.29), G)  # base plate
    bolts(bm, 0.13, 0.3, G, lod)
    seg = 8
    # flared foot, then a long taper (octagonal, like the real thing)
    prof = [(0.125, 0.3), (0.12, 0.42), (0.105, 0.46)]
    prof += [(0.105 - 0.045 * (z - 0.46) / (H - 0.6), z) for z in ((0.46 + (H - 0.6) * k / (6 if lod == 0 else 2)) for k in range(1, (6 if lod == 0 else 2) + 1))]
    prof += [(0.068, H - 0.12), (0.03, H - 0.06)]
    lathe(bm, prof, seg, G, rot=math.pi / 8)
    if lod == 0:
        add_box(bm, (0.012, 0.11, 0.32), (0.098, 0, 0.95), G)  # access hatch
        lathe(bm, [(0.085, H - 0.42), (0.085, H - 0.28)], 12, G)  # arm clamp collar
    # curved arm rising out over the road
    arm = bezier((0, 0, H - 0.35), (0, -0.9, H - 0.2), (0, -1.75, H + 0.05), 10 if lod == 0 else 4)
    sweep(bm, arm, 0.042, 10 if lod == 0 else 6, G)
    # cobra head: the arm feeds into the REAR of the housing (spigot entry), the lantern reaching
    # out over the road; aluminium canopy on top, prismatic bowl below
    hx, hy, hz = 0, -1.75 - 0.36, H + 0.07
    if lod < 2:
        segs = 16 if lod == 0 else 10
        ellipsoid_half(bm, (hx, hy, hz), (0.19, 0.42, 0.11), A, top=True, segs=segs, rings=5 if lod == 0 else 3)
        ellipsoid_half(bm, (hx, hy - 0.02, hz - 0.012), (0.15, 0.33, 0.075), L, top=False, segs=segs, rings=4 if lod == 0 else 2)
        if lod == 0:
            # photocell on top of the housing (switches the lamp at dusk)
            pc = bmesh.new()
            bmesh.ops.create_cone(pc, cap_ends=True, segments=10, radius1=0.035, radius2=0.03, depth=0.05)
            merge_bm(bm, pc, Matrix.Translation((hx, hy + 0.12, hz + 0.125)), B)
    else:
        add_box(bm, (0.36, 0.8, 0.14), (hx, hy, hz), A)
        add_box(bm, (0.28, 0.6, 0.02), (hx, hy, hz - 0.08), L)
    return finish_piece(name, bm, mats, pole_mats=(G,))


def led_column(bm, lod, H, G):
    seg = (16, 10, 6)[lod]
    prof = [(0.14, 0.27), (0.13, 0.5), (0.11, 0.55), (0.06, H - 0.1), (0.035, H)]
    lathe(bm, prof, seg, G)
    if lod == 0:
        lathe(bm, [(0.125, 0.5), (0.125, 0.56)], seg, G)  # flange collar


def led_head(bm, lod, y_sign, H, G, A, L):
    arm = [(0, 0, H - 0.3), (0, y_sign * 0.6, H - 0.16), (0, y_sign * 2.2, H + 0.12)]
    sweep(bm, bezier(*arm, 6 if lod == 0 else 2), 0.045, (10, 6, 5)[lod], G)
    # slim LED luminaire on the end of the arm (spigot into its rear), slightly upswept (5 degrees),
    # emitter panel underneath
    hy = y_sign * (2.2 + 0.32)
    tilt = Matrix.Rotation(math.radians(5) * -y_sign, 4, "X")
    t = bmesh.new()
    bmesh.ops.create_cube(t, size=1.0)
    bmesh.ops.scale(t, vec=(0.3, 0.68, 0.075), verts=t.verts)
    if lod == 0:
        bmesh.ops.bevel(t, geom=list(t.edges), offset=0.025, segments=2, affect="EDGES")
    merge_bm(bm, t, Matrix.Translation((0, hy, H + 0.13)) @ tilt, A)
    t = bmesh.new()
    bmesh.ops.create_cube(t, size=1.0)
    bmesh.ops.scale(t, vec=(0.22, 0.52, 0.01), verts=t.verts)
    merge_bm(bm, t, Matrix.Translation((0, hy, H + 0.088)) @ tilt, L)


@piece("lamp_led", collider=lambda ob: [((0, 0, 1.4), (0.4, 0.4, 2.8))], lods=True)
def _(name, lod):
    """CBD and arterial roads: tall grey column, LED luminaire on an upswept arm."""
    mats = [CONC, GREY, ALU, LED, BLACK]
    C, G, A, L, B = range(5)
    H = 10.0
    bm = bmesh.new()
    plinth(bm, lod, 0.6)
    add_box(bm, (0.4, 0.4, 0.03), (0, 0, 0.28), G)
    bolts(bm, 0.15, 0.29, G, lod)
    led_column(bm, lod, H, G)
    led_head(bm, lod, -1, H, G, A, L)
    return finish_piece(name, bm, mats, pole_mats=())


@piece("lamp_led_double", collider=lambda ob: [((0, 0, 1.4), (0.4, 0.4, 2.8))], lods=True)
def _(name, lod):
    """Expressway median: one column, a luminaire over each carriageway."""
    mats = [CONC, GREY, ALU, LED, BLACK]
    C, G, A, L, B = range(5)
    H = 10.0
    bm = bmesh.new()
    plinth(bm, lod, 0.6)
    add_box(bm, (0.4, 0.4, 0.03), (0, 0, 0.28), G)
    bolts(bm, 0.15, 0.29, G, lod)
    led_column(bm, lod, H, G)
    led_head(bm, lod, -1, H, G, A, L)
    led_head(bm, lod, 1, H, G, A, L)
    return finish_piece(name, bm, mats, pole_mats=())


@piece("lamp_post", collider=lambda ob: [((0, 0, 1.0), (0.32, 0.32, 2.0))], lods=True)
def _(name, lod):
    """Estates: a cast post with a fluted base and a four-pane lantern."""
    mats = [CONC, BLACK, ALU, WARM, BLACK]
    C, B, A, L, B2 = range(5)
    H = 4.2
    bm = bmesh.new()
    plinth(bm, lod, 0.42, 0.22)
    seg = (16, 10, 6)[lod]
    # ornamental base: plinth ring, bulb, waist, then the slim fluted shaft
    prof = [(0.17, 0.17), (0.17, 0.28), (0.13, 0.33), (0.15, 0.48), (0.09, 0.7), (0.075, 0.95), (0.06, 1.05)]
    prof += [(0.05, H - 0.75), (0.07, H - 0.7), (0.05, H - 0.62)]
    lathe(bm, prof, seg, B)
    if lod == 0:
        # flutes: thin vertical ribs up the shaft
        for k in range(8):
            a = 2 * math.pi * k / 8
            add_box(bm, (0.014, 0.014, H - 1.9), (0.055 * math.cos(a), 0.055 * math.sin(a), 1.05 + (H - 1.9) / 2), B)
    # lantern: frame posts, four glass panes, a pyramid roof and a finial
    z0, z1 = H - 0.62, H - 0.12
    w = 0.17
    add_box(bm, (2 * w + 0.03, 2 * w + 0.03, 0.03), (0, 0, z0), B)
    if lod < 2:
        for sx in (-1, 1):
            for sy in (-1, 1):
                add_box(bm, (0.02, 0.02, z1 - z0), (sx * w, sy * w, (z0 + z1) / 2), B)
    add_box(bm, (2 * w - 0.02, 2 * w - 0.02, z1 - z0 - 0.02), (0, 0, (z0 + z1) / 2), L)
    r = bmesh.new()
    bmesh.ops.create_cone(r, cap_ends=True, segments=4, radius1=0.3, radius2=0.02, depth=0.2)
    merge_bm(bm, r, Matrix.Translation((0, 0, z1 + 0.1)) @ Matrix.Rotation(math.pi / 4, 4, "Z"), B)
    if lod == 0:
        f = bmesh.new()
        bmesh.ops.create_uvsphere(f, u_segments=8, v_segments=6, radius=0.03)
        merge_bm(bm, f, Matrix.Translation((0, 0, z1 + 0.24)), B)
    return finish_piece(name, bm, mats, pole_mats=())


def _shots(shot, x):
    shot("lights_kit.png", (x / 2, -26, 6.0), (x / 2, 0, 5.0))
    cob = PIECES["lamp_cobra"][0].location.x
    shot("lights_kit_heads.png", (cob + 1.6, -5.5, 8.0), (cob + 0.4, -1.8, 8.4))
    led = PIECES["lamp_led_double"][0].location.x
    shot("lights_kit_led.png", (led + 3.5, -6.0, 9.0), (led, 0, 9.9))


finish("lights_kit.glb", _shots)
