"""Real-model kits from Sketchfab downloads (sketchfab/*.glb, see tools/sketchfab-models.json).

A Sketchfab car is 0.4-1M triangles and 40-60 materials: far too heavy to draw 30 times a frame.
Each model becomes one kit piece that renders in 2 draw calls:

  1. import, apply transforms, join, scale to the real vehicle's length, sit it on the ground,
     forward = -Y (three.js +Z), centred
  2. split the glass off (one shared see-through material, named *glass* for the runtime)
  3. decimate the rest to the triangle budget (collapse keeps each face's material + UVs)
  4. smart-UV a fresh "atlas" map and bake every material's colour, roughness and metalness
     into one atlas (Cycles, colour pass only: no lighting is baked in)
  5. LOD1 / LOD2 by further decimation (atlas UVs survive), a box collider, export

  blender -b --factory-startup -P blender/scripts/build_real_kit.py -- [--only name,name] [--kit vehicles] [--preview]

Variants: cars get colour variants by re-tinting their paint materials before the bake.
"""
import math
import os
import re
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SRC = os.path.join(ROOT, "sketchfab")
OUT = os.path.join(ROOT, "public", "models", "raw")
CACHE = os.path.join(ROOT, "blender", "cache", "real")
PREV = os.path.join(ROOT, "blender", "previews", "real")

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ONLY = set(argv[argv.index("--only") + 1].split(",")) if "--only" in argv else None
KIT = argv[argv.index("--kit") + 1] if "--kit" in argv else "vehicles"
PREVIEW = "--preview" in argv

PAINT = r"(car_?paint|paint|body|carroc|exterior)"
GLASS = r"(glass|windscreen|windshield|vidrio)"

# piece -> source file, real length (m) along the forward axis, triangle budget, atlas px,
# forward ('-y' | '+y' | '-x' | '+x' as found in the import), paint variants (linear RGB) or None
MODELS = {
    "vehicles": {
        "rv_nganya": dict(file="isuzu_nqr__kenyan_nganya", length=7.6, tris=30000, atlas=2048, forward="-y", glass=r"^window",
                          variants=[None, None, None], liveries=["rliv_nganya_0", "rliv_nganya_1", "rliv_nganya_2"]),
        "rv_matatu": dict(file="volkswagen_crafter", length=5.95, tris=24000, planar=False, per_part=True, atlas=2048, forward="-y",
                          variants=[None, None, None], liveries=["rliv_matatu_0", "rliv_matatu_1", "rliv_matatu_2"]),
        "rv_car": dict(file="volkswagen_golf_gti_2025", length=4.28, tris=18000, atlas=2048, forward="+y", paint=r"rojo", clearcoat=r"rojo|material_atlas", weld=False,
                       strip=r"airbag|lighter_dark_grey|carpet|roofliner|brake_rotor",
                       variants=[(0.5, 0.01, 0.01), (0.8, 0.8, 0.8), (0.12, 0.13, 0.15), (0.02, 0.06, 0.25)]),
        "rv_hiace": dict(file="toyota_hiace_2005_clean", length=5.38, tris=16000, atlas=2048, forward="+y", paint="auto", livery_nx=0.4,
                         variants=[None, None, None], liveries=["rliv_matatu_0", "rliv_matatu_1", "rliv_matatu_2"]),
        "rv_ma3": dict(file="tulaga_ma3_minibus", length=7.4, tris=26000, atlas=2048, forward="-y", variants=None),
        "rv_bus": dict(file="stagecoach_bus_kenya", length=10.5, tris=26000, atlas=2048, forward="-y", paint="auto",
                       variants=[None, None], liveries=["rliv_bus_0", "rliv_bus_1"]),
        "rv_probox": dict(file="toyota_probox", length=4.2, tris=16000, atlas=2048, forward="-y", paint=r"^body1$", recalc=True,
                          variants=[(0.8, 0.8, 0.8), (0.55, 0.56, 0.58), (0.8, 0.8, 0.8)]),
        "rv_corolla": dict(file="toyota_corolla_e180", length=4.62, tris=18000, atlas=2048, forward="-y", paint=r"main_paint", weld=False,
                           variants=[(0.55, 0.56, 0.58), (0.02, 0.02, 0.025), (0.8, 0.8, 0.8)]),
        "rv_cruiser": dict(file="toyota_land_cruiser", length=4.2, tris=18000, atlas=2048, forward="-y", paint="auto",
                           variants=[(0.8, 0.8, 0.8), (0.12, 0.2, 0.1), (0.5, 0.05, 0.03)]),
        "rv_graffiti": dict(file="graffiti_safari_matatu", length=5.1, tris=40000, weld=False, planar=False, atlas=2048, forward="+y", variants=None),
        "rv_boda": dict(file="motorcycle_boda", length=2.0, tris=6000, atlas=1024, forward="-x", variants=None),
    },
    # trees: leaf cards keep their alpha textures (renamed foliage_*_alpha: alpha-test + wind in the
    # game), bark is decimated, far LODs thin the leaf cards instead of collapsing them
    "trees": {
        "rt_acacia": dict(file="acacia", height=8.5, bark_tris=4000, keep=(1.0, 0.5, 0.22)),
        "rt_jacaranda": dict(file="jacaranda", height=9.5, bark_tris=3000, keep=(0.6, 0.3, 0.12)),
        "rt_coconut": dict(file="coconut_palm", height=11.0, bark_tris=2000, keep=(1.0, 0.6, 0.35)),
        "rt_palm": dict(file="palm_realistic", height=10.5, bark_tris=2000, keep=(0.7, 0.35, 0.18)),
    },
    # buildings: scaled to a real height, sat on the ground (slabs dropped), boxes from the bounds
    "buildings": {
        "rb_flats": dict(file="apartment_block_8k", height=27, tris=24000, atlas=4096, forward="-x", variants=None, drop_ground=True, col_lift=0, strip=None),
        "rb_residential": dict(file="old_residential_building", height=21, tris=40000, weld=False, planar=False, atlas=4096, forward="+y", variants=None, drop_ground=True, col_lift=0, strip=None),
        "rb_shop": dict(file="old_shop_building", height=4.6, tris=14000, atlas=2048, forward="-y", variants=None, drop_ground=True, col_lift=0, strip=None),
        "rb_coop": dict(file="coop_house_kenya", height=72, tris=26000, atlas=4096, forward="-y", variants=None, drop_ground=True, col_lift=0, strip=None),
        "rb_office_a": dict(file="office_corporate", height=96, tris=24000, atlas=4096, forward="-y", variants=None, drop_ground=True, col_lift=0, strip=None),
        "rb_office_b": dict(file="office_skyscraper", height=80, tris=24000, atlas=4096, forward="-y", variants=None, drop_ground=True, col_lift=0, strip=None),
        "rb_tower": dict(file="skyscraper_glass", height=150, tris=20000, atlas=4096, forward="-y", variants=None, drop_ground=True, col_lift=0, strip=None),
    },
}

