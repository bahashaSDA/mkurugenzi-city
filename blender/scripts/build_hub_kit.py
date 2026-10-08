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
import zlib

import bmesh
import bpy
from mathutils import Matrix, Vector

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from common import script_args  # noqa: E402

ARGS = script_args()
OUT = ARGS[ARGS.index("--out") + 1] if "--out" in ARGS else "public/models/raw"
PREVIEW = ARGS[ARGS.index("--preview") + 1] if "--preview" in ARGS else None
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
TEX = os.path.join(ROOT, "blender", "textures")

random.seed(254)  # Kenya's calling code: deterministic kit
bpy.ops.wm.read_factory_settings(use_empty=True)
SCENE = bpy.context.scene
KIT = bpy.data.collections.new("KIT")
SCENE.collection.children.link(KIT)

MURRAM_DUST = (0.62, 0.36, 0.24)  # research palette #9C4A2A, lightened as dust film


# ----------------------------------------------------------------------------- materials
def _img(tex_id, kind, non_color):
    path = os.path.join(TEX, tex_id, f"{tex_id}_1K-JPG_{kind}.jpg")
    if not os.path.exists(path):
        return None
    img = bpy.data.images.load(path, check_existing=True)
    if non_color:
        img.colorspace_settings.name = "Non-Color"
    return img


