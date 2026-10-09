"""Vehicles kit v2 (owner photos 9, 10, 12-15). Bodies are real side profiles (bonnet, raked
windscreen, roof, wheel arches) extruded across the width with tumblehome and rounded edges, then
shelled and cut with see-through window openings, so passengers and seats show through the glass.

  matatu_van    5.38 x 1.88 x 2.28 m  NV350/HiAce-class high roof, NTSA white + yellow band (12, 14)
  matatu_pimp   5.30 x 1.88 x 1.98 m  lowered HiAce, LED bar, green rims, roof rack (15)
  nganya_0..2   7.6  x 2.3  x 3.02 m  Isuzu-class 33-seater, graffiti art, headboard, chrome (9)
  sacco_bus     8.2  x 2.35 x 3.02 m  red/blue Sacco minibus (10)
  car_saloon_0..2 / car_suv_0..1 / car_hatch_0..1 / car_pickup_0..1   private cars, right-hand drive

Kenya: right-hand drive (steering wheel on Blender -X), passenger door on the LEFT (+X).
Vehicle forward = -Y in Blender (+Z in three.js). Seat anchors are mirrored in src/systems/vehicles/specs.ts.
Liveries come from tools/paint_liveries.py (original art; no real Saccos, brands or celebrity faces).
  blender -b --factory-startup -P blender/scripts/build_vehicles_kit.py -- --out public/models/raw [--preview blender/previews]
"""
import math
import os
import random
import subprocess
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from kitlib import *  # noqa: E402,F401,F403
from kitlib import M, PIECES, ROOT  # noqa: E402

GEN = os.path.join(ROOT, "blender", "cache")
os.makedirs(GEN, exist_ok=True)
subprocess.run(["python", os.path.join(ROOT, "tools", "paint_liveries.py"), GEN], check=True)

GLASS = pbr("vehicle_glass_tint", color=(0.04, 0.05, 0.06), rough=0.06, metal=0.1)  # runtime: see-through
GLASS_DARK = pbr("trim_glass_dark", color=(0.02, 0.025, 0.03), rough=0.08, metal=0.2)  # opaque (far LOD)
TYRE = pbr("tyre", color=(0.035, 0.035, 0.035), rough=0.85, metal=0.0)
CHROME = pbr("chrome", color=(0.92, 0.92, 0.94), rough=0.08, metal=1.0)
STEEL_RIM = pbr("rim_steel", color=(0.6, 0.6, 0.62), rough=0.35, metal=0.85)
ALLOY = pbr("rim_alloy", color=(0.72, 0.73, 0.75), rough=0.25, metal=0.9)
GREEN_RIM = pbr("rim_green", color=(0.0, 0.42, 0.32), rough=0.3, metal=0.6)
BLACK = pbr("trim_black", color=(0.02, 0.02, 0.022), rough=0.55, metal=0.0)
HEAD = pbr("headlight_glow", color=(1.0, 0.97, 0.9), rough=0.1, metal=0.0)
TAIL = pbr("taillight_glow", color=(0.85, 0.02, 0.02), rough=0.2, metal=0.0)
AMBER = pbr("indicator_amber", color=(1.0, 0.45, 0.02), rough=0.2, metal=0.0)
SEAT = pbr("seat_fabric", color=(0.07, 0.07, 0.08), rough=0.9, metal=0.0)
SEAT_RED = pbr("seat_red", color=(0.38, 0.02, 0.04), rough=0.7, metal=0.0)
LED = pbr("led_glow", color=(0.75, 0.15, 1.0), rough=0.3, metal=0.0)
LED_BLUE = pbr("led_blue_glow", color=(0.1, 0.55, 1.0), rough=0.3, metal=0.0)
SCREEN = pbr("screen_glow", color=(0.25, 0.55, 0.95), rough=0.2, metal=0.0)
DASH = pbr("dashboard", color=(0.05, 0.05, 0.05), rough=0.7, metal=0.0)
CABIN = pbr("cabin_panel", color=(0.55, 0.53, 0.5), rough=0.8, metal=0.0)
FLOOR = pbr("vehicle_floor", color=(0.1, 0.1, 0.1), rough=0.9, metal=0.0)
PLATE_F = pbr("plate_white", color=(0.92, 0.92, 0.9), rough=0.5, metal=0.0)
PLATE_R = pbr("plate_yellow", color=(0.95, 0.75, 0.05), rough=0.5, metal=0.0)
INK = pbr("plate_ink", color=(0.02, 0.02, 0.02), rough=0.6, metal=0.0)
RED_REFL = pbr("reflector_red", color=(0.75, 0.03, 0.03), rough=0.4, metal=0.0)
WHITE = pbr("reflector_white", color=(0.9, 0.9, 0.9), rough=0.4, metal=0.0)

# material slots (same order for every vehicle; unused slots cost nothing at export)
SLOTS = ["BODY", "GLASS", "TYRE", "RIM", "BLACK", "HEAD", "TAIL", "AMBER", "SEAT", "LED", "SCREEN", "DASH",
         "CABIN", "FLOOR", "PLATE_F", "PLATE_R", "INK", "CHROME", "RED", "WHITE", "HEADBOARD", "GLASS_DARK"]
S = {n: i for i, n in enumerate(SLOTS)}

TMP = bpy.data.collections.new("tmp_cutters")
bpy.context.scene.collection.children.link(TMP)


_MATS = {}