os.makedirs(CACHE, exist_ok=True)
os.makedirs(OUT, exist_ok=True)


def log(*a):
    print("[real]", *a, flush=True)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = 1
    sc.render.bake.margin = 4


def strip_parts(meshes, pattern):
    """Delete faces of hidden interior materials (airbags, door cards...): they eat the triangle
    budget and poke through thin body panels once decimated."""
    n = 0
    for o in meshes:
        bad = {i for i, m in enumerate(o.data.materials) if m and re.search(pattern, m.name, re.I)}
        if not bad:
            continue
        bm = bmesh.new()
        bm.from_mesh(o.data)
        dead = [f for f in bm.faces if f.material_index in bad]
        n += len(dead)
        bmesh.ops.delete(bm, geom=dead, context="FACES")
        bm.to_mesh(o.data)
        bm.free()
    log(f"  stripped {n} hidden interior faces")
    return [o for o in meshes if len(o.data.polygons)]


def reduce_parts(meshes, target, exterior=PAINT, weld=True):
    """Weld and decimate every part on its own before joining: one collapse over a joined
    1M-triangle model tears thin panels apart. Painted exterior panels get 3x the share of the
    budget (they are what the player sees; heavily collapsed door skins let the inner skin poke
    through), cabin/mechanical parts get half."""
    lo, hi = Vector((1e18,) * 3), Vector((-1e18,) * 3)
    for o in meshes:  # from the vertex data: o.dimensions is stale after data.transform()
        for v in o.data.vertices:
            lo = Vector(map(min, lo, v.co))
            hi = Vector(map(max, hi, v.co))
    tol = max(hi - lo) * 1e-5
    counts, weights = [], []
    for o in meshes:
        if weld:
            bm = bmesh.new()
            bm.from_mesh(o.data)
            bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=tol)
            bm.to_mesh(o.data)
            bm.free()
        o.data.calc_loop_triangles()
        counts.append(len(o.data.loop_triangles))
        names = " ".join(m.name for m in o.data.materials if m)
        weights.append(3.0 if re.search(exterior, names, re.I) else 0.5 if re.search(r"leather|seat|carpet|dash|int_|interior|engine|brake|bracket|button", names, re.I) else 1.0)
    total = sum(counts)
    if total <= target:
        return
    k = target / max(1, sum(n * w for n, w in zip(counts, weights)))
    for o, n, w in zip(meshes, counts, weights):
        r = min(1.0, k * w)
        if n < 120 or r >= 0.98:
            continue
        mod = o.modifiers.new("dec", "DECIMATE")
        mod.ratio = max(r, 40 / n)
        mod.use_collapse_triangulate = True
        with bpy.context.temp_override(object=o, active_object=o, selected_objects=[o]):
            bpy.ops.object.modifier_apply(modifier=mod.name)
    log(f"  per-part reduce {total} -> ~{int(target)} tris over {len(meshes)} parts")


