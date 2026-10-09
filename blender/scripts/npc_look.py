"""Pedestrian variety (VISUAL_OVERHAUL 19: no clones; Nairobi street dress):
  recolour_outfit()  re-dye a MakeHuman outfit per garment (upper / lower) keeping its fabric detail
  headwrap()         kitenge headwrap (mama mboga, aunties)
  hi_vis_vest()      reflective vest with silver bands (boda boda riders)
"""
import math

import bmesh
import bpy
import numpy as np
from mathutils import Matrix

from abel_look import _armature, _find, _material, _mesh_objects, _rigid_to_bone, _uv_islands, head_frame


def recolour_outfit(part, upper, lower, upper_name, lower_name):
    """Neutralise the garment texture to bright luminance detail, then colour each UV island by
    whether it sits above (upper) or below (lower) the pelvis, via glTF baseColorFactor."""
    ob = _find(part)
    if not ob:
        print(f"[npc] no garment {part}")
        return
    base = ob.material_slots[0].material
    tex = next(n for n in base.node_tree.nodes if n.type == "TEX_IMAGE" and n.image and "diffuse" in n.image.name.lower())
    img = tex.image.copy()
    img.name = f"{upper_name}_{lower_name}_dyed"
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape(h, w, 4)
    lum = px[..., :3].mean(axis=2)
    med = np.median(lum[lum > 0.02]) if (lum > 0.02).any() else 0.4
    detail = np.clip(0.8 * lum / max(med, 1e-3), 0.3, 1.0)
    px[..., :3] = detail[..., None]
    img.pixels.foreach_set(px.ravel())
    img.pack()
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    uv = bm.loops.layers.uv.active
    island = _uv_islands(bm, uv)
    arm = _armature()
    pelvis_z = (arm.matrix_world @ arm.data.bones["pelvis"].head_local).z
    zs = {}
    for f in bm.faces:
        zs.setdefault(island[f.index], []).append((ob.matrix_world @ f.calc_center_median()).z)
    mats = []
    for nm, col in ((upper_name, upper), (lower_name, lower)):
        m = base.copy()
        m.name = nm
        t = next(n for n in m.node_tree.nodes if n.type == "TEX_IMAGE" and n.image == tex.image)
        t.image = img
        bsdf = m.node_tree.nodes["Principled BSDF"]
        mix = m.node_tree.nodes.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        mix.blend_type = "MULTIPLY"
        mix.inputs["Factor"].default_value = 1.0
        m.node_tree.links.new(t.outputs["Color"], mix.inputs[6])
        mix.inputs[7].default_value = (*col, 1)
        m.node_tree.links.new(mix.outputs[2], bsdf.inputs["Base Color"])
        mats.append(m)
    ob.data.materials.clear()
    for m in mats:
        ob.data.materials.append(m)
    for f in bm.faces:
        z = sum(zs[island[f.index]]) / len(zs[island[f.index]])
        f.material_index = 0 if z > pelvis_z - 0.05 else 1
    bm.to_mesh(ob.data)
    bm.free()
    print(f"[npc] dyed {part}: upper {upper_name}, lower {lower_name}")


