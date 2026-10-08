"""Street kit: the Eastlands-style shopping street that lines the avenue (vertical slice).

Pieces (real scale, built from research/visual-references and the hub references):
  shop_* units     4.6 m wide x 9 m deep shop plots, 1 or 2 storeys: painted plaster shell,
                   open shopfront with stocked interior, folding steel doors, mabati veranda on
                   posts, hand-painted signboard (fictional names), upper-floor grilled windows
                   with curtains, roof tank / dish. All units share ~10 materials; paint colours
                   come from vertex colours, so a whole street costs few draw calls.
  tree_street      broad street tree (Nairobi avenue canopy), bark + leaf-cluster cards.
  tree_jacaranda   jacaranda in October bloom (purple clusters).
Trees: LOD0/LOD1 are branch geometry + alpha cluster cards; LOD2 is a 3-plane impostor whose
texture is rendered from the LOD0 tree here in Blender.

Usage: blender -b --factory-startup -P blender/scripts/build_street_kit.py -- --out public/models/raw [--preview blender/previews]
"""
import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from kitlib import *  # noqa: E402,F401,F403
from kitlib import KIT, M, PIECES, ROOT, SCENE, TEX  # noqa: E402

GEN = os.path.join(ROOT, "blender", "cache")  # generated textures (cluster cards, impostors)
os.makedirs(GEN, exist_ok=True)