def import_joined(path, target=None, strip=r"airbag", exterior=PAINT, weld=True, texfix=None, recalc=False):
    """Import a GLB, bake every transform into the mesh data, join into one object."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    objs = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in objs if o.type == "MESH" and len(o.data.polygons)]
    for o in meshes:
        mw = o.matrix_world.copy()
        o.parent = None
        o.matrix_world = mw
    for o in objs:
        if o not in meshes:
            bpy.data.objects.remove(o, do_unlink=True)
    # instanced meshes (shared data) must become single-user before applying transforms
    for o in meshes:
        if o.data.users > 1:
            o.data = o.data.copy()
        o.data.transform(o.matrix_world)
        o.matrix_world = Matrix.Identity(4)
    # texture fixes: replace a source image (e.g. paint out real-world lettering) before baking
    for img_name, fix in (texfix or {}).items():
        img = bpy.data.images.get(img_name)
        if img:
            # the source image is packed in the GLB: point every texture node at the fixed copy
            new = bpy.data.images.load(os.path.join(CACHE, "texfix", fix), check_existing=True)
            for m in bpy.data.materials:
                if m.use_nodes:
                    for n in m.node_tree.nodes:
                        if n.type == "TEX_IMAGE" and n.image == img:
                            n.image = new
            log(f"  texture {img_name} <- {fix}")
    if recalc:
        # inconsistent face winding in the source: make every part's faces point outward
        for o in meshes:
            bm = bmesh.new()
            bm.from_mesh(o.data)
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
            bm.to_mesh(o.data)
            bm.free()
    if strip:
        keep = strip_parts(meshes, strip)
        for o in meshes:
            if o not in keep:
                bpy.data.objects.remove(o, do_unlink=True)
        meshes = keep
    if target:
        reduce_parts(meshes, target * 1.15, exterior, weld)
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    # every texture lookup must name the ORIGINAL uv map explicitly: the atlas map becomes active
    uv0 = ob.data.uv_layers[0].name if ob.data.uv_layers else None
    for m in ob.data.materials:
        if not m or not m.use_nodes:
            continue
        nt = m.node_tree
        for n in list(nt.nodes):
            if n.type == "TEX_IMAGE" and not n.inputs["Vector"].is_linked and uv0:
                uvn = nt.nodes.new("ShaderNodeUVMap")
                uvn.uv_map = uv0
                nt.links.new(uvn.outputs["UV"], n.inputs["Vector"])
            if n.type == "UVMAP" and not n.uv_map and uv0:
                n.uv_map = uv0
    return ob


def drop_ground(ob):
    """Buildings often ship on a ground slab or a lawn disc: delete the big flat faces at the very
    bottom (the world has its own ground), so the footprint and collider fit the building."""
    zs = [v.co.z for v in ob.data.vertices]
    z0, z1 = min(zs), max(zs)
    eps = (z1 - z0) * 0.02
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    dead = [f for f in bm.faces if all(v.co.z < z0 + eps for v in f.verts) and abs(f.normal.z) > 0.9]
    bmesh.ops.delete(bm, geom=dead, context="FACES")
    loose = [v for v in bm.verts if not v.link_faces]
    bmesh.ops.delete(bm, geom=loose, context="VERTS")
    bm.to_mesh(ob.data)
    bm.free()
    log(f"  dropped {len(dead)} ground faces")


def normalise(ob, cfg):
    """Forward -> -Y, scale to real length, centred on X/Y, wheels on z = 0."""
    rot = {"-y": 0.0, "+y": math.pi, "-x": -math.pi / 2, "+x": math.pi / 2}[cfg["forward"]]
    if rot:
        ob.data.transform(Matrix.Rotation(rot, 4, "Z"))
    xs = [v.co.x for v in ob.data.vertices]
    ys = [v.co.y for v in ob.data.vertices]
    zs = [v.co.z for v in ob.data.vertices]
    k = cfg["height"] / (max(zs) - min(zs)) if "height" in cfg else cfg["length"] / (max(ys) - min(ys))
    c = Vector(((max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2, min(zs)))
    ob.data.transform(Matrix.Scale(k, 4) @ Matrix.Translation(-c))
    ob.data.update()
    d = ob.dimensions
    log(f"  scaled x{k:.3f} -> {d.x:.2f} W x {d.y:.2f} L x {d.z:.2f} H m")


def split_glass(ob, extra=None):
    """Separate faces whose material looks like glass (by name or transmission/alpha)."""
    glassy = set()
    for i, m in enumerate(ob.data.materials):
        if not m:
            continue
        bsdf = m.node_tree.nodes.get("Principled BSDF") if m.use_nodes else None
        alpha = bsdf.inputs["Alpha"].default_value if bsdf else 1.0
        trans = bsdf.inputs["Transmission Weight"].default_value if bsdf else 0.0
        if re.search(GLASS, m.name, re.I) or (extra and re.search(extra, m.name, re.I)) or trans > 0.5 or (alpha < 0.6 and m.blend_method != "OPAQUE"):
            glassy.add(i)
    if not glassy:
        return None
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode="EDIT")
    bm = bmesh.from_edit_mesh(ob.data)
    for f in bm.faces:
        f.select = f.material_index in glassy
    bmesh.update_edit_mesh(ob.data)
    bpy.ops.mesh.separate(type="SELECTED")
    bpy.ops.object.mode_set(mode="OBJECT")
    glass = [o for o in bpy.context.selected_objects if o != ob][0]
    mat = bpy.data.materials.get("vehicle_glass_tint") or bpy.data.materials.new("vehicle_glass_tint")
    mat.use_nodes = True
    b = mat.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (0.04, 0.05, 0.06, 1)
    b.inputs["Roughness"].default_value = 0.06
    b.inputs["Metallic"].default_value = 0.1
    glass.data.materials.clear()
    glass.data.materials.append(mat)
    return glass


def clean(ob, planar=True):
    """Weld split vertices (Sketchfab exports split at every hard edge: collapse then tears the
    surface) and dissolve flat panels, before the real decimation."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0008)
    if planar:
        bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(1.5), use_dissolve_boundaries=False,
                                 verts=bm.verts, edges=bm.edges, delimit={"MATERIAL", "UV"})
        bmesh.ops.triangulate(bm, faces=bm.faces, quad_method="BEAUTY", ngon_method="EAR_CLIP")
    bm.to_mesh(ob.data)
    bm.free()


