"""Shared Blender kit library: materials, mesh helpers, weathering, piece registry, LOD +
collider generation, glTF export and reality-check preview renders.

Kit scripts do `from kitlib import *`, register pieces with @piece, then call finish().
Conventions (read by src/world/kit/useKit.ts):
  <piece>_LOD0/1/2   render meshes at the origin, ground at z = 0 (Blender Z-up, -Y = front)
  COL_<piece>        one collider (box / hull), or COL_<piece>__0, __1 ... for compound colliders
  materials named *_alpha* are alpha-tested foliage/cards (alphaTest + double-sided at runtime)
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


def painted_steel(name, color, rough=0.5):
    """Enamel-painted sheet steel (kiosks): flat colour, subtle dents/brush normal from Metal021."""
    mat = bpy.data.materials.get(name)
    if mat:
        return mat
    mat = pbr(name, color=color, rough=rough, metal=0.25)
    nt = mat.node_tree
    nrm = _img("Metal021", "NormalGL", True)
    if nrm:
        n = nt.nodes.new("ShaderNodeTexImage")
        n.image = nrm
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nm.inputs["Strength"].default_value = 0.35
        nt.links.new(n.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], nt.nodes["Principled BSDF"].inputs["Normal"])
    return mat


M = {
    # One galvanised texture for every roof; age/rust varies per piece via vertex colour.
    # weathered galvanised sheet is semi-matte: full metalness mirrored the sky into stripes
    "roof_rust": pbr("mabati_roof", "CorrugatedSteel005", metal=0.55),
    "roof_new": pbr("mabati_roof", "CorrugatedSteel005", metal=0.55),
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
    # measured from Nairobi kiosk photos (PALETTES.md): enamel red #AF3339/#9F1F29
    "kiosk_red": painted_steel("kiosk_red", (0.56, 0.06, 0.07)),
    "kiosk_green": painted_steel("kiosk_green", (0.05, 0.36, 0.14)),
    "mesh_dark": pbr("mesh_dark", color=(0.10, 0.10, 0.10), rough=0.6, metal=0.6),
    "vent_hole": pbr("vent_hole", color=(0.015, 0.012, 0.012), rough=0.9, metal=0.0),
    "poster": [pbr(f"poster_{i}", color=c, rough=0.8, metal=0.0) for i, c in enumerate(
        [(0.9, 0.82, 0.2), (0.15, 0.35, 0.75), (0.9, 0.9, 0.88)])],
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


def paint_grime(ob, dust_height=0.45, strength=0.55, streak=0.0, rust=0.0, rust_mats=(), tint=None):
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
            # tint: {material_index: (r, g, b) or callable(face_index) -> rgb}, i.e. paint colour on a
            # white base material. Dust then mixes *toward* murram, lightening dark paint.
            t = (1.0, 1.0, 1.0)
            if tint and poly.material_index in tint:
                t = tint[poly.material_index]
                t = t(poly.index) if callable(t) else t
            col = [(1 - k) * t[i] * d + k * MURRAM_DUST[i] * 1.25 for i in range(3)]
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
    """collider: "box" | "hull" | callable(lod0_object) -> [((cx, cy, cz), (sx, sy, sz)), ...] boxes."""
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
    if callable(kind):
        cols = []
        for i, item in enumerate(kind(src)):
            c, sz = item[0], item[1]
            rot = item[2] if len(item) > 2 else 0.0  # optional rotation about Z (exported as a hull)
            bm = bmesh.new()
            bmesh.ops.create_cube(bm, size=1.0)
            bmesh.ops.scale(bm, vec=sz, verts=bm.verts)
            if rot:
                bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(rot, 3, "Z"))
            bmesh.ops.translate(bm, vec=c, verts=bm.verts)
            me = bpy.data.meshes.new(f"COL_{base}__{i}")
            bm.to_mesh(me)
            bm.free()
            col = bpy.data.objects.new(f"COL_{base}__{i}", me)
            col["collider"] = "hull" if rot else "box"
            KIT.objects.link(col)
            cols.append(col)
        return cols
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


def finish(out_name, shots=None):
    """Build LODs + colliders for every registered piece, export one GLB, render previews."""
    report = []
    for base, (ob, kind, built) in PIECES.items():
        l1, l2 = built if built else (make_lod(ob, "_LOD1", 0.4), make_lod(ob, "_LOD2", 0.12))
        make_collider(ob, base, kind)
        report.append((base, triangulate_count(ob), triangulate_count(l1), triangulate_count(l2)))

    for base, t0, t1, t2 in report:
        print(f"[kit] {base:22s} LOD0 {t0:6d}  LOD1 {t1:6d}  LOD2 {t2:6d} tris")

    # ----------------------------------------------------------------------------- export
    os.makedirs(os.path.join(ROOT, OUT), exist_ok=True)
    out_path = os.path.join(ROOT, OUT, out_name)
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
    if PREVIEW and shots:
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

        shots(shot, x)