def _kitenge_material(name, colours, seed):
    """Bold wax-print pattern (circles + bands) as a small tiling texture."""
    size = 256
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:size, 0:size]
    c = np.array(colours, dtype=np.float32)
    idx = ((np.sin(xx / 13.0) + np.cos(yy / 11.0)) > 0).astype(int)
    img_px = c[idx]
    for _ in range(40):  # wax-print dots
        cx, cy, r = rng.integers(0, size), rng.integers(0, size), rng.integers(6, 16)
        d = (xx - cx) ** 2 + (yy - cy) ** 2 < r * r
        img_px[d] = c[2 % len(c)]
    img = bpy.data.images.new(name, size, size)
    px = np.ones((size, size, 4), dtype=np.float32)
    px[..., :3] = img_px
    img.pixels.foreach_set(px.ravel())
    img.pack()
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    t = m.node_tree.nodes.new("ShaderNodeTexImage")
    t.image = img
    b = m.node_tree.nodes["Principled BSDF"]
    m.node_tree.links.new(t.outputs["Color"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.85
    return m


def headwrap(colours=((0.55, 0.05, 0.03), (0.85, 0.55, 0.05), (0.05, 0.25, 0.45)), seed=4):
    """Kitenge headwrap: a tall rounded wrap over the hair with a knot at the front."""
    hf = head_frame()
    for o in _mesh_objects():  # hair goes under the wrap
        if any(k in o.name for k in ("braid", "bob", "long0", "ponytail", "afro", "short0")):
            bpy.data.objects.remove(o, do_unlink=True)
    # size from the skull (eye spacing), not the hair: braids/afros are much wider than the head
    eye_w = abs(hf["eye_l"].x - hf["eye_r"].x)
    cx = hf["eye_mid"].x
    rx = eye_w * 1.62
    ry = rx * 1.28
    cy = hf["eye_front_y"] + ry * 0.92
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=12, radius=1.0)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -0.55], context="VERTS")
    uvl = bm.loops.layers.uv.verify()
    for f in bm.faces:
        for l in f.loops:
            co = l.vert.co
            l[uvl].uv = (math.atan2(co.y, co.x) * 2, co.z * 2)
    for v in bm.verts:
        v.co.x *= rx
        v.co.y *= ry
        # wrapped crown: lower half hugs the skull down to the brow and nape; modest height on top
        v.co.z = v.co.z * (0.09 if v.co.z > 0 else 0.07) + 0.02 * max(0.0, v.co.z) ** 2
    knot = bmesh.new()
    bmesh.ops.create_icosphere(knot, subdivisions=2, radius=0.03)
    tmp = bpy.data.meshes.new("t")
    knot.to_mesh(tmp)
    knot.free()
    tmp.transform(Matrix.Translation((0, -ry * 0.95, 0.07)))
    bm.from_mesh(tmp)
    bpy.data.meshes.remove(tmp)
    me = bpy.data.meshes.new("headwrap")
    bm.to_mesh(me)
    bm.free()
    me.materials.append(_kitenge_material(f"kitenge_{seed}", colours, seed))
    for p in me.polygons:
        p.use_smooth = True
    ob = bpy.data.objects.new("headwrap", me)
    bpy.context.scene.collection.objects.link(ob)
    ob.data.transform(Matrix.Translation((cx, cy, hf["eye_mid"].z + 0.068)))  # band just above the brows
    _rigid_to_bone(ob)
    print("[npc] kitenge headwrap")