def decimate(ob, target):
    n = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    if n <= target:
        return
    mod = ob.modifiers.new("dec", "DECIMATE")
    mod.ratio = target / n
    mod.use_collapse_triangulate = True
    with bpy.context.temp_override(object=ob, active_object=ob, selected_objects=[ob]):
        bpy.ops.object.modifier_apply(modifier=mod.name)


def tris(ob):
    ob.data.calc_loop_triangles()
    return len(ob.data.loop_triangles)


def atlas_uv(ob):
    uv = ob.data.uv_layers.new(name="atlas")
    ob.data.uv_layers.active = uv
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.0, area_weight=0.0, scale_to_bounds=False)
    # tight packing: smart-project's own packing wastes most of the atlas on thousands of islands
    bpy.ops.uv.average_islands_scale()
    bpy.ops.uv.pack_islands(rotate=True, margin=0.0015, shape_method="CONCAVE")
    bpy.ops.object.mode_set(mode="OBJECT")
    return uv


def auto_paint(ob):
    """Regex for the body-paint material: the one covering the most flank area (side-facing faces
    between 35% and 85% of the height), for models whose material names say nothing."""
    zs = [v.co.z for v in ob.data.vertices]
    z0, z1 = min(zs), max(zs)
    area = {}
    for p in ob.data.polygons:
        h = (p.center.z - z0) / max(1e-6, z1 - z0)
        if abs(p.normal.x) > 0.6 and 0.35 < h < 0.85:
            m = ob.data.materials[p.material_index]
            if m and not re.search(GLASS, m.name, re.I):
                area[m.name] = area.get(m.name, 0) + p.area
    if not area:
        return PAINT
    name = max(area, key=area.get)
    log(f"  auto paint material: {name}")
    return "^" + re.escape(name) + "$"


def paint_as_clearcoat(ob, paint):
    """Car paint reads as a dielectric under clear-coat: fully metallic paint mirrors the sky grey."""
    for m in ob.data.materials:
        if not m or not m.use_nodes or not re.search(paint, m.name, re.I):
            continue
        b = m.node_tree.nodes.get("Principled BSDF")
        if not b:
            continue
        if b.inputs["Metallic"].is_linked:
            m.node_tree.links.remove(b.inputs["Metallic"].links[0])
        b.inputs["Metallic"].default_value = 0.15
        if b.inputs["Roughness"].is_linked:
            m.node_tree.links.remove(b.inputs["Roughness"].links[0])
        b.inputs["Roughness"].default_value = 0.32


def tint_paint(ob, rgb, paint=PAINT):
    """Recolour car-paint materials (multiplies textured paint, replaces flat paint)."""
    for m in ob.data.materials:
        if not m or not m.use_nodes or not re.search(paint, m.name, re.I):
            continue
        b = m.node_tree.nodes.get("Principled BSDF")
        if not b:
            continue
        sock = b.inputs["Base Color"]
        if sock.is_linked:
            mix = m.node_tree.nodes.new("ShaderNodeMix")
            mix.data_type = "RGBA"
            mix.blend_type = "MULTIPLY"
            mix.inputs["Factor"].default_value = 1.0
            m.node_tree.links.new(sock.links[0].from_socket, mix.inputs[6])
            mix.inputs[7].default_value = (*[min(1.0, c * 1.6) for c in rgb], 1)
            m.node_tree.links.new(mix.outputs[2], sock)
        else:
            sock.default_value = (*rgb, 1)