# ============================================================================ texture baking
def _render_setup(res):
    SCENE.render.engine = "BLENDER_EEVEE_NEXT"
    SCENE.render.film_transparent = True
    SCENE.render.resolution_x = SCENE.render.resolution_y = res
    SCENE.render.image_settings.file_format = "PNG"
    SCENE.render.image_settings.color_mode = "RGBA"
    SCENE.view_settings.view_transform = "Standard"  # albedo-like output, not a graded photo
    world = bpy.data.worlds.get("bake_world") or bpy.data.worlds.new("bake_world")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (1, 1, 1, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.9
    SCENE.world = world


def _ortho_camera(name, loc, target, scale):
    cam = bpy.data.objects.get(name)
    if not cam:
        cam = bpy.data.objects.new(name, bpy.data.cameras.new(name))
        SCENE.collection.objects.link(cam)
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = scale
    cam.location = loc
    cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    SCENE.camera = cam
    return cam


def _leaf_material(name, tex_id):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    img = nt.nodes.new("ShaderNodeTexImage")
    img.image = bpy.data.images.load(os.path.join(TEX, tex_id, f"{tex_id}_1K-JPG_Color.jpg"), check_existing=True)
    op = nt.nodes.new("ShaderNodeTexImage")
    op.image = bpy.data.images.load(os.path.join(TEX, tex_id, f"{tex_id}_1K-JPG_Opacity.jpg"), check_existing=True)
    op.image.colorspace_settings.name = "Non-Color"
    nt.links.new(img.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(op.outputs["Color"], bsdf.inputs["Alpha"])
    bsdf.inputs["Roughness"].default_value = 0.7
    return mat


def bake_cluster(out_png, leaf_tex, flower_ratio=0.0, seed=1, n=170):
    """Render a ~1.2 m twig cluster (many real leaves from a CC0 atlas, optional jacaranda
    flower panicles) to an RGBA card texture. Classic game foliage: one card = many leaves."""
    if os.path.exists(out_png):
        return out_png
    rnd = random.Random(seed)
    col = bpy.data.collections.new(f"BAKE_{seed}")
    SCENE.collection.children.link(col)
    KIT.hide_render = True
    leaf = _leaf_material(f"bake_leaf_{seed}", leaf_tex)
    flower = pbr(f"bake_flower_{seed}", color=(0.50, 0.36, 0.80), rough=0.8, metal=0.0)  # jacaranda #8E6BBF
    twig = pbr(f"bake_twig_{seed}", color=(0.22, 0.17, 0.12), rough=0.9, metal=0.0)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.verify()
    # 5-7 sprays radiating from the card centre; leaves sit along each spray with gaps between,
    # so the card silhouette is ragged like a real twig, not a disc. Atlas: 3x3 grid of leaves.
    sprays = [(rnd.uniform(0, 2 * math.pi), rnd.uniform(0.35, 0.6)) for _ in range(rnd.randint(5, 7))]
    for i in range(n):
        ang, ln = sprays[i % len(sprays)]
        t = rnd.random() ** 0.7
        ang += rnd.gauss(0, 0.22) * (1 - t * 0.5)
        r = t * ln
        c = Vector((math.cos(ang) * r, rnd.uniform(-0.12, 0.12), math.sin(ang) * r))
        s = rnd.uniform(0.04, 0.07) * (1.15 - 0.4 * t)
        rot = Matrix.Rotation(rnd.uniform(0, 2 * math.pi), 3, "Y") @ Matrix.Rotation(rnd.uniform(-0.6, 0.6), 3, "X")
        cell = rnd.randrange(9)
        cu, cv = (cell % 3) / 3, (cell // 3) / 3
        vs = [bm.verts.new(c + rot @ Vector(p)) for p in ((-s, 0, -s), (s, 0, -s), (s, 0, s), (-s, 0, s))]
        f = bm.faces.new(vs)
        for loop, (u, v) in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
            loop[uv].uv = (cu + 0.02 + u * 0.29, cv + 0.02 + v * 0.29)
        f.material_index = 0
    # jacaranda flower panicles: clusters of small purple bells
    for i in range(int(n * flower_ratio * 0.12)):
        ang, ln = sprays[i % len(sprays)]
        r = rnd.random() * ln
        c = Vector((math.cos(ang + rnd.gauss(0, 0.3)) * r, 0.06, math.sin(ang + rnd.gauss(0, 0.3)) * r))
        for k in range(16):  # a panicle: many trumpet bells in a loose cone
            fb = bmesh.new()
            bmesh.ops.create_icosphere(fb, subdivisions=1, radius=rnd.uniform(0.022, 0.04))
            merge_bm(bm, fb, Matrix.Translation(c + Vector((rnd.gauss(0, 0.07), rnd.uniform(0, 0.05), rnd.gauss(0, 0.08)))), 1)
    # twigs
    for i in range(7):
        tb = bmesh.new()
        bmesh.ops.create_cone(tb, cap_ends=False, segments=5, radius1=0.012, radius2=0.004, depth=0.55)
        merge_bm(bm, tb, Matrix.Rotation(rnd.uniform(-1.2, 1.2), 4, "Y") @ Matrix.Translation((0, 0, -0.1)), 2)
    me = bpy.data.meshes.new("cluster")
    bm.to_mesh(me)
    bm.free()
    for m in (leaf, flower, twig):
        me.materials.append(m)
    ob = bpy.data.objects.new("cluster", me)
    col.objects.link(ob)
    _render_setup(512)
    _ortho_camera("bake_cam", (0, -5, 0), (0, 0, 0), 1.25)
    SCENE.render.filepath = out_png
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(ob)
    bpy.data.collections.remove(col)
    KIT.hide_render = False
    print(f"[street] baked {out_png}")
    return out_png


def card_material(name, png):
    """Alpha-tested card material (name contains _alpha: runtime sets alphaTest + DoubleSide)."""
    mat = bpy.data.materials.get(name)
    if mat:
        return mat
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    img = nt.nodes.new("ShaderNodeTexImage")
    img.image = bpy.data.images.load(png, check_existing=True)
    nt.links.new(img.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(img.outputs["Alpha"], bsdf.inputs["Alpha"])
    bsdf.inputs["Roughness"].default_value = 0.75
    mat.blend_method = "CLIP" if hasattr(mat, "blend_method") else mat.blend_method
    return mat


# ============================================================================ trees
def tube(bm, pts, radii, sides, mat_index, uv_scale=1.0):
    """Tapered tube along points (bark UVs: u around, v along)."""
    uv = bm.loops.layers.uv.verify()
    rings = []
    for i, p in enumerate(pts):
        d = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        side = d.orthogonal().normalized()
        up = d.cross(side)
        rings.append([bm.verts.new(p + (side * math.cos(a) + up * math.sin(a)) * radii[i])
                      for a in (2 * math.pi * k / sides for k in range(sides))])
    length = 0.0
    for i in range(len(rings) - 1):
        seg = (pts[i + 1] - pts[i]).length
        for k in range(sides):
            k2 = (k + 1) % sides
            f = bm.faces.new((rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]))
            f.material_index = mat_index
            f.smooth = True
            for loop, (u, v) in zip(f.loops, ((k, length), (k + 1, length), (k + 1, length + seg), (k, length + seg))):
                loop[uv].uv = (u / sides * radii[i] * 6.3 / uv_scale, v / uv_scale)
        length += seg


def grow_tree(rnd, kind):
    """Branch skeleton: list of branches (points, radii, level) + foliage anchor points."""
    branches, anchors = [], []
    trunk_h = rnd.uniform(2.6, 3.4) if kind == "street" else rnd.uniform(2.2, 2.8)
    spread = 1.0 if kind == "street" else 1.25  # jacarandas spread wide and fine

    def branch(p0, d, length, radius, level):
        pts, radii = [p0], [radius]
        segs = 4 if level < 2 else 3
        p = p0.copy()
        for s in range(segs):
            d = (d + Vector((rnd.gauss(0, 0.18), rnd.gauss(0, 0.18), rnd.gauss(0.05, 0.1)))).normalized()
            p = p + d * (length / segs)
            pts.append(p.copy())
            radii.append(radius * (1 - 0.55 * (s + 1) / segs))
        branches.append((pts, radii, level))
        if level >= 4:
            anchors.extend(pts[1:])
            return
        if level == 3:
            anchors.extend(pts[2:])
        kids = rnd.randint(2, 3) if level > 0 else rnd.randint(3, 4)
        for k in range(kids):
            a = 2 * math.pi * k / kids + rnd.uniform(-0.5, 0.5)
            out = Vector((math.cos(a), math.sin(a), 0))
            tilt = rnd.uniform(0.35, 0.75) * spread
            nd = (d * (1 - tilt) + out * tilt + Vector((0, 0, 0.25))).normalized()
            start = pts[-1] if k == 0 or level == 0 else pts[rnd.randint(2, len(pts) - 1)]
            branch(start, nd, length * rnd.uniform(0.6, 0.74), radii[-1] * 0.75, level + 1)

    trunk_r = rnd.uniform(0.2, 0.26)
    tp = [Vector((0, 0, 0))]
    for i in range(4):
        tp.append(tp[-1] + Vector((rnd.gauss(0, 0.06), rnd.gauss(0, 0.06), trunk_h / 4)))
    branches.append((tp, [trunk_r * (1.25 if i == 0 else 1 - 0.15 * i) for i in range(5)], 0))
    top = tp[-1]
    for k in range(4 if kind == "street" else 5):
        a = 2 * math.pi * k / 4 + rnd.uniform(-0.4, 0.4)
        d = Vector((math.cos(a) * 0.6 * spread, math.sin(a) * 0.6 * spread, 0.8)).normalized()
        branch(top, d, rnd.uniform(3.0, 3.8), trunk_r * 0.62, 1)
    return branches, anchors


def tree(name, lod, kind, cluster_png):
    rnd = random.Random(7 if kind == "street" else 11)
    branches, anchors = grow_tree(rnd, kind)
    bark = pbr("bark", "Bark007", tint=(0.55, 0.48, 0.42))  # grey-brown, not bleached
    leaves = card_material(f"foliage_{kind}_alpha", cluster_png)
    bm = bmesh.new()
    for pts, radii, level in branches:
        if (lod == 1 and level >= 3) or (lod == 0 and level >= 4 and rnd.random() < 0.5):
            continue
        sides = (8, 6, 5, 4, 3)[level] if lod == 0 else (6, 5, 4, 4, 3)[level]
        tube(bm, pts, radii, sides, 0)
    # foliage cards: oriented outward from the crown centre, random roll, size varies
    centre = sum(anchors, Vector()) / max(1, len(anchors))
    uv = bm.loops.layers.uv.verify()
    pick = anchors if lod == 0 else anchors[::3]
    size = 0.95 if lod == 0 else 1.7
    for p in pick:
        out = (p - centre)
        out.z *= 0.4
        out = out.normalized() if out.length > 1e-3 else Vector((0, -1, 0))
        # mostly facing outward, but tilted/rolled at random so the crown reads as a volume
        jitter = Vector((rnd.gauss(0, 0.6), rnd.gauss(0, 0.6), rnd.gauss(0.3, 0.6)))
        out = (out + jitter).normalized()
        q = out.to_track_quat("-Y", "Z") @ Matrix.Rotation(rnd.uniform(0, 2 * math.pi), 3, "Y").to_quaternion()
        s = size * rnd.uniform(0.85, 1.2) / 2
        vs = [bm.verts.new(p + q @ Vector(c)) for c in ((-s, 0, -s), (s, 0, -s), (s, 0, s), (-s, 0, s))]
        f = bm.faces.new(vs)
        f.material_index = 1
        for loop, (u, v) in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
            loop[uv].uv = (u, v)
    ob = new_obj(name, bm, [bark, leaves])
    # per-card colour variation (sun-bleached / darker clusters) and dust on the trunk base
    paint_grime(ob, dust_height=1.0, strength=0.4, tint={1: lambda i: (rnd.uniform(0.82, 1.08), rnd.uniform(0.85, 1.05), rnd.uniform(0.8, 1.0))})
    return ob


def impostor(name, src, png):
    """LOD2: three crossed vertical planes textured with a render of the LOD0 tree."""
    dims = src.dimensions
    w, h = max(dims.x, dims.y) * 1.02, dims.z * 1.02
    if not os.path.exists(png):
        for o in KIT.objects:
            o.hide_render = o is not src
        _render_setup(512)
        size = max(w, h)
        _ortho_camera("imp_cam", (0, -40, h / 2), (0, 0, h / 2), size)
        SCENE.render.filepath = png
        bpy.ops.render.render(write_still=True)
        for o in KIT.objects:
            o.hide_render = False
        print(f"[street] impostor {png}")
    mat = card_material(f"{name}_impostor_alpha", png)
    size = max(w, h)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.verify()
    for k in range(3):
        rot = Matrix.Rotation(k * math.pi / 3, 3, "Z")
        vs = [bm.verts.new(rot @ Vector(c)) for c in ((-size / 2, 0, h / 2 - size / 2), (size / 2, 0, h / 2 - size / 2),
                                                      (size / 2, 0, h / 2 + size / 2), (-size / 2, 0, h / 2 + size / 2))]
        f = bm.faces.new(vs)
        for loop, (u, v) in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
            loop[uv].uv = (u, v)
    return new_obj(name, bm, [mat])


def tree_piece(name, kind, cluster_png):
    lod0 = tree(name, 0, kind, cluster_png)
    lod0.name = f"{name}_LOD0"
    lod1 = tree(name, 1, kind, cluster_png)
    lod1.name = f"{name}_LOD1"
    lod2 = impostor(name, lod0, os.path.join(GEN, f"{name}_impostor.png"))
    lod2.name = f"{name}_LOD2"
    PIECES[name] = (lod0, lambda ob: [((0, 0, 1.6), (0.55, 0.55, 3.2))], [lod1, lod2])  # trunk only


# ============================================================================ shop units
WHITE_PLASTER = pbr("plaster_white", "PaintedPlaster017")
STEEL_PAINT = pbr("steel_paint", color=(0.9, 0.9, 0.9), rough=0.45, metal=0.35)
SIGN_BOARD = pbr("sign_board", color=(0.92, 0.92, 0.92), rough=0.7, metal=0.0)
GOODS = pbr("goods", color=(0.92, 0.92, 0.92), rough=0.55, metal=0.0)
INTERIOR = pbr("interior_dark", color=(0.30, 0.28, 0.26), rough=0.9, metal=0.0)

# measured/observed Nairobi shop paint (cream, mint, sky blue, ochre, salmon, white, butchery red)
PAINT = {
    "cream": (0.86, 0.80, 0.64), "mint": (0.55, 0.78, 0.62), "blue": (0.45, 0.66, 0.86),
    "ochre": (0.86, 0.66, 0.30), "salmon": (0.90, 0.58, 0.48), "white": (0.93, 0.92, 0.88),
    "red": (0.62, 0.10, 0.09), "green": (0.10, 0.45, 0.22), "yellow": (0.95, 0.80, 0.20),
}

SHOPS = {
    # name: (storeys, wall, base band, sign board, letters, door paint, [sign lines], awning)
    "shop_hardware": (2, "ochre", "red", "yellow", "red", "green", ["MBAO HARDWARE", "CEMENT - MABATI - NAILS - PAINT"], True),
    "shop_barber": (1, "blue", "white", "white", "blue", "blue", ["KINYOZI CLASSIC", "BARBER - SALON - MANICURE"], True),
    "shop_hoteli": (1, "mint", "green", "green", "white", "green", ["CHAI MOTO HOTELI", "CHAPATI - MANDAZI - CHAI - BEANS"], True),
    "shop_butchery": (1, "red", "white", "red", "white", "white", ["NYAMA BORA BUTCHERY", "NYAMA CHOMA - MATUMBO"], False),
    "shop_electronics": (2, "white", "blue", "blue", "white", "blue", ["KIBANDA FM ELECTRONICS", "PHONES - TV - REPAIRS"], True),
    "shop_mshop": (2, "cream", "green", "green", "white", "green", ["WAKURUGENZI M-SHOP", "AIRTIME - PESA HARAKA"], True),
    "shop_boutique": (1, "salmon", "cream", "white", "red", "red", ["UTAFRAAAIA BOUTIQUE", "MITUMBA - SHOES - BAGS"], True),
}

W, D, G = 4.6, 9.0, 3.2  # unit width, depth, ground-floor height
# product packaging colours (soap, flour, cooking fat, soda crates, sugar, tea)
GOODS_COLS = [(0.85, 0.12, 0.1), (0.95, 0.85, 0.2), (0.15, 0.4, 0.8), (0.95, 0.95, 0.9), (0.2, 0.6, 0.25),
              (0.9, 0.5, 0.1), (0.6, 0.15, 0.5), (0.3, 0.3, 0.3)]
U = 3.0  # upper floor height


def shop(name, lod, storeys, wall, band, board, letters, door, lines, awning):
    rnd = random.Random(hash(name) & 0xFFFF)
    H = G + (storeys - 1) * U + 0.6  # + parapet
    mats = [WHITE_PLASTER, M["concrete"], STEEL_PAINT, SIGN_BOARD, SIGN_BOARD, M["roof_rust"],
            INTERIOR, M["timber"], GOODS, M["glass_dark"], M["plastic_black"], M["cloth"][rnd.randrange(5)]]
    WALL, BAND, STEEL, BOARD, LETTER, ROOF, INT, WOOD, GOOD, GLASS, TANK, CURTAIN = range(12)
    fy = -D / 2
    op_w, op_h = 3.2, 2.7  # shopfront opening
    bm = bmesh.new()
    # shell: sides, back, and the front built around the opening
    add_box(bm, (0.2, D, H), (-W / 2 + 0.1, 0, H / 2), WALL)
    add_box(bm, (0.2, D, H), (W / 2 - 0.1, 0, H / 2), WALL)
    add_box(bm, (W, 0.2, H), (0, D / 2 - 0.1, H / 2), WALL)
    pier = (W - op_w) / 2
    add_box(bm, (pier, 0.25, op_h), (-W / 2 + pier / 2, fy + 0.125, op_h / 2), WALL)
    add_box(bm, (pier, 0.25, op_h), (W / 2 - pier / 2, fy + 0.125, op_h / 2), WALL)
    add_box(bm, (W, 0.25, H - op_h), (0, fy + 0.125, op_h + (H - op_h) / 2), WALL)
    add_box(bm, (W, D, 0.15), (0, 0, H - 0.6), BAND)  # roof slab
    add_box(bm, (W + 0.04, 0.3, 0.55), (0, fy + 0.1, 0.27), BAND)  # base band / step
    if lod < 2:
        # interior: floor, dark back wall, shelves stacked with goods (visible through the opening)
        add_box(bm, (W - 0.4, D - 0.4, 0.05), (0, 0, 0.03), INT)
        add_box(bm, (W - 0.4, 0.05, G), (0, 1.6, G / 2), INT)  # back of shop space, 6 m deep
        for z in (0.5, 1.1, 1.7, 2.3):
            add_box(bm, (W - 0.6, 0.5, 0.03), (0, 1.3, z), WOOD)
            if lod == 0:
                x = -W / 2 + 0.4
                while x < W / 2 - 0.45:
                    gw, gh = rnd.uniform(0.12, 0.3), rnd.uniform(0.15, 0.42)
                    add_box(bm, (gw, rnd.uniform(0.2, 0.4), gh), (x + gw / 2, 1.3, z + 0.015 + gh / 2), GOOD)
                    x += gw + rnd.uniform(0.01, 0.05)
        # folding steel doors, folded open into a zig-zag stack at each jamb (as on Nairobi
        # shopfronts): 4 narrow leaves per side, ~0.35 m deep, with pressed panel ribs
        for sx in (-1, 1):
            for k in range(4):
                ang = math.radians(62 if k % 2 == 0 else -62)
                leaf = bmesh.new()
                add_box(leaf, (0.03, 0.4, op_h - 0.12), (0, 0, 0), 0)
                if lod == 0:
                    for rz in (0.55, 1.3, 2.05):  # horizontal pressed ribs
                        add_box(leaf, (0.045, 0.36, 0.035), (0, 0, rz - (op_h - 0.12) / 2), 0)
                x0 = sx * (op_w / 2 - 0.06 - k * 0.085)
                merge_bm(bm, leaf, Matrix.Translation((x0, fy - 0.17, (op_h - 0.12) / 2 + 0.06)) @ Matrix.Rotation(ang, 4, "Z"), STEEL)
        # rolled shutter drum above the opening
        cb = bmesh.new()
        bmesh.ops.create_cone(cb, cap_ends=True, segments=10, radius1=0.16, radius2=0.16, depth=op_w + 0.1)
        merge_bm(bm, cb, Matrix.Translation((0, fy - 0.15, op_h + 0.12)) @ Matrix.Rotation(math.pi / 2, 4, "Y"), STEEL)
    # signboard across the facade above the opening
    sz = G + 0.05
    add_box(bm, (W - 0.3, 0.08, 0.9), (0, fy - 0.04, sz + 0.45 if storeys == 1 else op_h + 0.5), BOARD)
    box_uv(bm, tile=2.0)
    sign_z = sz + 0.45 if storeys == 1 else op_h + 0.5
    for i, line in enumerate(lines[: (2, 1, 0)[lod]]):
        tb = text_mesh(line, 0.3 if i == 0 else 0.15, depth=0.008, resolution=(3, 1, 1)[lod])
        # fit to board width
        tmp = bpy.data.meshes.new("t")
        tb.to_mesh(tmp)
        xs = [v.co.x for v in tmp.vertices]
        bpy.data.meshes.remove(tmp)
        scale = min(1.0, (W - 0.6) / max(0.1, max(xs) - min(xs)))
        merge_bm(bm, tb, Matrix.Translation((0, fy - 0.09, sign_z + (0.14 if i == 0 else -0.22))) @ Matrix.Rotation(math.pi / 2, 4, "X") @ Matrix.Scale(scale, 4), LETTER)
    # upper floors: grilled windows with curtains, roof tank, satellite dish
    for f in range(1, storeys):
        z = G + (f - 1) * U
        for wx in (-1.05, 1.05):
            add_box(bm, (1.2, 0.05, 1.25), (wx, fy - 0.01, z + 1.55), GLASS if lod == 2 else CURTAIN)
            if lod < 2:
                add_box(bm, (1.3, 0.12, 0.08), (wx, fy - 0.05, z + 0.9), BAND)  # sill
            if lod == 0:
                for i in range(6):
                    add_box(bm, (0.018, 0.03, 1.25), (wx - 0.55 + i * 0.22, fy - 0.06, z + 1.55), STEEL)
                add_box(bm, (1.2, 0.03, 0.018), (wx, fy - 0.06, z + 1.55), STEEL)
    if lod < 2:
        tb = bmesh.new()
        bmesh.ops.create_cone(tb, cap_ends=True, segments=(16, 8)[lod], radius1=0.55, radius2=0.55, depth=1.3)
        merge_bm(bm, tb, Matrix.Translation((rnd.uniform(-1, 1), D / 2 - 1.2, H - 0.45 + 0.65)), TANK)
    if lod == 0 and storeys > 1:
        db = bmesh.new()
        bmesh.ops.create_cone(db, cap_ends=True, segments=12, radius1=0.35, radius2=0.05, depth=0.12)
        merge_bm(bm, db, Matrix.Translation((W / 2 - 0.6, fy + 0.6, H + 0.3)) @ Matrix.Rotation(1.1, 4, "X"), STEEL)
    # mabati veranda over the pavement on two posts (walkable underneath)
    if awning:
        rb = bmesh.new()
        if lod == 0:
            corrugated_sheet(rb, W + 0.1, 2.3, mat_index=ROOF)
        else:
            flat_sheet(rb, W + 0.1, 2.3, ROOF)
        box_uv(rb, 1.6)
        merge_bm(bm, rb, Matrix.Translation((0, fy - 1.1, 2.95)) @ Matrix.Rotation(math.radians(-7), 4, "X"), ROOF)
        if lod < 2:
            for sx in (-1, 1):
                add_box(bm, (0.1, 0.1, 2.85), (sx * (W / 2 - 0.2), fy - 2.1, 1.42), WOOD)
    ob = new_obj(name, bm, mats)
    paint_grime(ob, dust_height=0.9, strength=0.5, streak=0.18, rust=0.35, rust_mats=(ROOF, STEEL), tint={
        WALL: PAINT[wall], BAND: tuple(c * 0.85 for c in PAINT[band]), STEEL: PAINT[door], BOARD: PAINT[board],
        GOOD: lambda i: GOODS_COLS[(i // 6) % len(GOODS_COLS)],  # 6 faces per box = one product
    })
    # letters share the board material; recolour them via a second pass on their faces
    lt = PAINT[letters]
    attr = ob.data.color_attributes[0]
    for poly in ob.data.polygons:
        if poly.material_index == LETTER and poly.center.y < fy - 0.085:
            for li in poly.loop_indices:
                attr.data[li].color = (*lt, 1.0)
    return ob


def shop_colliders(storeys, awning):
    def f(_ob):
        H = G + (storeys - 1) * U + 0.6
        boxes = [((0, 0, H / 2), (W, D, H))]
        if awning:
            boxes += [((sx * (W / 2 - 0.2), -D / 2 - 2.1, 1.42), (0.14, 0.14, 2.85)) for sx in (-1, 1)]
        return boxes
    return f


for name, spec in SHOPS.items():
    storeys, *_rest, awning = spec

    def make(nm, lod, spec=spec):
        return shop(nm, lod, *spec)

    built = []
    for lod in range(3):
        ob = make(name, lod)
        ob.name = f"{name}_LOD{lod}"
        built.append(ob)
    PIECES[name] = (built[0], shop_colliders(storeys, awning), built[1:])

# trees last: impostor renders hide every other kit object
street_cluster = bake_cluster(os.path.join(GEN, "cluster_street.png"), "LeafSet022", 0.0, seed=3, n=320)
jac_cluster = bake_cluster(os.path.join(GEN, "cluster_jacaranda.png"), "LeafSet024", 3.0, seed=5, n=160)
SCENE.render.film_transparent = False  # bakes need alpha; previews need the sky
tree_piece("tree_street", "street", street_cluster)
tree_piece("tree_jacaranda", "jacaranda", jac_cluster)


def _shots(shot, x):
    shot("street_overview.png", (x / 2, -32, 10), (x / 2, 0, 3))
    sx = PIECES["shop_hoteli"][0].location.x
    shot("street_shop_close.png", (sx - 1.5, -12, 1.7), (sx, 0, 2.2))
    tx = PIECES["tree_jacaranda"][0].location.x
    shot("street_trees.png", (tx - 4, -16, 2), (tx - 4, 0, 5))


finish("street_kit.glb", _shots)