def hi_vis_vest(part):
    """Boda rider's reflective vest: a shell over the torso of the upper garment, fluorescent
    yellow-green with two silver retro-reflective bands."""
    ob = _find(part)
    if not ob:
        return
    arm = _armature()
    mw = arm.matrix_world
    pelvis_z = (mw @ arm.data.bones["pelvis"].head_local).z
    neck_z = (mw @ arm.data.bones["neck_01"].head_local).z
    sh_x = abs((mw @ arm.data.bones["upperarm_l"].head_local).x) * 0.92
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    omw = ob.matrix_world
    keep = {v.index for v in bm.verts if pelvis_z - 0.02 < (omw @ v.co).z < neck_z - 0.04 and abs((omw @ v.co).x) < sh_x}
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.index not in keep], context="VERTS")
    bm.normal_update()
    for v in bm.verts:
        v.co += v.normal * 0.008
    while bm.loops.layers.uv:
        bm.loops.layers.uv.remove(bm.loops.layers.uv[0])
    uvl = bm.loops.layers.uv.new("UVMap")
    for f in bm.faces:
        for l in f.loops:
            z = (omw @ l.vert.co).z
            l[uvl].uv = (0.5, (z - pelvis_z) / max(0.01, neck_z - pelvis_z))
    me = bpy.data.meshes.new("hivis_vest")
    bm.to_mesh(me)
    bm.free()
    size = 64
    px = np.ones((size, size, 4), dtype=np.float32)
    px[..., 0], px[..., 1], px[..., 2] = 0.75, 0.95, 0.05  # fluorescent yellow-green
    for lo, hi in ((0.22, 0.30), (0.52, 0.60)):  # silver reflective bands
        px[int(lo * size):int(hi * size), :, :3] = 0.82
    img = bpy.data.images.new("hivis", size, size)
    img.pixels.foreach_set(px.ravel())
    img.pack()
    m = bpy.data.materials.new("hivis_vest")
    m.use_nodes = True
    t = m.node_tree.nodes.new("ShaderNodeTexImage")
    t.image = img
    b = m.node_tree.nodes["Principled BSDF"]
    m.node_tree.links.new(t.outputs["Color"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.6
    me.materials.append(m)
    vest = bpy.data.objects.new("hivis_vest", me)
    bpy.context.scene.collection.objects.link(vest)
    vest.matrix_world = omw.copy()
    # keep the garment's own skin weights (deform layer indices map to these names, in order),
    # so the vest bends with the torso instead of being glued to one bone
    for g in ob.vertex_groups:
        vest.vertex_groups.new(name=g.name)
    vest.parent = _armature()
    vest.matrix_world = omw.copy()
    mod = vest.modifiers.new("Armature", "ARMATURE")
    mod.object = _armature()
    print(f"[npc] hi-vis vest: {len(me.vertices)} verts")


# ----------------------------------------------------------------------------- Mkurugenzi merch
_CACHE = None


def _png(name):
    """RGBA float array (rows bottom-up, like Blender) of a file painted by tools/paint_merch.py."""
    import os
    global _CACHE
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "cache"))
    im = bpy.data.images.load(os.path.join(root, name), check_existing=True)
    w, h = im.size
    a = np.empty(w * h * 4, dtype=np.float32)
    im.pixels.foreach_get(a)
    return a.reshape(h, w, 4)