def apply_livery(ob, image_path):
    """Project a side livery (front at the image's left edge, roof at the top) onto both flanks of
    the paint materials. The right-hand flank is mirrored so lettering always reads forwards."""
    xs = [v.co.x for v in ob.data.vertices]
    ys = [v.co.y for v in ob.data.vertices]
    zs = [v.co.z for v in ob.data.vertices]
    L, Hh, y0 = max(ys) - min(ys), max(zs) - min(zs), min(ys)
    img = bpy.data.images.load(image_path, check_existing=True)
    for m in ob.data.materials:
        if not m or not m.use_nodes or not re.search(PAINT, m.name, re.I):
            continue
        nt = m.node_tree
        b = nt.nodes.get("Principled BSDF")
        if not b:
            continue
        N = nt.nodes.new
        geo = N("ShaderNodeNewGeometry")
        sp = N("ShaderNodeSeparateXYZ")
        nt.links.new(geo.outputs["Position"], sp.inputs[0])
        sn = N("ShaderNodeSeparateXYZ")
        nt.links.new(geo.outputs["Normal"], sn.inputs[0])

        def math_node(op, a, bb=None, c=None):
            n = N("ShaderNodeMath")
            n.operation = op
            for i, v in enumerate((a, bb, c)):
                if v is None:
                    continue
                if isinstance(v, (int, float)):
                    n.inputs[i].default_value = v
                else:
                    nt.links.new(v, n.inputs[i])
            return n.outputs[0]

        u = math_node("MULTIPLY_ADD", sp.outputs["Y"], 1.0 / L, -y0 / L)  # 0 at the front
        side = math_node("GREATER_THAN", sn.outputs["X"], 0.0)  # +X = left (passenger) flank
        u_m = math_node("SUBTRACT", 1.0, u)
        # u' = side ? u : 1-u  ==  u_m + side * (u - u_m)
        u2 = math_node("MULTIPLY_ADD", side, math_node("SUBTRACT", u, u_m), u_m)
        v = math_node("MULTIPLY", sp.outputs["Z"], 1.0 / Hh)
        uv = N("ShaderNodeCombineXYZ")
        nt.links.new(u2, uv.inputs[0])
        nt.links.new(v, uv.inputs[1])
        tex = N("ShaderNodeTexImage")
        tex.image = img
        tex.extension = "EXTEND"
        nt.links.new(uv.outputs[0], tex.inputs["Vector"])
        fac = math_node("MULTIPLY_ADD", math_node("ABSOLUTE", sn.outputs["X"]), 4.0, -2.2)
        fac.node.use_clamp = True
        mix = N("ShaderNodeMix")
        mix.data_type = "RGBA"
        nt.links.new(fac, mix.inputs["Factor"])
        sock = b.inputs["Base Color"]
        if sock.is_linked:
            nt.links.new(sock.links[0].from_socket, mix.inputs[6])
        else:
            mix.inputs[6].default_value = sock.default_value
        nt.links.new(tex.outputs["Color"], mix.inputs[7])
        nt.links.new(mix.outputs[2], sock)
        # liveried flanks are glossy paint, not chrome
        b.inputs["Metallic"].default_value = 0.0 if not b.inputs["Metallic"].is_linked else b.inputs["Metallic"].default_value
        if not b.inputs["Roughness"].is_linked:
            b.inputs["Roughness"].default_value = min(b.inputs["Roughness"].default_value, 0.3)