def pbr(name, tex_id=None, tint=None, rough=None, metal=None, color=None):
    """Principled material wired the way Blender's glTF exporter understands:
    image → (multiply tint) → Base Color; Roughness/Metalness images; NormalGL via Normal Map."""
    mat = bpy.data.materials.get(name)
    if mat:
        return mat
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    if color:
        bsdf.inputs["Base Color"].default_value = (*color, 1)
    if rough is not None:
        bsdf.inputs["Roughness"].default_value = rough
    if metal is not None:
        bsdf.inputs["Metallic"].default_value = metal
    if not tex_id:
        return mat
    col = _img(tex_id, "Color", False)
    if col:
        n = nt.nodes.new("ShaderNodeTexImage")
        n.image = col
        out = n.outputs["Color"]
        if tint:
            mix = nt.nodes.new("ShaderNodeMix")
            mix.data_type = "RGBA"
            mix.blend_type = "MULTIPLY"
            mix.inputs["Factor"].default_value = 1.0
            nt.links.new(out, mix.inputs[6])
            mix.inputs[7].default_value = (*tint, 1)
            out = mix.outputs[2]
        nt.links.new(out, bsdf.inputs["Base Color"])
    r = _img(tex_id, "Roughness", True)
    if r and rough is None:
        n = nt.nodes.new("ShaderNodeTexImage")
        n.image = r
        nt.links.new(n.outputs["Color"], bsdf.inputs["Roughness"])
    m = _img(tex_id, "Metalness", True)
    if m and metal is None:
        n = nt.nodes.new("ShaderNodeTexImage")
        n.image = m
        nt.links.new(n.outputs["Color"], bsdf.inputs["Metallic"])
    nrm = _img(tex_id, "NormalGL", True)
    if nrm:
        n = nt.nodes.new("ShaderNodeTexImage")
        n.image = nrm
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nt.links.new(n.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


M = {
    # One galvanised texture for every roof; age/rust varies per piece via vertex colour.
    "roof_rust": pbr("mabati_roof", "CorrugatedSteel005"),
    "roof_new": pbr("mabati_roof", "CorrugatedSteel005"),
    "wall_green": pbr("mabati_wall_green", "CorrugatedSteel006A"),
    "wall_blue": pbr("mabati_wall_blue", "CorrugatedSteel007A"),
    "mud_plaster": pbr("mud_plaster", "Plaster007", tint=(0.86, 0.72, 0.55)),
    "paint_green": pbr("paint_green", "PaintedPlaster017", tint=(0.24, 0.62, 0.30)),
    "paint_yellow": pbr("paint_yellow", "PaintedPlaster017", tint=(0.98, 0.78, 0.22)),
    "paint_cream": pbr("paint_cream", "PaintedPlaster017", tint=(0.93, 0.86, 0.70)),
    "concrete": pbr("concrete", "Concrete040"),
    "timber": pbr("timber", "Planks021"),
    "timber_blue": pbr("timber_blue", "Planks021", tint=(0.35, 0.55, 0.85)),
    "rust_metal": pbr("rust_metal", "Metal021"),
    "pole": pbr("pole_timber", "Planks021", tint=(0.45, 0.36, 0.28)),
    "rubber": pbr("rubber", color=(0.03, 0.03, 0.03), rough=0.85, metal=0.0),
    "plastic_black": pbr("plastic_black", color=(0.04, 0.04, 0.045), rough=0.55, metal=0.0),
    "plastic_yellow": pbr("plastic_yellow", color=(0.95, 0.70, 0.05), rough=0.45, metal=0.0),
    "plastic_red": pbr("plastic_red", color=(0.65, 0.06, 0.05), rough=0.4, metal=0.0),
    "ceramic": pbr("ceramic", color=(0.85, 0.85, 0.8), rough=0.3, metal=0.0),
    "glass_dark": pbr("glass_dark", color=(0.05, 0.07, 0.08), rough=0.08, metal=0.2),
    "sign_red": pbr("sign_red", color=(0.72, 0.10, 0.08), rough=0.7, metal=0.0),
    "sign_white": pbr("sign_white", color=(0.92, 0.90, 0.84), rough=0.7, metal=0.0),
    "sign_black": pbr("sign_black", color=(0.05, 0.05, 0.05), rough=0.7, metal=0.0),
    "stone": pbr("stone", "Concrete040", tint=(0.75, 0.68, 0.6)),
    "steel": pbr("steel_grille", color=(0.18, 0.18, 0.2), rough=0.5, metal=0.9),
    "cloth": [pbr(f"cloth_{i}", color=c, rough=0.9, metal=0.0) for i, c in enumerate(
        [(0.8, 0.15, 0.1), (0.1, 0.3, 0.7), (0.95, 0.85, 0.2), (0.9, 0.9, 0.9), (0.2, 0.55, 0.3)])],
}


# ----------------------------------------------------------------------------- mesh helpers
def new_obj(name, bm, mats):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(m)
    ob = bpy.data.objects.new(name, me)
    KIT.objects.link(ob)
    return ob


def box_uv(bm, tile=2.0, offset=(0.0, 0.0)):
    """World-scale box projection: 1 texture tile per `tile` metres; ribs stay vertical on walls."""
    uv = bm.loops.layers.uv.verify()
    bm.normal_update()  # new bmesh faces have zero normals until updated
    for f in bm.faces:
        n = f.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for loop in f.loops:
            co = loop.vert.co
            if ax == 2:
                u, v = co.x, co.y
            elif ax == 0:
                u, v = co.y, co.z
            else:
                u, v = co.x, co.z
            loop[uv].uv = (u / tile + offset[0], v / tile + offset[1])


def add_box(bm, size, center, mat_index=0):
    """Axis-aligned box with horizontal cuts near the base (so vertex-colour grime has resolution)."""
    sx, sy, sz = size
    cx, cy, cz = center
    z0 = cz - sz / 2
    cuts = [z0] + [z0 + h for h in (0.12, 0.35, 0.7) if h < sz * 0.8] + [z0 + sz]
    rings = []
    for z in cuts:
        rings.append([bm.verts.new((cx + dx * sx / 2, cy + dy * sy / 2, z)) for dx, dy in ((-1, -1), (1, -1), (1, 1), (-1, 1))])
    faces = []
    for a, b in zip(rings, rings[1:]):
        for i in range(4):
            j = (i + 1) % 4
            faces.append(bm.faces.new((a[i], a[j], b[j], b[i])))
    faces.append(bm.faces.new(list(reversed(rings[0]))))
    faces.append(bm.faces.new(rings[-1]))
    for f in faces:
        f.material_index = mat_index
    return faces


def corrugated_sheet(bm, width, length, pitch=0.076, depth=0.018, mat_index=0, segs_per_rib=2):
    """A real corrugated roof sheet: sine profile across X, ribs run along Y (down the slope)."""
    ribs = max(1, round(width / pitch))
    cols = ribs * segs_per_rib
    rows = max(2, round(length / 0.9))  # enough rows for rust-patch vertex colours
    grid = []
    for r in range(rows + 1):
        y = -length / 2 + length * r / rows
        row = []
        for c in range(cols + 1):
            x = -width / 2 + width * c / cols
            # 2 verts per rib (crest/trough) + smooth normals reads as a sine at street distance
            z = math.cos(c / segs_per_rib * 2 * math.pi) * depth / 2
            row.append(bm.verts.new((x, y, z)))
        grid.append(row)
    for r in range(rows):
        for c in range(cols):
            f = bm.faces.new((grid[r][c], grid[r][c + 1], grid[r + 1][c + 1], grid[r + 1][c]))
            f.material_index = mat_index
            f.smooth = True


RUST = (0.66, 0.40, 0.25)  # multiplied over grey galvanised = orange-brown rust


def paint_grime(ob, dust_height=0.45, strength=0.55, streak=0.0, rust=0.0, rust_mats=()):
    """Vertex colours: murram dust fading up from the ground, patchy darkening, and rust
    patches (elongated down the slope, like water-driven rust on real mabati) on `rust_mats`."""
    me = ob.data
    if not me.color_attributes:
        me.color_attributes.new("Col", "BYTE_COLOR", "CORNER")
    attr = me.color_attributes[0]
    rnd = random.Random(hash(ob.name) & 0xFFFF)
    patch = {}
    for poly in me.polygons:
        for li in poly.loop_indices:
            v = me.vertices[me.loops[li].vertex_index]
            z = (ob.matrix_world @ v.co).z
            k = max(0.0, 1.0 - z / dust_height) * strength
            key = (round(v.co.x, 1), round(v.co.y, 1))
            d = patch.setdefault(key, 1.0 - rnd.random() * streak)
            col = [(1 - k) * d + k * MURRAM_DUST[i] for i in range(3)]
            if rust and poly.material_index in rust_mats:
                rk = (round(v.co.x / 0.3), round(v.co.y / 0.9), round(v.co.z / 0.9))
                r = patch.setdefault(("r",) + rk, rnd.random())
                if r < rust:
                    a = 0.55 + 0.45 * (1 - r / rust)  # patch core is darkest
                    col = [col[i] * ((1 - a) + a * RUST[i]) for i in range(3)]
            attr.data[li].color = (*col, 1.0)


def text_mesh(body, size, depth=0.01, resolution=3):
    """Signwriting as real geometry (Blender's built-in font), low curve resolution for games."""
    cu = bpy.data.curves.new("txt", "FONT")
    cu.resolution_u = resolution
    cu.body = body
    cu.size = size
    cu.extrude = depth
    cu.align_x = "CENTER"
    cu.align_y = "CENTER"
    tmp = bpy.data.objects.new("txt", cu)
    SCENE.collection.objects.link(tmp)
    deps = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(tmp.evaluated_get(deps))
    bpy.data.objects.remove(tmp)
    bm = bmesh.new()
    bm.from_mesh(me)
    bpy.data.meshes.remove(me)
    return bm


def flat_sheet(bm, width, length, mat_index, thickness=0.02):
    """LOD1/LOD2 roof: a thin slab; the corrugation survives as the texture's normal map."""
    add_box(bm, (width, length, thickness), (0, 0, 0), mat_index)


def merge_bm(dst, src, matrix, mat_index):
    """Append bmesh `src` into `dst` transformed, all faces on `mat_index`."""
    me = bpy.data.meshes.new("tmp")
    src.to_mesh(me)
    src.free()
    me.transform(matrix)
    for p in me.polygons:
        p.material_index = mat_index
    dst.from_mesh(me)
    bpy.data.meshes.remove(me)


# ----------------------------------------------------------------------------- pieces
PIECES = {}  # name -> (LOD0 object, collider kind, [LOD1, LOD2] or None)


def piece(name, collider="box", lods=False):
    """Register a piece. With lods=True the builder is called with lod=0/1/2 and builds each
    level explicitly (hand-made LODs: far cheaper than decimating corrugated sheets).
    Otherwise LOD1/LOD2 are decimated from LOD0 (fine for small props)."""
    def wrap(fn):
        def build(lod):
            random.seed(zlib.crc32(name.encode()))  # identical random layout at every LOD
            ob = fn(name, lod) if lods else fn(name)
            ob.name = f"{name}_LOD{lod}"
            return ob
        lod0 = build(0)
        PIECES[name] = (lod0, collider, [build(1), build(2)] if lods else None)
        return fn
    return wrap


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


def kiosk(name, lod, body_mat, sign_lines, sign_mat, text_mat):
    """Roadside duka (research: 2.4 x 1.8 m, counter 1.0 m, steel grille, hand-painted board).
    LOD1 keeps the main sign line and drops the grille; LOD2 is body, board and roof."""
    w, d, h = 2.4, 1.8, 2.3
    mats = [body_mat, M["roof_rust"], M["steel"], sign_mat, text_mat, M["timber"], M["concrete"]]
    bm = bmesh.new()
    add_box(bm, (w + 0.2, d + 0.2, 0.15), (0, 0, 0.075), 6)  # concrete plinth
    add_box(bm, (w, d, 1.0), (0, 0, 0.65), 0)  # counter-height walls
    add_box(bm, (0.12, d, h - 1.15), (-w / 2 + 0.06, 0, 1.15 + (h - 1.15) / 2), 0)
    add_box(bm, (0.12, d, h - 1.15), (w / 2 - 0.06, 0, 1.15 + (h - 1.15) / 2), 0)
    add_box(bm, (w, 0.12, h - 1.15), (0, d / 2 - 0.06, 1.15 + (h - 1.15) / 2), 0)
    add_box(bm, (w + 0.1, 0.35, 0.05), (0, -d / 2 - 0.1, 1.17), 5)  # timber counter shelf
    # steel security grille over the serving hatch
    for i in range(13 if lod == 0 else 0):
        add_box(bm, (0.018, 0.018, h - 1.25), (-w / 2 + 0.2 + i * (w - 0.4) / 12, -d / 2 + 0.03, 1.2 + (h - 1.25) / 2), 2)
    for z in (1.25, 1.75, 2.25) if lod == 0 else ():
        add_box(bm, (w - 0.3, 0.02, 0.03), (0, -d / 2 + 0.03, z), 2)
    # painted sign board above
    add_box(bm, (w + 0.3, 0.05, 0.6), (0, -d / 2 - 0.06, h + 0.35), 3)
    box_uv(bm, tile=1.5)
    for i, line in enumerate(sign_lines[: (2, 1, 0)[lod]]):
        tb = text_mesh(line, 0.24 if i == 0 else 0.13, depth=0.008, resolution=(3, 1, 1)[lod])
        rot = Matrix.Rotation(math.radians(90), 4, "X")
        merge_bm(bm, tb, Matrix.Translation((0, -d / 2 - 0.09, h + 0.45 - i * 0.24)) @ rot, 4)
    rb = bmesh.new()
    if lod == 0:
        corrugated_sheet(rb, w + 0.6, d + 0.7, mat_index=1)
    else:
        flat_sheet(rb, w + 0.6, d + 0.7, 1)
    box_uv(rb, 1.6)
    merge_bm(bm, rb, Matrix.Translation((0, 0.1, h + 0.08)) @ Matrix.Rotation(math.radians(-6), 4, "X"), 1)
    ob = new_obj(name, bm, mats)
    paint_grime(ob, dust_height=0.6, strength=0.5, streak=0.08, rust=0.3, rust_mats=(1, 2))
    return ob


@piece("kiosk_pesa", lods=True)
def _(name, lod):
    return kiosk(name, lod, M["paint_green"], ["PESA HARAKA", "TUMA • TOA • LIPA"], M["sign_white"], M["sign_black"])


@piece("kiosk_duka", lods=True)
def _(name, lod):
    return kiosk(name, lod, M["paint_yellow"], ["DUKA LA MAMA", "SODA BARIDI • MKATE • SUKARI"], M["sign_red"], M["sign_white"])


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


# ----------------------------------------------------------------------------- LODs, colliders
def triangulate_count(ob):
    ob.data.calc_loop_triangles()
    return len(ob.data.loop_triangles)


def make_lod(src, suffix, ratio):
    dup = src.copy()
    dup.data = src.data.copy()
    dup.name = src.name.replace("_LOD0", suffix)
    KIT.objects.link(dup)
    if len(dup.data.polygons) >= 16:
        mod = dup.modifiers.new("dec", "DECIMATE")
        mod.ratio = ratio
        mod.use_collapse_triangulate = True
        with bpy.context.temp_override(object=dup, active_object=dup, selected_objects=[dup]):
            bpy.ops.object.modifier_apply(modifier=mod.name)
        dup.data.validate(clean_customdata=False)
    return dup


def make_collider(src, base, kind):
    name = f"COL_{base}"
    bm = bmesh.new()
    if kind == "hull":
        bm.from_mesh(src.data)
        bmesh.ops.convex_hull(bm, input=bm.verts)
        # drop interior geometry left by convex_hull
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if not f.is_valid], context="FACES")
    else:
        # bounding box of the walls only (ignore roof overhang above 2.0 m for buildings is NOT done:
        # overhangs are above head height, so the full box is correct and simplest)
        xs = [v.co.x for v in src.data.vertices]
        ys = [v.co.y for v in src.data.vertices]
        zs = [v.co.z for v in src.data.vertices]
        bmesh.ops.create_cube(bm, size=1.0)
        sx, sy, sz = max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs)
        bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=bm.verts)
        bmesh.ops.translate(bm, vec=((max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2, (max(zs) + min(zs)) / 2), verts=bm.verts)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    col = bpy.data.objects.new(name, me)
    col["collider"] = kind
    KIT.objects.link(col)
    return col


report = []
for base, (ob, kind, built) in PIECES.items():
    l1, l2 = built if built else (make_lod(ob, "_LOD1", 0.4), make_lod(ob, "_LOD2", 0.12))
    make_collider(ob, base, kind)
    report.append((base, triangulate_count(ob), triangulate_count(l1), triangulate_count(l2)))

for base, t0, t1, t2 in report:
    print(f"[kit] {base:22s} LOD0 {t0:6d}  LOD1 {t1:6d}  LOD2 {t2:6d} tris")

# ----------------------------------------------------------------------------- export
os.makedirs(os.path.join(ROOT, OUT), exist_ok=True)
out_path = os.path.join(ROOT, OUT, "hub_kit.glb")
bpy.ops.object.select_all(action="DESELECT")
for o in KIT.objects:
    o.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=out_path,
    export_format="GLB",
    use_selection=True,
    export_extras=True,
    export_yup=True,
    export_apply=True,
    export_texcoords=True,
    export_normals=True,
    export_vertex_color="ACTIVE",
    export_materials="EXPORT",
    export_image_format="JPEG",
    export_jpeg_quality=85,
    export_animations=False,
)
print(f"[kit] exported {out_path}")