def _chest_frame(ob, chest_z):
    """UV centre of the garment's front at chest height, and the 2x2 map from local surface
    metres (x right as seen from the front, z up) to UV, from the nearest front-facing face."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.transform(ob.matrix_world)
    bm.faces.ensure_lookup_table()
    uv = bm.loops.layers.uv.active
    front = [f for f in bm.faces if f.normal.y < -0.6 and abs(f.calc_center_median().x) < 0.12]
    if not front:
        bm.free()
        return None
    ymin = min(f.calc_center_median().y for f in front)
    best = min(front, key=lambda f: (f.calc_center_median().z - chest_z) ** 2 + (f.calc_center_median().x) ** 2 * 4
               + (f.calc_center_median().y - ymin) ** 2)
    ls = best.loops[:3]
    p = [np.array((l.vert.co.x, l.vert.co.z)) for l in ls]
    t = [np.array(tuple(l[uv].uv)) for l in ls]
    dP = np.stack([p[1] - p[0], p[2] - p[0]], axis=1)
    dT = np.stack([t[1] - t[0], t[2] - t[0]], axis=1)
    J = dT @ np.linalg.inv(dP)  # d(uv) / d(x, z)
    c = best.calc_center_median()
    cuv = t[0] + J @ (np.array((c.x, c.z)) - p[0])
    bm.free()
    return cuv, J


def _stamp(px, art, cuv, J, size, centre_dx=0.0, centre_dz=0.0):
    """Blend RGBA `art` (bottom-up rows) onto image px around cuv; art spans size metres."""
    h, w, _ = px.shape
    Ji = np.linalg.inv(J)
    corners = [J @ np.array((sx * size / 2 + centre_dx, sz * size / 2 + centre_dz)) for sx in (-1, 1) for sz in (-1, 1)]
    us = [cuv[0] + c[0] for c in corners]
    vs = [cuv[1] + c[1] for c in corners]
    x0, x1 = max(0, int(min(us) * w) - 1), min(w, int(max(us) * w) + 2)
    y0, y1 = max(0, int(min(vs) * h) - 1), min(h, int(max(vs) * h) + 2)
    if x1 <= x0 or y1 <= y0:
        return
    yy, xx = np.mgrid[y0:y1, x0:x1]
    du = (xx + 0.5) / w - cuv[0]
    dv = (yy + 0.5) / h - cuv[1]
    dx = Ji[0, 0] * du + Ji[0, 1] * dv - centre_dx
    dz = Ji[1, 0] * du + Ji[1, 1] * dv - centre_dz
    S = art.shape[0]
    lx = ((dx / size + 0.5) * S).astype(int)
    lz = ((dz / size + 0.5) * S).astype(int)  # art rows are bottom-up like z
    ok = (lx >= 0) & (lx < S) & (lz >= 0) & (lz < S)
    a = np.zeros_like(du)
    rgb = np.zeros(du.shape + (3,))
    a[ok] = art[lz[ok], lx[ok], 3]
    rgb[ok] = art[lz[ok], lx[ok], :3]
    region = px[y0:y1, x0:x1, :3]
    px[y0:y1, x0:x1, :3] = region * (1 - a[..., None]) + rgb * a[..., None]


def merch_outfit(part, upper, lower, name, logo="merch_logo_white.png", pattern=None, logo_size=0.16, plain=0.75):
    """Dress a garment in the Mkurugenzi range: flat fabric colours baked into the texture (upper
    garment islands vs lower, split at the pelvis), optional all-over print, MK mark on the chest."""
    ob = _find(part)
    if not ob:
        print(f"[npc] no garment {part}")
        return
    base = ob.material_slots[0].material
    tex = next(n for n in base.node_tree.nodes if n.type == "TEX_IMAGE" and n.image and "diffuse" in n.image.name.lower())
    src = tex.image
    w, h = src.size
    px = np.empty(w * h * 4, dtype=np.float32)
    src.pixels.foreach_get(px)
    px = px.reshape(h, w, 4)
    lum = px[..., :3].mean(axis=2)
    med = np.median(lum[lum > 0.02]) if (lum > 0.02).any() else 0.4
    # plain merch fabric: keep only gentle folds/seams, wash out the stock print
    detail = plain + (1 - plain) * np.clip(lum / max(med, 1e-3), 0.4, 1.2)
    arm = _armature()
    pelvis_z = (arm.matrix_world @ arm.data.bones["pelvis"].head_local).z
    frame = _chest_frame(ob, pelvis_z + 0.42)
    out = []
    for nm, col, is_upper in ((f"{name}_top", upper, True), (f"{name}_bottom", lower, False)):
        img = bpy.data.images.new(f"{nm}_dyed", w, h, alpha=True)
        p = np.empty_like(px)
        p[..., 3] = 1.0
        p[..., :3] = detail[..., None] * np.array(col)[None, None, :]
        if is_upper and pattern:
            pat = _png(pattern)
            ph, pw = pat.shape[:2]
            yy, xx = np.mgrid[0:h, 0:w]
            tile = pat[(yy * 2) % ph, (xx * 2) % pw, 0]
            p[..., :3] *= (0.78 + 0.22 * tile)[..., None]
        if is_upper and logo and frame:
            _stamp(p, _png(logo), frame[0], frame[1], logo_size, centre_dz=0.02)
        img.pixels.foreach_set(p.ravel())
        img.pack()
        m = base.copy()
        m.name = nm
        t = next(n for n in m.node_tree.nodes if n.type == "TEX_IMAGE" and n.image == src)
        t.image = img
        out.append(m)
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    uv = bm.loops.layers.uv.active
    island = _uv_islands(bm, uv)
    zs = {}
    for f in bm.faces:
        zs.setdefault(island[f.index], []).append((ob.matrix_world @ f.calc_center_median()).z)
    ob.data.materials.clear()
    for m in out:
        ob.data.materials.append(m)
    for f in bm.faces:
        z = sum(zs[island[f.index]]) / len(zs[island[f.index]])
        f.material_index = 0 if z > pelvis_z - 0.05 else 1
    bm.to_mesh(ob.data)
    bm.free()
    print(f"[npc] merch {part}: {name} (logo {'yes' if frame else 'NO FRONT FACE'})")