def image_material(name, path, rough, metal, glow=False):
    """One material per livery image (shared by the LODs)."""
    key = (path, glow)
    if key in _MATS:
        return _MATS[key]
    mat = _MATS[key] = bpy.data.materials.new(name + ("_glow" if glow else ""))
    mat.use_nodes = True
    nt = mat.node_tree
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = bpy.data.images.load(path, check_existing=True)
    b = nt.nodes["Principled BSDF"]
    nt.links.new(t.outputs["Color"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    return mat


# ----------------------------------------------------------------------------- body from a side profile
def profile_points(top, wheels, sill, ra_pad=0.06, seg=10):
    """Closed (y, z) outline: `top` runs front-bottom -> over the roof -> rear-bottom; the bottom
    edge runs back to the front with a semicircular arch over each wheel (y, r)."""
    pts = list(top)
    for (wy, r) in sorted(wheels, key=lambda w: -w[0]):  # rear wheel first (largest y)
        ra = r + ra_pad
        s0 = max(-1.0, min(1.0, (sill - r) / ra))
        a0 = math.asin(s0)
        for k in range(seg + 1):  # from the rear side of the arch over the top to the front side
            a = a0 + (math.pi - 2 * a0) * k / seg
            pts.append((wy + ra * math.cos(a), r + ra * math.sin(a)))
    return pts


def body_object(name, top, wheels, sill, W, belt, taper_from, bevel=0.06, shell=True, tumble=0.07):
    pts = profile_points(top, wheels, sill)
    bm = bmesh.new()
    vs = [bm.verts.new((-W / 2, y, z)) for y, z in pts]
    f = bm.faces.new(vs)
    ext = bmesh.ops.extrude_face_region(bm, geom=[f])
    moved = [e for e in ext["geom"] if isinstance(e, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=(W, 0, 0), verts=moved)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    zmax = max(z for _, z in pts)
    ymin = min(y for y, _ in pts)
    for v in bm.verts:  # tumblehome above the belt line, rounded nose in plan
        k = 1.0
        if v.co.z > belt:
            k *= 1 - tumble * ((v.co.z - belt) / max(0.01, zmax - belt))
        if v.co.y < taper_from:
            k *= 1 - 0.06 * ((taper_from - v.co.y) / max(0.01, taper_from - ymin))
        v.co.x *= k
    outline = [e for e in bm.edges if abs((e.verts[0].co - e.verts[1].co).normalized().x) < 0.5]
    bmesh.ops.bevel(bm, geom=outline, offset=bevel, segments=2, affect="EDGES", clamp_overlap=True)
    for fc in bm.faces:
        fc.material_index = S["BODY"]
        fc.smooth = True
    me = bpy.data.meshes.new(name + "_body")
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name + "_body", me)
    TMP.objects.link(ob)
    if shell:
        sol = ob.modifiers.new("shell", "SOLIDIFY")
        sol.thickness = 0.035
        sol.offset = -1
        sol.material_offset = S["CABIN"] - S["BODY"]
        sol.material_offset_rim = S["BLACK"] - S["BODY"]
    return ob


def side_pane(bm, y0, y1, z0, z1, W, belt, zmax, tumble, mi, inset=0.05):
    """Glass in a side opening, leaning in with the body's tumblehome."""
    half = W / 2
    xat = lambda z: half * (1 - tumble * max(0.0, z - belt) / max(0.01, zmax - belt)) - inset
    lean = math.atan2(xat(z0) - xat(z1), z1 - z0)
    for sx in (-1, 1):
        t = _box((0.012, y1 - y0, (z1 - z0) / math.cos(lean)))
        merge_bm(bm, t, Matrix.Translation((sx * (xat(z0) + xat(z1)) / 2, (y0 + y1) / 2, (z0 + z1) / 2))
                 @ Matrix.Rotation(-sx * lean, 4, "Y"), mi)


def cut(ob, boxes):
    """Window openings: boxes (center, size, rot_x) subtracted with the exact solver; the new rims
    take the trim_black slot (material index mode)."""
    if not boxes:
        return
    bm = bmesh.new()
    for c, s, rx in boxes:
        t = bmesh.new()
        bmesh.ops.create_cube(t, size=1.0)
        bmesh.ops.scale(t, vec=s, verts=t.verts)
        for fc in t.faces:
            fc.material_index = S["BLACK"]
        merge_bm(bm, t, Matrix.Translation(c) @ Matrix.Rotation(rx, 4, "X"), S["BLACK"])
    me = bpy.data.meshes.new(ob.name + "_cut")
    bm.to_mesh(me)
    bm.free()
    cutter = bpy.data.objects.new(ob.name + "_cutter", me)
    TMP.objects.link(cutter)
    mod = ob.modifiers.new("windows", "BOOLEAN")
    mod.operation = "DIFFERENCE"
    mod.solver = "EXACT"
    mod.object = cutter
    mod.material_mode = "INDEX"
    mod.use_self = True  # window cutters may touch each other (windscreen vs door glass)
    mod.use_hole_tolerant = True


def baked_bmesh(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    bm = bmesh.new()
    bm.from_mesh(me)
    bpy.data.meshes.remove(me)
    return bm


# ----------------------------------------------------------------------------- parts
def cyl(bm, center, radius, depth, axis, mi, seg=16, bevel=0.0):
    t = bmesh.new()
    bmesh.ops.create_cone(t, cap_ends=True, segments=seg, radius1=radius, radius2=radius, depth=depth)
    if bevel:
        caps = [e for e in t.edges if all(abs(abs(v.co.z) - depth / 2) < 1e-4 for v in e.verts)]
        bmesh.ops.bevel(t, geom=caps, offset=bevel, segments=2, affect="EDGES", clamp_overlap=True)
    rot = {"X": Matrix.Rotation(math.pi / 2, 4, "Y"), "Y": Matrix.Rotation(math.pi / 2, 4, "X"), "Z": Matrix.Identity(4)}[axis]
    merge_bm(bm, t, Matrix.Translation(center) @ rot, mi)


def box(bm, size, center, mi, rot=(0, 0, 0)):
    t = bmesh.new()
    bmesh.ops.create_cube(t, size=1.0)
    bmesh.ops.scale(t, vec=size, verts=t.verts)
    m = Matrix.Translation(center) @ Matrix.Rotation(rot[2], 4, "Z") @ Matrix.Rotation(rot[1], 4, "Y") @ Matrix.Rotation(rot[0], 4, "X")
    merge_bm(bm, t, m, mi)


def wheel(bm, x, y, r, w, style, lod):
    seg = (24, 14, 8)[lod]
    sgn = 1 if x > 0 else -1
    cyl(bm, (x, y, r), r, w, "X", S["TYRE"], seg, bevel=0.05 if lod == 0 else 0.0)
    rim_mi = S["RIM"]
    rr = r * (0.66 if style in ("alloy", "green", "chrome") else 0.6)
    face_x = x + sgn * (w / 2 - 0.01)
    cyl(bm, (face_x, y, r), rr, 0.03, "X", rim_mi, seg)
    if lod == 0:
        cyl(bm, (face_x + sgn * 0.02, y, r), rr * 0.22, 0.04, "X", S["CHROME"] if style != "steel" else rim_mi, 10)
        if style in ("alloy", "green", "chrome"):  # spokes over a dark barrel
            cyl(bm, (face_x + sgn * 0.005, y, r), rr * 0.92, 0.02, "X", S["BLACK"], seg)
            n = 6 if style == "alloy" else 8
            for k in range(n):
                a = 2 * math.pi * k / n
                box(bm, (0.03, rr * 0.82, 0.05), (face_x + sgn * 0.02, y + math.sin(a) * rr * 0.45, r + math.cos(a) * rr * 0.45), rim_mi, rot=(a, 0, 0))
        else:  # steel wheel: holes ring
            for k in range(8):
                a = 2 * math.pi * k / 8
                cyl(bm, (face_x + sgn * 0.016, y + math.sin(a) * rr * 0.6, r + math.cos(a) * rr * 0.6), rr * 0.1, 0.01, "X", S["BLACK"], 6)


def plate(bm, y, z, front):
    box(bm, (0.52, 0.02, 0.12), (0, y, z), S["PLATE_F"] if front else S["PLATE_R"])
    t = text_mesh("KMK 254M", 0.07, depth=0.003, resolution=1)
    sgn = -1 if front else 1
    merge_bm(bm, t, Matrix.Translation((0, y + sgn * 0.013, z)) @ Matrix.Rotation(math.pi / 2 * (1 if front else -1), 4, "X")
             @ (Matrix.Rotation(math.pi, 4, "Z") if not front else Matrix.Identity(4)), S["INK"])


def mirror(bm, x, y, z, sgn, tall=False):
    box(bm, (0.16, 0.03, 0.03), (x + sgn * 0.08, y, z), S["BLACK"])
    box(bm, (0.05, 0.12, 0.3 if tall else 0.16), (x + sgn * 0.18, y, z + (0.05 if tall else 0.0)), S["BLACK"])


def seat(bm, x, y, z, mi, w=0.44, rear=1):
    box(bm, (w, 0.44, 0.11), (x, y, z), mi)  # cushion
    box(bm, (w, 0.09, 0.56), (x, y + rear * 0.22, z + 0.32), mi, rot=(rear * -0.12, 0, 0))  # backrest
    box(bm, (w * 0.55, 0.08, 0.14), (x, y + rear * 0.26, z + 0.68), mi)  # headrest
    box(bm, (w * 0.8, 0.3, 0.3), (x, y + 0.02, z - 0.2), S["BLACK"])  # frame


def steering(bm, x, y, z):
    t = bmesh.new()
    bmesh.ops.create_cone(t, cap_ends=False, segments=16, radius1=0.19, radius2=0.19, depth=0.03)
    merge_bm(bm, t, Matrix.Translation((x, y, z)) @ Matrix.Rotation(1.15, 4, "X"), S["BLACK"])
    box(bm, (0.05, 0.05, 0.3), (x, y + 0.12, z - 0.12), S["BLACK"], rot=(0.6, 0, 0))


# ----------------------------------------------------------------------------- definitions
L_VAN, W_VAN, H_VAN = 5.38, 1.88, 2.28
VAN_TOP = [(-2.69, 0.34), (-2.73, 0.62), (-2.68, 0.82), (-2.56, 0.98), (-2.08, 1.12), (-1.6, 1.98), (-1.42, 2.22),
           (-1.15, 2.28), (2.58, 2.28), (2.69, 2.18), (2.71, 0.48), (2.66, 0.34)]
PIMP_TOP = [(-2.65, 0.28), (-2.7, 0.56), (-2.64, 0.76), (-2.52, 0.92), (-2.04, 1.05), (-1.55, 1.78), (-1.36, 1.95),
            (-1.1, 1.98), (2.55, 1.98), (2.65, 1.9), (2.67, 0.42), (2.62, 0.28)]
VAN_WINS = [(-1.52, -1.3), (-1.18, -0.25), (-0.12, 0.95), (1.08, 2.35)]  # behind the A-pillar
BUS_TOP = [(-3.8, 0.55), (-3.86, 0.86), (-3.84, 1.25), (-3.8, 1.32), (-3.68, 2.55), (-3.72, 2.62), (-3.74, 2.95),
           (-3.62, 3.02), (3.7, 3.02), (3.8, 2.92), (3.82, 0.6), (3.76, 0.55)]
BUS8_TOP = [(y * 8.2 / 7.6, z) for y, z in BUS_TOP]

CARS = {
    "saloon": dict(L=4.6, W=1.7, H=1.47, r=0.31, wb=2.7, sill=0.2, belt=0.92, roof=1.4,
                   top=[(-2.3, 0.3), (-2.34, 0.55), (-2.26, 0.72), (-1.2, 0.87), (-0.5, 1.42), (0.75, 1.44), (1.55, 0.99),
                        (2.22, 0.93), (2.32, 0.72), (2.3, 0.33)],
                   wins=[(-0.45, 0.22), (0.32, 0.78)], ws=(-1.2, 0.87, -0.5, 1.42), rw=(0.75, 1.44, 1.55, 0.99)),
    "suv": dict(L=4.8, W=1.88, H=1.85, r=0.38, wb=2.8, sill=0.32, belt=1.12, roof=1.8,
                top=[(-2.4, 0.42), (-2.44, 0.78), (-2.36, 0.99), (-1.35, 1.1), (-0.78, 1.78), (1.95, 1.82), (2.36, 1.74),
                     (2.42, 0.52), (2.36, 0.42)],
                wins=[(-0.7, 0.3), (0.42, 1.35), (1.45, 2.15)], ws=(-1.35, 1.1, -0.78, 1.78), rw=None),
    "hatch": dict(L=3.9, W=1.69, H=1.5, r=0.3, wb=2.45, sill=0.2, belt=0.94, roof=1.45,
                  top=[(-1.95, 0.3), (-1.99, 0.58), (-1.88, 0.78), (-1.15, 0.9), (-0.42, 1.45), (1.55, 1.48), (1.9, 1.22),
                       (1.96, 0.42), (1.9, 0.3)],
                  wins=[(-0.35, 0.55), (0.65, 1.45)], ws=(-1.15, 0.9, -0.42, 1.45), rw=None),
    "pickup": dict(L=5.3, W=1.85, H=1.8, r=0.38, wb=3.08, sill=0.36, belt=1.14, roof=1.78,
                   top=[(-2.65, 0.45), (-2.69, 0.8), (-2.56, 1.03), (-1.6, 1.13), (-1.02, 1.78), (0.55, 1.8), (0.62, 1.24),
                        (2.62, 1.22), (2.66, 0.52), (2.6, 0.45)],
                   wins=[(-0.95, -0.15), (-0.05, 0.5)], ws=(-1.6, 1.13, -1.02, 1.78), rw=None),
}
CAR_COLOURS = {
    "saloon": [(0.86, 0.86, 0.86), (0.55, 0.56, 0.58), (0.04, 0.04, 0.05)],
    "suv": [(0.9, 0.9, 0.88), (0.12, 0.13, 0.15)],
    "hatch": [(0.55, 0.05, 0.06), (0.15, 0.22, 0.42)],
    "pickup": [(0.85, 0.85, 0.85), (0.5, 0.5, 0.52)],
}

# seat anchors (x, y) in Blender space; mirrored in src/systems/vehicles/specs.ts
SEATS = {
    "van": [(x, y) for y in (-0.55, 0.35, 1.25, 2.1) for x in (-0.55, 0.0, 0.55)][:12],
    "bus76": [(x, -2.6 + 0.75 * i) for i in range(8) for x in (-0.75, -0.3, 0.55)],
    "bus82": [(x, -2.9 + 0.75 * i) for i in range(9) for x in (-0.75, -0.3, 0.55)],
}


def window_boxes_side(spans, z0, z1, W, depth=0.4):
    out = []
    for y0, y1 in spans:
        for sx in (-1, 1):
            out.append(((sx * W / 2, (y0 + y1) / 2, (z0 + z1) / 2), (depth, y1 - y0, z1 - z0), 0.0))
    return out


def slanted_box(a, b, W, thick=0.3):
    """Cutter/pane spanning the slanted segment a->b (y, z) across width W."""
    (ya, za), (yb, zb) = a, b
    ln = math.hypot(yb - ya, zb - za)
    ang = math.atan2(zb - za, yb - ya)  # angle from +Y towards +Z
    return ((0, (ya + yb) / 2, (za + zb) / 2), (W, ln, thick), ang)


def finish_body(name, ob_body, lod, extra, L, H, mats, livery_uv=True):
    bm = baked_bmesh(ob_body)
    extra(bm)
    uv = bm.loops.layers.uv.verify()
    bm.normal_update()
    for f in bm.faces:
        n = f.normal
        for l in f.loops:
            co = l.vert.co
            if f.material_index == S["BODY"] and livery_uv and abs(n.x) > 0.6:
                u = (co.y + L / 2) / L
                l[uv].uv = ((u if n.x > 0 else 1 - u) * 0.96, co.z / H)
            elif f.material_index == S["HEADBOARD"]:
                l[uv].uv = (0.5 + co.x / 2.2, (co.z - 2.62) / 0.33)
            else:
                l[uv].uv = (0.98, co.z / H)
    ob = new_obj(name, bm, mats)
    for poly in ob.data.polygons:
        poly.use_smooth = True
    ob.data.validate(clean_customdata=False)  # booleans can leave degenerate faces
    ob.data.set_sharp_from_angle(angle=math.radians(32))
    paint_grime(ob, dust_height=0.5, strength=0.3)
    return ob


def mats_for(body, rim=STEEL_RIM, seat=SEAT, headboard=None):
    by = {"BODY": body, "GLASS": GLASS, "TYRE": TYRE, "RIM": rim, "BLACK": BLACK, "HEAD": HEAD, "TAIL": TAIL, "AMBER": AMBER,
          "SEAT": seat, "LED": LED, "SCREEN": SCREEN, "DASH": DASH, "CABIN": CABIN, "FLOOR": FLOOR, "PLATE_F": PLATE_F,
          "PLATE_R": PLATE_R, "INK": INK, "CHROME": CHROME, "RED": RED_REFL, "WHITE": WHITE,
          "HEADBOARD": headboard or BLACK, "GLASS_DARK": GLASS_DARK}
    return [by[n] for n in SLOTS]


# ----------------------------------------------------------------------------- matatu vans
def build_van(name, lod, pimp):
    top = PIMP_TOP if pimp else VAN_TOP
    H = 1.98 if pimp else H_VAN
    L, W = (5.3 if pimp else L_VAN), W_VAN
    r = 0.34 if pimp else 0.33
    wheels = [(-1.62, r), (1.45, r)]
    sill = top[0][1]
    win_lo, win_hi = (1.16, 1.78) if pimp else (1.2, 2.04)
    glass = lod < 2
    ob = body_object(name, top, wheels, sill, W, belt=win_lo, taper_from=-1.9, shell=glass)
    ws_a, ws_b = top[4], top[5]
    if glass:
        boxes = window_boxes_side(VAN_WINS, win_lo, win_hi, W)
        c, s, a = slanted_box((ws_a[0] + 0.05, ws_a[1] + 0.06), (ws_b[0] - 0.02, ws_b[1] - 0.04), W * 0.86)
        boxes.append((c, s, a))
        boxes.append(((0, L / 2, (win_lo + win_hi) / 2), (W * 0.78, 0.4, win_hi - win_lo), 0.0))  # rear window
        cut(ob, boxes)
    img = os.path.join(GEN, f"liv_{'matatu_pimp' if pimp else 'matatu_van'}.png")
    body = image_material(f"body_{name}", img, rough=0.28, metal=0.2)
    mats = mats_for(body, rim=GREEN_RIM if pimp else STEEL_RIM, seat=SEAT)
    style = "green" if pimp else "steel"

    def extra(bm):
        gm = S["GLASS"] if glass else S["GLASS_DARK"]
        # glass panes in the openings (mid-shell)
        for y0, y1 in VAN_WINS:
            side_pane(bm, y0, y1, win_lo, win_hi, W, win_lo, H, 0.07, gm)
        c, s, a = slanted_box((ws_a[0] + 0.03, ws_a[1] + 0.05), (ws_b[0], ws_b[1] - 0.03), W * 0.88, 0.012)
        merge_bm(bm, _box(s), Matrix.Translation((0, c[1] + 0.02, c[2])) @ Matrix.Rotation(a, 4, "X"), gm)
        box(bm, (W * 0.8, 0.012, win_hi - win_lo), (0, L / 2 - 0.03, (win_lo + win_hi) / 2), gm)
        for y in [y for y, _ in wheels]:
            for sx in (-1, 1):
                wheel(bm, sx * (W / 2 - 0.16), y, r, 0.22, style, lod)
        yf = top[1][0]
        # front: grille, wraparound headlights, indicators, bumper, plates
        box(bm, (W * 0.5, 0.05, 0.22), (0, yf + 0.06, 0.82 if not pimp else 0.74), S["BLACK"], rot=(0.25, 0, 0))
        for k in range(3):
            box(bm, (W * 0.48, 0.06, 0.02), (0, yf + 0.04, (0.75 if not pimp else 0.67) + k * 0.06), S["CHROME"])
        for sx in (-1, 1):
            box(bm, (0.36, 0.08, 0.17), (sx * (W / 2 - 0.27), yf + 0.09, 0.84 if not pimp else 0.76), S["HEAD"], rot=(0.25, 0, -sx * 0.25))
            box(bm, (0.08, 0.05, 0.08), (sx * (W / 2 - 0.06), yf + 0.18, 0.8 if not pimp else 0.72), S["AMBER"])
            box(bm, (0.1, 0.08, 0.42), (sx * (W / 2 - 0.1), L / 2 + 0.01, 0.95), S["TAIL"])  # tall tail lights
        box(bm, (W + 0.02, 0.16, 0.24), (0, yf + 0.0, sill + 0.14), S["BLACK"] if not pimp else S["BODY"])
        box(bm, (W + 0.02, 0.14, 0.22), (0, L / 2 + 0.03, sill + 0.14), S["BLACK"])
        if pimp:
            box(bm, (W * 0.6, 0.04, 0.035), (0, yf - 0.06, sill + 0.2), S["LED"])  # LED light bar
            for x in (-W * 0.38, W * 0.38):
                box(bm, (0.04, L * 0.55, 0.04), (x, 0.4, H + 0.1), S["BLACK"])
            box(bm, (0.04, 0.04, 0.12), (-W * 0.38, 0.4 - L * 0.27, H + 0.05), S["BLACK"])
            box(bm, (0.04, 0.04, 0.12), (W * 0.38, 0.4 + L * 0.27, H + 0.05), S["BLACK"])
        if lod == 0:
            plate(bm, yf - 0.09, sill + 0.14, True)
            plate(bm, L / 2 + 0.11, sill + 0.14, False)
            for sx in (-1, 1):
                mirror(bm, sx * W / 2, -1.95, win_lo + 0.12, sx)
            if not pimp:  # red/white chevrons on the rear (photo 14)
                for sx in (-1, 1):
                    for k in range(3):
                        box(bm, (0.06, 0.02, 0.26), (sx * (W / 2 - 0.42 - k * 0.1), L / 2 + 0.04, 0.72), S["RED"] if k % 2 == 0 else S["WHITE"], rot=(0, sx * 0.6, 0))
            # interior: floor, dash, steering wheel on the right, driver seat, rows of seats, roof LEDs
            box(bm, (W - 0.12, L - 0.7, 0.04), (0, 0.15, sill + 0.08), S["FLOOR"])
            box(bm, (W - 0.15, 0.4, 0.3), (0, ws_a[0] + 0.32, win_lo - 0.12), S["DASH"])
            steering(bm, -(W / 2 - 0.47), ws_a[0] + 0.62, win_lo + 0.02)
            seat(bm, -(W / 2 - 0.47), -1.45, sill + 0.48, S["SEAT"], 0.48)
            seat(bm, W / 2 - 0.45, -1.45, sill + 0.48, S["SEAT"], 0.8)
            for x, y in SEATS["van"]:
                seat(bm, x, y, sill + 0.48, S["SEAT"])
            for sx in (-1, 1):
                box(bm, (0.03, L * 0.7, 0.02), (sx * (W / 2 - 0.14), 0.3, H - 0.16), S["LED"] if pimp else S["WHITE"])

    return finish_body(f"{name}_LOD{lod}", ob, lod, extra, L, H, mats)


def _box(size):
    t = bmesh.new()
    bmesh.ops.create_cube(t, size=1.0)
    bmesh.ops.scale(t, vec=size, verts=t.verts)
    return t


# ----------------------------------------------------------------------------- nganya / sacco bus
def build_bus(name, lod, kind, idx):
    long_ = kind == "sacco_bus"
    L = 8.2 if long_ else 7.6
    W = 2.35 if long_ else 2.3
    H = 3.02
    top = BUS8_TOP if long_ else BUS_TOP
    r = 0.45
    fw = -2.75 if long_ else -2.55
    wheels = [(fw, r), (2.0 if long_ else 1.85, r)]
    sill = top[0][1]
    win_lo, win_hi = 1.55, 2.55
    glass = lod < 2
    ob = body_object(name, top, wheels, sill, W, belt=win_lo, taper_from=top[0][0] + 0.3, bevel=0.07, shell=glass)
    yf = top[1][0]
    spans = [(yf + 0.75, yf + 1.35)]  # front door glass behind the windscreen
    y = yf + 1.6
    while y + 0.85 < L / 2 - 0.25:
        spans.append((y, y + 0.85))
        y += 0.97
    ws_a, ws_b = top[3], top[4]
    if glass:
        boxes = window_boxes_side(spans, win_lo, win_hi, W)
        boxes.append(slanted_box((ws_a[0], ws_a[1] + 0.05), (ws_b[0], ws_b[1] - 0.03), W * 0.9))
        boxes.append(((0, L / 2, (win_lo + win_hi) / 2), (W * 0.8, 0.4, win_hi - win_lo), 0.0))
        cut(ob, boxes)
    liv = "liv_sacco_bus" if long_ else f"liv_nganya_{idx}"
    body = image_material(f"body_{name}", os.path.join(GEN, liv + ".png"), rough=0.25 if not long_ else 0.35, metal=0.25)
    head = image_material(f"headboard_{name}", os.path.join(GEN, liv + "_head.png"), rough=0.4, metal=0.0, glow=not long_)
    mats = mats_for(body, rim=CHROME if not long_ else STEEL_RIM, seat=SEAT_RED if not long_ else SEAT, headboard=head)
    style = "chrome" if not long_ else "steel"

    def extra(bm):
        gm = S["GLASS"] if glass else S["GLASS_DARK"]
        for y0, y1 in spans:
            side_pane(bm, y0, y1, win_lo, win_hi, W, win_lo, H, 0.07, gm)
        c, s, a = slanted_box((ws_a[0] + 0.02, ws_a[1] + 0.04), (ws_b[0] + 0.02, ws_b[1] - 0.02), W * 0.92, 0.012)
        merge_bm(bm, _box(s), Matrix.Translation((0, c[1] + 0.03, c[2])) @ Matrix.Rotation(a, 4, "X"), gm)
        box(bm, (W * 0.82, 0.012, win_hi - win_lo), (0, L / 2 - 0.04, (win_lo + win_hi) / 2), gm)
        box(bm, (0.05, 0.03, ws_b[1] - ws_a[1]), (0, (ws_a[0] + ws_b[0]) / 2 - 0.01, (ws_a[1] + ws_b[1]) / 2), S["BLACK"], rot=(-0.12, 0, 0))  # split pillar
        # headboard sign above the windscreen
        box(bm, (W * 0.92, 0.04, 0.3), (0, top[6][0] - 0.03, 2.78), S["HEADBOARD"])
        for wy, _ in wheels:
            for sx in (-1, 1):
                wheel(bm, sx * (W / 2 - 0.18), wy, r, 0.26, style, lod)
        for sx in (-1, 1):  # rear duals
            wheel(bm, sx * (W / 2 - 0.46), wheels[1][0], r, 0.24, style, min(lod + 1, 2))
        # front: round headlights in black bezels, grille, chrome bumper, bull bar on nganyas
        for sx in (-1, 1):
            box(bm, (0.46, 0.06, 0.26), (sx * (W / 2 - 0.32), yf - 0.01, 1.0), S["BLACK"])
            for k in (-1, 1):
                cyl(bm, (sx * (W / 2 - 0.32) + k * 0.11, yf - 0.05, 1.0), 0.085, 0.04, "Y", S["HEAD"], 12)
            box(bm, (0.12, 0.05, 0.06), (sx * (W / 2 - 0.08), yf - 0.03, 1.18), S["AMBER"])
            box(bm, (0.12, 0.06, 0.5), (sx * (W / 2 - 0.12), L / 2 + 0.01, 1.05), S["TAIL"])
        box(bm, (W * 0.42, 0.05, 0.28), (0, yf - 0.02, 1.05), S["BLACK"])
        for k in range(4):
            box(bm, (W * 0.4, 0.06, 0.025), (0, yf - 0.05, 0.95 + k * 0.065), S["CHROME"])
        box(bm, (W + 0.06, 0.18, 0.26), (0, yf - 0.02, sill + 0.18), S["CHROME"] if not long_ else S["BLACK"])
        box(bm, (W + 0.04, 0.16, 0.24), (0, L / 2 + 0.04, sill + 0.16), S["BLACK"])
        if not long_:
            for sx in (-1, 1):  # bull bar uprights
                box(bm, (0.06, 0.06, 0.55), (sx * 0.55, yf - 0.16, sill + 0.4), S["CHROME"])
            box(bm, (1.25, 0.06, 0.06), (0, yf - 0.16, sill + 0.66), S["CHROME"])
            for x in (-W * 0.42, W * 0.42):  # chrome roof rack
                box(bm, (0.05, L * 0.6, 0.05), (x, 0.3, H + 0.14), S["CHROME"])
                for y in (-L * 0.28, 0.3, L * 0.33):
                    box(bm, (0.04, 0.04, 0.14), (x, y, H + 0.07), S["CHROME"])
            for y in (-L * 0.2, 0.3, L * 0.28):
                box(bm, (W * 0.84, 0.04, 0.04), (0, y, H + 0.14), S["CHROME"])
            box(bm, (W * 0.95, L * 0.88, 0.03), (0, 0.1, sill - 0.04), S["LED"])  # underglow
            box(bm, (W * 0.9, 0.3, 0.07), (0, L / 2 - 0.1, H + 0.04), S["BLACK"])  # spoiler
        if lod == 0:
            plate(bm, yf - 0.13, sill + 0.18, True)
            plate(bm, L / 2 + 0.13, sill + 0.16, False)
            for sx in (-1, 1):
                mirror(bm, sx * W / 2, yf + 0.3, 2.1, sx, tall=True)
            box(bm, (W - 0.12, L - 0.6, 0.04), (0, 0.1, sill + 0.1), S["FLOOR"])
            box(bm, (W - 0.2, 0.45, 0.35), (0, yf + 0.45, 1.25), S["DASH"])
            steering(bm, -(W / 2 - 0.5), yf + 0.75, 1.45)
            seat(bm, -(W / 2 - 0.5), yf + 1.15, sill + 0.5, S["SEAT"], 0.5)
            for x, yy in SEATS["bus82" if long_ else "bus76"]:
                seat(bm, x, yy, sill + 0.5, S["SEAT"])
            box(bm, (0.04, L * 0.75, 0.04), (0.15, 0.2, H - 0.35), S["CHROME"])  # grab rail for standing passengers
            if not long_:
                for sx in (-1, 1):
                    box(bm, (0.03, L * 0.8, 0.02), (sx * (W / 2 - 0.14), 0.1, H - 0.18), S["LED"])
                for yy in (-L / 2 + 1.6, 0.0, L / 2 - 1.8):
                    box(bm, (0.9, 0.05, 0.5), (0, yy, H - 0.45), S["SCREEN"])  # TV screens
                for sx in (-1, 1):
                    for yy in (-1.5, 0.5, 2.5):
                        cyl(bm, (sx * (W / 2 - 0.08), yy, H - 0.55), 0.13, 0.06, "X", S["BLACK"], 12)  # speakers

    return finish_body(f"{name}_LOD{lod}", ob, lod, extra, L, H, mats)


# ----------------------------------------------------------------------------- private cars
def build_car(name, lod, kind, colour):
    c = CARS[kind]
    L, W, H, r, wb, sill = c["L"], c["W"], c["H"], c["r"], c["wb"], c["sill"]
    wheels = [(-wb / 2, r), (wb / 2, r)]
    glass = lod < 2
    ob = body_object(name, c["top"], wheels, sill, W, belt=c["belt"], taper_from=c["top"][0][0] + 0.6, bevel=0.07, shell=glass, tumble=0.16)
    lo, hi = c["belt"], c["roof"] - 0.08
    ws = c["ws"]
    if glass:
        boxes = window_boxes_side(c["wins"], lo, hi - 0.02, W)
        boxes.append(slanted_box((ws[0] + 0.08, ws[1] + 0.04), (ws[2] - 0.06, ws[3] - 0.04), W * 0.82))
        if c["rw"]:
            rw = c["rw"]
            boxes.append(slanted_box((rw[0] + 0.06, rw[1] - 0.04), (rw[2] - 0.08, rw[3] + 0.04), W * 0.8))
        else:
            boxes.append(((0, L / 2, (lo + hi) / 2), (W * 0.76, 0.5, hi - lo), 0.0))
        cut(ob, boxes)
    paint = _MATS.get(name) or _MATS.setdefault(name, pbr(f"paint_{name}", color=colour, rough=0.22, metal=0.55))
    mats = mats_for(paint, rim=ALLOY)

    def extra(bm):
        gm = S["GLASS"] if glass else S["GLASS_DARK"]
        for y0, y1 in c["wins"]:
            side_pane(bm, y0, y1, lo, hi - 0.02, W, c["belt"], H, 0.16, gm, inset=0.06)
        cc, s, a = slanted_box((ws[0] + 0.06, ws[1] + 0.03), (ws[2] - 0.04, ws[3] - 0.03), W * 0.84, 0.012)
        merge_bm(bm, _box(s), Matrix.Translation((0, cc[1] + 0.02, cc[2])) @ Matrix.Rotation(a, 4, "X"), gm)
        for wy, _ in wheels:
            for sx in (-1, 1):
                wheel(bm, sx * (W / 2 - 0.14), wy, r, 0.21, "alloy", lod)
        yf = c["top"][1][0]
        for sx in (-1, 1):
            box(bm, (0.38, 0.1, 0.12), (sx * (W / 2 - 0.3), yf + 0.12, c["top"][2][1] - 0.04), S["HEAD"], rot=(0.3, 0, -sx * 0.2))
            box(bm, (0.3, 0.08, 0.12), (sx * (W / 2 - 0.25), c["top"][-2][0] + 0.02, c["top"][-2][1] - 0.08), S["TAIL"])
        box(bm, (W * 0.45, 0.06, 0.14), (0, yf + 0.03, c["top"][2][1] - 0.1), S["BLACK"])
        if kind in ("suv", "pickup"):
            box(bm, (W * 0.45, 0.07, 0.03), (0, yf + 0.0, c["top"][2][1] - 0.08), S["CHROME"])
        if kind == "suv":
            cyl(bm, (0, L / 2 + 0.12, 0.95), 0.36, 0.22, "Y", S["TYRE"], 16)  # rear spare wheel
            for x in (-W * 0.4, W * 0.4):
                box(bm, (0.04, L * 0.5, 0.04), (x, 0.3, H + 0.04), S["BLACK"])  # roof rails
        if kind == "pickup":
            box(bm, (W - 0.1, 1.95, 0.04), (0, 1.6, 1.22), S["BLACK"])  # tonneau cover
        if lod == 0:
            plate(bm, yf - 0.05, 0.45, True)
            plate(bm, c["top"][-2][0] + 0.06, 0.5, False)
            for sx in (-1, 1):
                mirror(bm, sx * (W / 2 - 0.02), ws[0] + 0.25, lo + 0.08, sx)
            box(bm, (W - 0.15, L * 0.55, 0.04), (0, 0.2, sill + 0.1), S["FLOOR"])
            box(bm, (W - 0.18, 0.35, 0.25), (0, ws[0] + 0.3, lo - 0.12), S["DASH"])
            steering(bm, -(W / 2 - 0.45), ws[0] + 0.62, lo + 0.02)
            for sx in (-1, 1):
                seat(bm, sx * (W / 2 - 0.45), ws[0] + 1.15, sill + 0.32, S["SEAT"], 0.5)
            if kind != "pickup" or True:
                box(bm, (W - 0.3, 0.45, 0.1), (0, ws[0] + 2.05, sill + 0.34), S["SEAT"])
                box(bm, (W - 0.3, 0.1, 0.5), (0, ws[0] + 2.3, sill + 0.62), S["SEAT"])

    return finish_body(f"{name}_LOD{lod}", ob, lod, extra, L, H, mats, livery_uv=False)


# ----------------------------------------------------------------------------- build all
def register(nm, builder, L, W, H, nose=0.0):
    built = [builder(lod) for lod in range(3)]
    PIECES[nm] = (built[0], lambda ob, L=L, W=W, H=H: [((0, 0, H / 2), (W, L, H))], built[1:])


register("matatu_van", lambda lod: build_van("matatu_van", lod, False), L_VAN, W_VAN, H_VAN)
register("matatu_pimp", lambda lod: build_van("matatu_pimp", lod, True), 5.3, W_VAN, 1.98)
for i in range(3):
    register(f"nganya_{i}", lambda lod, i=i: build_bus(f"nganya_{i}", lod, "nganya", i), 7.6, 2.3, 3.02)
register("sacco_bus", lambda lod: build_bus("sacco_bus", lod, "sacco_bus", 0), 8.2, 2.35, 3.02)
for kind, cols in CAR_COLOURS.items():
    for i, col in enumerate(cols):
        c = CARS[kind]
        register(f"car_{kind}_{i}", lambda lod, kind=kind, col=col, i=i: build_car(f"car_{kind}_{i}", lod, kind, col), c["L"], c["W"], c["H"])

# cutters and raw bodies are construction helpers only
for o in list(TMP.objects):
    bpy.data.objects.remove(o)


def _shots(shot, x):
    for nm in ("matatu_van", "matatu_pimp", "nganya_0", "sacco_bus", "car_saloon_0", "car_suv_0"):
        ob = PIECES[nm][0]
        vx = ob.location.x
        shot(f"veh_{nm}.png", (vx + 6.5, -6.0, 2.0), (vx, 0, 1.1))


finish("vehicles_kit.glb", _shots)