def livery_faces(ob, faces, image_path, mat_name, min_nx=0.62):
    """Flank faces of the paint get their own material with the side livery, planar-projected
    (sharp lettering: the shared atlas has too few pixels per metre for text)."""
    me = ob.data
    ys = [v.co.y for v in me.vertices]
    zs = [v.co.z for v in me.vertices]
    L, Hh, y0 = max(ys) - min(ys), max(zs) - min(zs), min(ys)
    mat = bpy.data.materials.new(mat_name)
    mat.use_nodes = True
    nt = mat.node_tree
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = bpy.data.images.load(image_path, check_existing=True)
    t.extension = "EXTEND"
    uvn = nt.nodes.new("ShaderNodeUVMap")
    uvn.uv_map = "atlas"
    nt.links.new(uvn.outputs["UV"], t.inputs["Vector"])
    b = nt.nodes["Principled BSDF"]
    nt.links.new(t.outputs["Color"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.28
    b.inputs["Metallic"].default_value = 0.0
    me.materials.append(mat)
    idx = len(me.materials) - 1
    uv = me.uv_layers["atlas"].data
    n = 0
    for fi in faces:
        p = me.polygons[fi]
        nx = p.normal.x
        if abs(nx) < min_nx:
            continue
        p.material_index = idx
        n += 1
        for li in p.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            u = (co.y - y0) / L
            uv[li].uv = ((u if nx > 0 else 1 - u), co.z / Hh)
    log(f"  livery on {n} faces")


def bake_atlas(ob, name, size):
    """Bake colour, roughness and metalness of every material into atlas images (atlas UV)."""
    imgs = {}
    for kind in ("color", "rough", "metal"):
        img = bpy.data.images.new(f"{name}_{kind}", size, size, alpha=False, float_buffer=False)
        img.colorspace_settings.name = "sRGB" if kind == "color" else "Non-Color"
        imgs[kind] = img
    targets = []
    for m in ob.data.materials:
        if not m:
            continue
        if not m.use_nodes:
            m.use_nodes = True
        n = m.node_tree.nodes.new("ShaderNodeTexImage")
        targets.append((m, n))
        m.node_tree.nodes.active = n
    sc = bpy.context.scene
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    ob.data.uv_layers.active = ob.data.uv_layers["atlas"]

    def bake(kind):
        for _, n in targets:
            n.image = imgs[kind]
        if kind == "color":
            sc.render.bake.use_pass_direct = False
            sc.render.bake.use_pass_indirect = False
            sc.render.bake.use_pass_color = True
            bpy.ops.object.bake(type="DIFFUSE", use_clear=True, margin=4)
        elif kind == "rough":
            bpy.ops.object.bake(type="ROUGHNESS", use_clear=True, margin=4)
        else:
            # metalness through the emission pass: wire Metallic into Emission for the bake
            saved = []
            for m, _ in targets:
                b = m.node_tree.nodes.get("Principled BSDF")
                if not b:
                    continue
                src = b.inputs["Metallic"]
                val = src.links[0].from_socket if src.is_linked else None
                e = b.inputs["Emission Color"]
                saved.append((m, b, e.default_value[:], b.inputs["Emission Strength"].default_value, e.links[0].from_socket if e.is_linked else None))
                if e.is_linked:
                    m.node_tree.links.remove(e.links[0])
                if val:
                    m.node_tree.links.new(val, e)
                else:
                    v = src.default_value
                    e.default_value = (v, v, v, 1)
                b.inputs["Emission Strength"].default_value = 1.0
            bpy.ops.object.bake(type="EMIT", use_clear=True, margin=4)
            for m, b, col, stren, link in saved:
                e = b.inputs["Emission Color"]
                if e.is_linked:
                    m.node_tree.links.remove(e.links[0])
                e.default_value = col
                b.inputs["Emission Strength"].default_value = stren
                if link:
                    m.node_tree.links.new(link, e)
        log(f"  baked {kind}")

    for k in ("color", "rough", "metal"):
        bake(k)
    for m, n in targets:
        m.node_tree.nodes.remove(n)
    for k, img in imgs.items():
        img.filepath_raw = os.path.join(CACHE, f"{name}_{k}.png")
        img.file_format = "PNG"
        img.save()
    return imgs


def atlas_material(name, imgs):
    """One PBR material: colour atlas + roughness (G) / metalness (B) packed by the glTF exporter."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    b = nt.nodes["Principled BSDF"]
    uv = nt.nodes.new("ShaderNodeUVMap")
    uv.uv_map = "atlas"

    def tex(img):
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = img
        nt.links.new(uv.outputs["UV"], t.inputs["Vector"])
        return t

    nt.links.new(tex(imgs["color"]).outputs["Color"], b.inputs["Base Color"])
    sep_r = nt.nodes.new("ShaderNodeSeparateColor")
    nt.links.new(tex(imgs["rough"]).outputs["Color"], sep_r.inputs["Color"])
    nt.links.new(sep_r.outputs["Red"], b.inputs["Roughness"])
    sep_m = nt.nodes.new("ShaderNodeSeparateColor")
    nt.links.new(tex(imgs["metal"]).outputs["Color"], sep_m.inputs["Color"])
    nt.links.new(sep_m.outputs["Red"], b.inputs["Metallic"])
    return mat


def finalize(ob, mat):
    """Single material, only the atlas UV map kept (as TEXCOORD_0)."""
    ob.data.materials.clear()
    ob.data.materials.append(mat)
    for p in ob.data.polygons:
        p.material_index = 0
    for uv in list(ob.data.uv_layers):
        if uv.name != "atlas":
            ob.data.uv_layers.remove(uv)


def drop_small(ob, size):
    """Delete loose parts smaller than `size` metres (bolts, badges, wipers): invisible at LOD
    distance, and collapse decimation cannot reduce hundreds of tiny islands."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.faces.ensure_lookup_table()
    seen = set()
    dead = []
    for f0 in bm.faces:
        if f0.index in seen:
            continue
        stack, comp = [f0], []
        seen.add(f0.index)
        while stack:
            f = stack.pop()
            comp.append(f)
            for e in f.edges:
                for g in e.link_faces:
                    if g.index not in seen:
                        seen.add(g.index)
                        stack.append(g)
        vs = {v for f in comp for v in f.verts}
        lo = Vector((min(v.co.x for v in vs), min(v.co.y for v in vs), min(v.co.z for v in vs)))
        hi = Vector((max(v.co.x for v in vs), max(v.co.y for v in vs), max(v.co.z for v in vs)))
        if (hi - lo).length < size:
            dead.extend(comp)
    bmesh.ops.delete(bm, geom=dead, context="FACES")
    bm.to_mesh(ob.data)
    bm.free()


def lod_copy(ob, name, ratio):
    dup = ob.copy()
    dup.data = ob.data.copy()
    dup.name = name
    bpy.context.scene.collection.objects.link(dup)
    if ratio < 1:
        # the copied smooth-by-angle modifier must not sit before the decimation
        for md in list(dup.modifiers):
            dup.modifiers.remove(md)
        before = tris(dup)
        drop_small(dup, 0.12 if ratio > 0.2 else 0.35)
        decimate(dup, max(60, int(before * ratio)))
        with bpy.context.temp_override(object=dup, active_object=dup, selected_objects=[dup], selected_editable_objects=[dup]):
            bpy.ops.object.shade_auto_smooth(angle=math.radians(40))
        log(f"  {name}: {before} -> {tris(dup)} tris")
    return dup


def box_collider(ob, base, lift=0.25):
    xs = [v.co.x for v in ob.data.vertices]
    ys = [v.co.y for v in ob.data.vertices]
    zs = [v.co.z for v in ob.data.vertices]
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    # body only: lift the box off the ground by the tyre gap so the car does not snag kerbs
    lo = min(zs) + lift
    bmesh.ops.scale(bm, vec=(max(xs) - min(xs), max(ys) - min(ys), max(zs) - lo), verts=bm.verts)
    bmesh.ops.translate(bm, vec=((max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2, (max(zs) + lo) / 2), verts=bm.verts)
    me = bpy.data.meshes.new(f"COL_{base}")
    bm.to_mesh(me)
    bm.free()
    col = bpy.data.objects.new(f"COL_{base}", me)
    col["collider"] = "box"
    bpy.context.scene.collection.objects.link(col)
    return col


def build_piece(base, cfg, variant, rgb, store):
    """Build one variant in the current (fresh) scene and save it as a .blend-free GLB part."""
    path = os.path.join(SRC, cfg["file"] + ".glb")
    reset()
    ob = import_joined(path, cfg["tris"] if cfg.get("per_part", True) else None, cfg.get("strip", r"airbag"),
                       cfg.get("clearcoat", cfg.get("paint", PAINT)) if cfg.get("paint") != "auto" else PAINT, cfg.get("weld", True),
                       cfg.get("texfix"), cfg.get("recalc", False))
    if cfg.get("drop_ground"):
        drop_ground(ob)
    normalise(ob, cfg)
    paint = cfg.get("paint", PAINT)
    if paint == "auto":
        paint = auto_paint(ob)
    paint_as_clearcoat(ob, cfg.get("clearcoat", paint))
    if rgb:
        tint_paint(ob, rgb, paint)
    glass = split_glass(ob, cfg.get("glass"))
    clean(ob, cfg.get("planar", True))
    decimate(ob, cfg["tris"])
    if glass:
        decimate(glass, max(400, cfg["tris"] // 8))
    name = f"{base}_{variant}" if cfg["variants"] else base
    log(f"  {name}: body {tris(ob)} tris, glass {tris(glass) if glass else 0}")
    for o in (ob, glass):
        if o:
            for p_ in o.data.polygons:
                p_.use_smooth = True
            with bpy.context.temp_override(object=o, active_object=o, selected_objects=[o], selected_editable_objects=[o]):
                bpy.ops.object.shade_auto_smooth(angle=math.radians(cfg.get("smooth", 40)))
    atlas_uv(ob)
    imgs = bake_atlas(ob, name, cfg["atlas"])
    paint_faces = [p_.index for p_ in ob.data.polygons
                   if ob.data.materials[p_.material_index] and re.search(paint, ob.data.materials[p_.material_index].name, re.I)]
    finalize(ob, atlas_material(f"{name}_atlas", imgs))
    livs = cfg.get("liveries")
    if livs:
        livery_faces(ob, paint_faces, os.path.join(CACHE, livs[variant] + ".png"), f"{name}_livery", cfg.get("livery_nx", 0.62))
    # LOD0 = body + glass under an empty; LOD1/LOD2 decimated copies
    for lod, ratio in ((0, 1.0), (1, 0.3), (2, 0.07)):
        root = bpy.data.objects.new(f"{name}_LOD{lod}", None)
        bpy.context.scene.collection.objects.link(root)
        parts = [ob, glass] if lod == 0 else [lod_copy(ob, f"{name}_body_L{lod}", ratio)] + ([lod_copy(glass, f"{name}_glass_L{lod}", max(ratio, 0.15))] if glass else [])
        for p in parts:
            if p:
                p.parent = root
        if lod == 0:
            ob.name = f"{name}_body_L0"
            if glass:
                glass.name = f"{name}_glass_L0"
    box_collider(ob, name, cfg.get("col_lift", 0.25))
    # export this variant on its own; the kit is merged by tools/merge-kit.mjs
    part = os.path.join(CACHE, f"{name}.glb")
    bpy.ops.export_scene.gltf(filepath=part, export_format="GLB", export_extras=True, export_yup=True, export_apply=True,
                              export_texcoords=True, export_normals=True, export_materials="EXPORT",
                              export_image_format="JPEG", export_jpeg_quality=88, export_animations=False, export_morph=False, export_skins=False)
    store.append(part)
    if PREVIEW:
        preview(name, ob, glass)


def preview(name, ob, glass):
    os.makedirs(PREV, exist_ok=True)
    sc = bpy.context.scene
    for o in sc.objects:
        o.hide_render = not (o == ob or o == glass)
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.data.energy = 3.5
    sun.rotation_euler = (math.radians(50), 0, math.radians(-40))
    sc.collection.objects.link(sun)
    w = bpy.data.worlds.new("w")
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs["Color"].default_value = (0.55, 0.6, 0.7, 1)
    w.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.6
    sc.world = w
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    sc.collection.objects.link(cam)
    sc.camera = cam
    d = ob.dimensions
    r = max(d) * 1.25
    loc = Vector((r * 0.75, -r * 0.85, d.z * 0.9))  # front-left three-quarter view (front = -Y)
    cam.location = loc
    cam.rotation_euler = (Vector((0, 0, d.z * 0.4)) - loc).to_track_quat("-Z", "Y").to_euler()
    sc.render.engine = "BLENDER_EEVEE_NEXT"
    sc.render.resolution_x, sc.render.resolution_y = 960, 600
    sc.render.filepath = os.path.join(PREV, f"{name}.png")
    bpy.ops.render.render(write_still=True)
    sc.render.engine = "CYCLES"


def is_leaf(m):
    if not m or not m.use_nodes:
        return False
    b = m.node_tree.nodes.get("Principled BSDF")
    return bool(b and b.inputs["Alpha"].is_linked) or m.blend_method in ("BLEND", "CLIP", "HASHED") and bool(re.search(r"leaf|leaves|branch|frond|plane|foliage|tree_2|tree_3", m.name, re.I))


def thin_cards(ob, keep, seed=7):
    """Delete a random share of the leaf cards (loose parts of leaf faces): a sparser far crown."""
    if keep >= 0.999:
        return
    import random
    r = random.Random(seed)
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    leaf = {i for i, m in enumerate(ob.data.materials) if m and m.name.endswith("_alpha")}
    seen, dead = set(), []
    bm.faces.ensure_lookup_table()
    for f0 in bm.faces:
        if f0.index in seen or f0.material_index not in leaf:
            continue
        stack, comp = [f0], []
        seen.add(f0.index)
        while stack:
            f = stack.pop()
            comp.append(f)
            for e in f.edges:
                for g in e.link_faces:
                    if g.index not in seen and g.material_index in leaf:
                        seen.add(g.index)
                        stack.append(g)
        if r.random() > keep:
            dead.extend(comp)
    bmesh.ops.delete(bm, geom=dead, context="FACES")
    bm.to_mesh(ob.data)
    bm.free()


def build_tree(base, cfg, store):
    reset()
    ob = import_joined(os.path.join(SRC, cfg["file"] + ".glb"), None, None)
    cfg = dict(cfg, forward="-y")
    normalise(ob, cfg)
    for i, m in enumerate(ob.data.materials):
        if not m:
            continue
        if is_leaf(m):
            m.name = f"foliage_{base}_{i}_alpha"
            m.blend_method = "CLIP"
        else:
            m.name = f"bark_{base}_{i}"
    # decimate the bark only: separate it, collapse, join back
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bark_idx = {i for i, m in enumerate(ob.data.materials) if m and not m.name.endswith("_alpha")}
    has_bark = any(p.material_index in bark_idx for p in ob.data.polygons)
    bpy.ops.object.mode_set(mode="EDIT" if has_bark else "OBJECT")
    bark = []
    if has_bark:
        bm = bmesh.from_edit_mesh(ob.data)
        for f in bm.faces:
            f.select = f.material_index in bark_idx
        bmesh.update_edit_mesh(ob.data)
        bpy.ops.mesh.separate(type="SELECTED")
        bpy.ops.object.mode_set(mode="OBJECT")
        bark = [o for o in bpy.context.selected_objects if o != ob]
    if bark:
        decimate(bark[0], cfg["bark_tris"])
        bpy.ops.object.select_all(action="DESELECT")
        ob.select_set(True)
        bark[0].select_set(True)
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.join()
    for lod, k in enumerate(cfg["keep"]):
        dup = ob if lod == 0 else ob.copy()
        if lod:
            dup.data = ob.data.copy()
            bpy.context.scene.collection.objects.link(dup)
        thin_cards(dup, k, seed=lod + 3)
        if lod and dup is not ob:
            pass
        root = bpy.data.objects.new(f"{base}_LOD{lod}", None)
        bpy.context.scene.collection.objects.link(root)
        dup.name = f"{base}_mesh_L{lod}"
        dup.parent = root
        log(f"  {base} LOD{lod}: {tris(dup)} tris")
    # trunk collider: a thin box at the base
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(0.5, 0.5, 3.0), verts=bm.verts)
    bmesh.ops.translate(bm, vec=(0, 0, 1.5), verts=bm.verts)
    me = bpy.data.meshes.new(f"COL_{base}")
    bm.to_mesh(me)
    bm.free()
    col = bpy.data.objects.new(f"COL_{base}", me)
    col["collider"] = "box"
    bpy.context.scene.collection.objects.link(col)
    part = os.path.join(CACHE, f"{base}.glb")
    bpy.ops.export_scene.gltf(filepath=part, export_format="GLB", export_extras=True, export_yup=True, export_apply=True,
                              export_texcoords=True, export_normals=True, export_materials="EXPORT",
                              export_image_format="AUTO", export_animations=False, export_morph=False, export_skins=False)
    store.append(part)
    if PREVIEW:
        preview(base, bpy.data.objects[f"{base}_mesh_L0"], None)


def main():
    import subprocess
    subprocess.run(["python", os.path.join(ROOT, "tools", "paint_real_liveries.py"), CACHE], check=True)
    parts = []
    for base, cfg in MODELS[KIT].items():
        if ONLY and base not in ONLY:
            continue
        if not os.path.exists(os.path.join(SRC, cfg["file"] + ".glb")):
            log(f"skip {base}: sketchfab/{cfg['file']}.glb not downloaded")
            continue
        log(f"{base} <- {cfg['file']}")
        if KIT == "trees":
            build_tree(base, cfg, parts)
            continue
        variants = cfg["variants"] or [None]
        for i, rgb in enumerate(variants):
            build_piece(base, cfg, i, rgb, parts)
    log("parts:", len(parts))


main()