# ----------------------------------------------------------------------------- reality-check render
if PREVIEW:
    os.makedirs(os.path.join(ROOT, PREVIEW), exist_ok=True)
    # lay the LOD0 pieces out in a row, hide LOD1/LOD2/colliders
    x = 0.0
    for o in KIT.objects:
        o.hide_render = not o.name.endswith("_LOD0")
    for base, (ob, _, _) in PIECES.items():
        dims = ob.dimensions
        ob.location.x = x + dims.x / 2
        x += dims.x + 1.5
    # three.js multiplies COLOR_0 into the base colour; do the same here so the preview is honest.
    for mat in bpy.data.materials:
        nt = mat.node_tree if mat.use_nodes else None
        bsdf = nt.nodes.get("Principled BSDF") if nt else None
        if not bsdf:
            continue
        attr = nt.nodes.new("ShaderNodeVertexColor")
        mul = nt.nodes.new("ShaderNodeMix")
        mul.data_type = "RGBA"
        mul.blend_type = "MULTIPLY"
        mul.inputs["Factor"].default_value = 1.0
        base = bsdf.inputs["Base Color"]
        if base.is_linked:
            nt.links.new(base.links[0].from_socket, mul.inputs[6])
        else:
            mul.inputs[6].default_value = base.default_value
        nt.links.new(attr.outputs["Color"], mul.inputs[7])
        nt.links.new(mul.outputs[2], base)
    # murram ground
    bpy.ops.mesh.primitive_plane_add(size=200, location=(x / 2, 0, 0))
    ground = bpy.context.active_object
    ground.data.materials.append(pbr("murram", "Ground048", tint=(1.0, 0.62, 0.45)))
    bm = bmesh.new()
    bm.from_mesh(ground.data)
    box_uv(bm, 3.0)
    bm.to_mesh(ground.data)
    bm.free()
    # Nairobi late-afternoon sun + sky
    sun_data = bpy.data.lights.new("sun", "SUN")
    sun_data.energy = 4.0
    sun_data.color = (1.0, 0.9, 0.75)
    sun = bpy.data.objects.new("sun", sun_data)
    sun.rotation_euler = (math.radians(55), 0, math.radians(-50))
    SCENE.collection.objects.link(sun)
    world = bpy.data.worlds.new("sky")
    world.use_nodes = True
    sky = world.node_tree.nodes.new("ShaderNodeTexSky")
    sky.sky_type = "NISHITA"
    sky.sun_elevation = math.radians(35)
    sky.sun_rotation = math.radians(230)
    world.node_tree.links.new(sky.outputs["Color"], world.node_tree.nodes["Background"].inputs["Color"])
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.25
    SCENE.world = world
    cam_data = bpy.data.cameras.new("cam")
    cam_data.lens = 35
    cam = bpy.data.objects.new("cam", cam_data)
    SCENE.collection.objects.link(cam)
    SCENE.camera = cam
    SCENE.render.engine = "BLENDER_EEVEE_NEXT"
    SCENE.render.resolution_x, SCENE.render.resolution_y = 1600, 900
    SCENE.view_settings.view_transform = "AgX"

    def shot(fname, loc, target):
        cam.location = loc
        direction = Vector(target) - Vector(loc)
        cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
        SCENE.render.filepath = os.path.join(ROOT, PREVIEW, fname)
        bpy.ops.render.render(write_still=True)
        print(f"[kit] preview {SCENE.render.filepath}")

    shot("kit_overview.png", (x / 2, -26, 9), (x / 2, 0, 1.5))
    shot("kit_closeup_shacks.png", (5, -9, 2.2), (6, 0, 1.4))
    shot("kit_closeup_kiosks.png", (x * 0.42, -7, 1.9), (x * 0.42, 0, 1.6))
