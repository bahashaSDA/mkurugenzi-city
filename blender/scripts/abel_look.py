"""Abel's signature look, built from the reference photo supplied by the project owner
(brown tweed jacket, white shirt + dark tie, white pocket square, flat cap, round glasses,
trimmed beard and moustache, beaded bracelet). Reference only: nothing is copied from the photo
into the build; colours and shapes are matched by eye.

Also cull_hidden_body(): deletes body-proxy skin that sits under clothes, so skin can never poke
through jeans/sleeves when joints bend (the "knees through the trousers" bug).
"""
import math

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree


# ----------------------------------------------------------------------------- helpers
def _mesh_objects():
    return [o for o in bpy.data.objects if o.type == "MESH" and o.visible_get() and not o.name.endswith(".body")]


def _find(part):
    return next((o for o in _mesh_objects() if part in o.name), None)


def _armature():
    return next(o for o in bpy.data.objects if o.type == "ARMATURE")


def _world_verts(o):
    return [o.matrix_world @ v.co for v in o.data.vertices]


def _rigid_to_bone(ob, bone="head"):
    """Skin a new accessory rigidly to one bone (vertex group weight 1 + armature modifier)."""
    arm = _armature()
    ob.parent = arm
    vg = ob.vertex_groups.new(name=bone)
    vg.add(list(range(len(ob.data.vertices))), 1.0, "REPLACE")
    mod = ob.modifiers.new("Armature", "ARMATURE")
    mod.object = arm


def _material(name, rgb, rough=0.6, metal=0.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    return m


def _new_obj(name, bm, mat):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    for p in me.polygons:
        p.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


# ----------------------------------------------------------------------------- anatomy probes
def head_frame():
    """Eye centres and head extents from the actual meshes (rest pose, Blender Z-up, front -Y)."""
    eyes = _find("low-poly")
    vs = _world_verts(eyes)
    left = [v for v in vs if v.x > 0]
    right = [v for v in vs if v.x <= 0]
    el = sum(left, Vector()) / len(left)
    er = sum(right, Vector()) / len(right)
    hair = _find("short0") or _find("afro") or _find("braid")
    hv = _world_verts(hair) if hair else vs
    return {
        "eye_l": el, "eye_r": er, "eye_mid": (el + er) / 2,
        "eye_front_y": min(v.y for v in vs),
        "top": max(v.z for v in hv), "head_xmin": min(v.x for v in hv), "head_xmax": max(v.x for v in hv),
        "head_ymin": min(v.y for v in hv), "head_ymax": max(v.y for v in hv),
    }


# ----------------------------------------------------------------------------- outfit recolour
def _uv_islands(bm, uv):
    """Connected UV islands (faces sharing an edge with matching UVs)."""
    parent = list(range(len(bm.faces)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i
    bm.faces.ensure_lookup_table()
    for e in bm.edges:
        fs = e.link_faces
        if len(fs) != 2:
            continue
        a, b = fs

        def uvs(f):
            return {l.vert.index: tuple(round(c, 5) for c in l[uv].uv) for l in f.loops if l.vert in e.verts}
        if uvs(a) == uvs(b):
            ra, rb = find(a.index), find(b.index)
            if ra != rb:
                parent[ra] = rb
    return [find(f.index) for f in bm.faces]


def recolour_suit():
    """male_elegantsuit01 (grey suit) -> Abel's look: brown tweed jacket, charcoal-brown trousers,
    dark brown tie, white shirt. Cloth pixels become a bright neutral tweed weave; garment colour
    comes from per-garment material factors (glTF baseColorFactor). Each UV island is assigned to
    jacket / trousers / shirt / tie by where it sits on the body and what the texture shows."""
    suit = _find("elegantsuit")
    if not suit:
        return
    base_mat = suit.material_slots[0].material
    nt = base_mat.node_tree
    tex = next(n for n in nt.nodes if n.type == "TEX_IMAGE" and n.image and "diffuse" in n.image.name.lower())
    img = tex.image
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape(h, w, 4)
    rgb = px[..., :3].copy()
    lum = rgb.mean(axis=2)

    bm = bmesh.new()
    bm.from_mesh(suit.data)
    uv = bm.loops.layers.uv.active
    island = _uv_islands(bm, uv)
    mw = suit.matrix_world
    arm = _armature()
    pelvis_z = (arm.matrix_world @ arm.data.bones["pelvis"].head_local).z
    stats = {}
    for f in bm.faces:
        c = mw @ f.calc_center_median()
        u = sum(l[uv].uv.x for l in f.loops) / len(f.loops)
        v = sum(l[uv].uv.y for l in f.loops) / len(f.loops)
        xi = min(w - 1, max(0, int(u % 1.0 * w)))
        yi = min(h - 1, max(0, int(v % 1.0 * h)))
        r, g, b = rgb[yi, xi]
        st = stats.setdefault(island[f.index], {"z": [], "lum": [], "blue": []})
        st["z"].append(c.z)
        st["lum"].append(float((r + g + b) / 3))
        st["blue"].append(float(b - r))
    kind = {}
    for k, st in stats.items():
        zm = sum(st["z"]) / len(st["z"])
        lm = sum(st["lum"]) / len(st["lum"])
        bl = sum(st["blue"]) / len(st["blue"])
        if bl > 0.04:
            kind[k] = 3  # tie
        elif lm > 0.42:
            kind[k] = 2  # shirt
        elif zm < pelvis_z - 0.05:
            kind[k] = 1  # trousers
        else:
            kind[k] = 0  # jacket
    factors = [(0.30, 0.135, 0.055), (0.050, 0.042, 0.036), (1.0, 1.0, 1.0), (0.11, 0.05, 0.022)]
    names = ["abel_jacket_tweed", "abel_trousers", "abel_shirt", "abel_tie"]
    mats = []
    for nm, fac in zip(names, factors):
        m = base_mat.copy()
        m.name = nm
        bsdf = m.node_tree.nodes["Principled BSDF"]
        t = next(n for n in m.node_tree.nodes if n.type == "TEX_IMAGE" and n.image == img)
        mix = m.node_tree.nodes.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        mix.blend_type = "MULTIPLY"
        mix.inputs["Factor"].default_value = 1.0
        m.node_tree.links.new(t.outputs["Color"], mix.inputs[6])
        mix.inputs[7].default_value = (*fac, 1)
        m.node_tree.links.new(mix.outputs[2], bsdf.inputs["Base Color"])
        bsdf.inputs["Roughness"].default_value = 0.85 if nm != "abel_shirt" else 0.6
        mats.append(m)
    suit.data.materials.clear()
    for m in mats:
        suit.data.materials.append(m)
    for f in bm.faces:
        f.material_index = kind[island[f.index]]
    bm.to_mesh(suit.data)
    bm.free()

    yy, xx = np.mgrid[0:h, 0:w]
    rng = np.random.default_rng(7)
    noise = rng.normal(1.0, 0.06, (h, w))
    herring = 1 + 0.07 * np.sign(np.sin((xx + np.abs((yy % 16) - 8)) * 1.1))
    shade = np.clip(lum / 0.16, 0.9, 1.08)  # ignore baked dark blocks in the source texture
    cloth = lum < 0.30
    weave = np.clip(0.82 * shade * noise * herring, 0, 1)
    blue = (rgb[..., 2] - rgb[..., 0]) > 0.04
    out = rgb.copy()
    out[cloth] = weave[cloth][:, None]
    # tie (blue stripes in the source) -> dark brown silk with a subtle diagonal pattern
    tie_pat = 1 + 0.25 * np.sign(np.sin((xx + yy) * 0.35))
    out[blue] = np.clip(np.array([0.20, 0.11, 0.06])[None, :] * (lum[blue] * 2.2 * tie_pat[blue])[:, None], 0, 1)
    px[..., :3] = out
    img.pixels.foreach_set(px.ravel())
    img.update()
    img.pack()
    counts = {n: sum(1 for k in kind.values() if k == i) for i, n in enumerate(names)}
    print(f"[look] suit islands -> {counts}")


def lighten_skin(gain=1.45, warm=(1.04, 1.0, 0.93)):
    """MakeHuman's African skin textures are much darker than Abel's medium-brown skin."""
    body = _find("male_generic") or _find("female_generic")
    for slot in body.material_slots:
        for n in slot.material.node_tree.nodes:
            if n.type == "TEX_IMAGE" and n.image and "diffuse" in n.image.name.lower():
                img = n.image
                px = np.empty(img.size[0] * img.size[1] * 4, dtype=np.float32)
                img.pixels.foreach_get(px)
                px = px.reshape(-1, 4)
                px[:, :3] = np.clip(px[:, :3] * gain * np.array(warm), 0, 1)
                img.pixels.foreach_set(px.ravel())
                img.update()
                img.pack()
                print(f"[look] skin lightened x{gain}")
                return


# ----------------------------------------------------------------------------- accessories
def flat_cap(hf):
    """Ivy/flat cap: low flattened crown sloping forward onto a short stiff brim (camel suede)."""
    cx = (hf["head_xmin"] + hf["head_xmax"]) / 2
    rx = (hf["head_xmax"] - hf["head_xmin"]) / 2 * 1.22
    ry = (hf["head_ymax"] - hf["head_ymin"]) / 2 * 1.24
    cy = (hf["head_ymin"] + hf["head_ymax"]) / 2 - 0.004
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=28, v_segments=14, radius=1.0)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -0.05], context="VERTS")
    for v in bm.verts:
        # flatter at the front (the crown slopes down onto the brim), fuller at the back
        front = max(0.0, -v.co.y)
        v.co.z *= 0.075 * (1.0 - 0.45 * front)  # low crown (~7 cm), sloping down to the brim
        v.co.x *= rx
        v.co.y *= ry
    # brim: a shallow curved half-ellipse in front
    brim = []
    for i in range(15):
        a = math.pi + math.pi * i / 14
        brim.append((math.cos(a) * rx * 0.92, math.sin(a) * ry * 0.55 - ry * 0.62))
    outer = [bm.verts.new((x, y, -0.012 - 0.02 * (1 - abs(x) / rx))) for x, y in brim]
    inner = [bm.verts.new((x * 0.9, -ry * 0.62 + (y + ry * 0.62) * 0.15, 0.0)) for x, y in brim]
    for i in range(len(brim) - 1):
        bm.faces.new((inner[i], inner[i + 1], outer[i + 1], outer[i]))
    mat = _material("abel_cap_suede", (0.30, 0.20, 0.12), rough=0.85)  # camel, as in the photo
    ob = _new_obj("abel_cap", bm, mat)
    top_z = hf["top"] - 0.068  # band sits on the head just above the ears/forehead
    ob.matrix_world = Matrix.Translation((cx, cy, top_z)) @ Matrix.Rotation(math.radians(-10), 4, "X")
    bpy.context.view_layer.update()
    ob.data.transform(ob.matrix_world)
    ob.matrix_world = Matrix.Identity(4)
    _rigid_to_bone(ob)
    return ob


def glasses(hf):
    """Round metal-rim glasses in front of the eyes, temples running back to the ears."""
    mat = _material("abel_glasses_frame", (0.08, 0.07, 0.06), rough=0.35, metal=0.8)
    bm = bmesh.new()
    y = hf["eye_front_y"] - 0.014
    r = 0.022
    for e in (hf["eye_l"], hf["eye_r"]):
        rim = bmesh.new()
        bmesh.ops.create_cone(rim, cap_ends=False, segments=24, radius1=r, radius2=r, depth=0.003)
        tmp = bpy.data.meshes.new("t")
        rim.to_mesh(tmp)
        rim.free()
        tmp.transform(Matrix.Translation((e.x, y, e.z + 0.002)) @ Matrix.Rotation(math.pi / 2, 4, "X"))
        bm.from_mesh(tmp)
        bpy.data.meshes.remove(tmp)
    # bridge + temples (thin boxes)
    def bar(p0, p1, t=0.0022):
        d = p1 - p0
        b = bmesh.new()
        bmesh.ops.create_cube(b, size=1.0)
        bmesh.ops.scale(b, vec=(t, t, d.length), verts=b.verts)
        q = d.to_track_quat("Z", "Y")
        tmp = bpy.data.meshes.new("t")
        b.to_mesh(tmp)
        b.free()
        tmp.transform(Matrix.Translation((p0 + p1) / 2) @ q.to_matrix().to_4x4())
        bm.from_mesh(tmp)
        bpy.data.meshes.remove(tmp)
    el, er = hf["eye_l"], hf["eye_r"]
    bar(Vector((er.x + r, y, er.z + 0.006)), Vector((el.x - r, y, el.z + 0.006)))
    for e, s in ((el, 1), (er, -1)):
        p0 = Vector((e.x + s * r, y, e.z + 0.004))
        p1 = Vector((e.x + s * (r + 0.012), y + 0.095, e.z + 0.0))
        bar(p0, p1)
    ob = _new_obj("abel_glasses", bm, mat)
    _rigid_to_bone(ob)
    return ob


BEARD_U0, BEARD_SPAN = -0.125, 0.25   # texture covers x in [-0.125, 0.125]
BEARD_DZ0 = -0.16                       # and dz (relative to eye height) in [-0.16, 0.09]


def _beard_mask(xs, dzs, chin_dz=-0.125):
    """Soft beard coverage (0..1) at face coordinates: moustache, chin + goatee, and a short
    beard along the jaw (as in the reference photo); lips kept clear."""
    def band(v, lo, hi, soft):
        return np.clip((v - lo) / soft, 0, 1) * np.clip((hi - v) / soft, 0, 1)
    ax = np.abs(xs)
    moustache = band(dzs, -0.066, -0.047, 0.004) * band(ax, -1, 0.033 - 0.25 * np.clip(dzs + 0.066, 0, 1), 0.006)
    chin = band(dzs, chin_dz - 0.012, -0.088, 0.006) * band(ax, -1, 0.074, 0.01)
    corners = band(dzs, -0.095, -0.05, 0.006) * band(ax, 0.024, 0.040, 0.004)  # circle beard
    lips = band(dzs, -0.091, -0.064, 0.003) * band(ax, -1, 0.026, 0.004)
    return np.clip(np.maximum(np.maximum(moustache, chin), corners) - lips * 1.5, 0, 1)


def _stubble_material(chin_dz):
    """Short dense beard: hair strokes masked by the beard shape (alpha-tested cut-out)."""
    name = "abel_beard_alpha"
    size = 512
    rng = np.random.default_rng(3)
    a = np.zeros((size, size), dtype=np.float32)
    for _ in range(150000):  # short 2-4 px strokes = individual hairs (dense trimmed beard)
        x, y = rng.integers(0, size, 2)
        for k in range(int(rng.integers(2, 5))):
            a[(y + k) % size, (x + k // 2) % size] = 1.0
    vv, uu = np.mgrid[0:size, 0:size]
    xs = BEARD_U0 + (uu + 0.5) / size * BEARD_SPAN
    dzs = BEARD_DZ0 + (vv + 0.5) / size * BEARD_SPAN
    mask = _beard_mask(xs, dzs, chin_dz)
    # denser in the core, sparse at the edges -> soft natural hairline
    alpha = np.where(rng.random((size, size)) < mask * 1.15, a, 0.0)
    img = bpy.data.images.new("abel_beard_stubble", size, size, alpha=True)
    px = np.zeros((size, size, 4), dtype=np.float32)
    px[..., 0], px[..., 1], px[..., 2] = 0.03, 0.024, 0.02
    px[..., 3] = alpha
    img.pixels.foreach_set(px.ravel())
    img.pack()
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = img
    t.extension = "CLIP"
    nt.links.new(t.outputs["Color"], b.inputs["Base Color"])
    nt.links.new(t.outputs["Alpha"], b.inputs["Alpha"])
    b.inputs["Roughness"].default_value = 0.9
    return m


def beard(hf):
    """Trimmed beard + moustache: a thin shell lifted off the face skin over the jaw, chin and
    upper lip, leaving the lips clear. Built from the body proxy so it follows the face exactly."""
    body = _find("male_generic") or _find("female_generic")
    ez = hf["eye_mid"].z
    front = hf["eye_front_y"]
    bm = bmesh.new()
    bm.from_mesh(body.data)
    bm.verts.ensure_lookup_table()
    mw = body.matrix_world
    nm = mw.to_3x3()
    # chin point = lowest front-most face point near the centre line (the neck sits further back)
    face_front = [mw @ v.co for v in bm.verts if abs((mw @ v.co).x) < 0.02 and (mw @ v.co).y < front + 0.03
                  and -0.22 < (mw @ v.co).z - ez < -0.05]
    chin_z = min(p.z for p in face_front)
    chin_dz = chin_z - ez
    keep = set()
    for v in bm.verts:
        p = mw @ v.co
        n = (nm @ v.normal).normalized()
        dz = p.z - ez
        if p.y > front + 0.085 or not (chin_dz - 0.02 < dz < -0.04) or abs(p.x) > 0.085:
            continue
        if n.z < -0.55:  # under the chin / neck: a trimmed beard stops at the jawline
            continue
        keep.add(v.index)
    print(f"[look] chin at {chin_dz:.3f} m below the eyes")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.index not in keep], context="VERTS")
    bm.normal_update()
    for v in bm.verts:
        v.co += v.normal * 0.0015
    me = bpy.data.meshes.new("abel_beard")
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new("abel_beard", me)
    bpy.context.scene.collection.objects.link(ob)
    ob.matrix_world = mw.copy()
    me.materials.clear()
    me.materials.append(_stubble_material(chin_dz))
    while me.uv_layers:  # drop the skin UVs inherited from the body copy (export uses layer 0)
        me.uv_layers.remove(me.uv_layers[0])
    uvl = me.uv_layers.new(name="UVMap")  # front projection matching _beard_mask coordinates
    for poly in me.polygons:
        for li in poly.loop_indices:
            co = mw @ me.vertices[me.loops[li].vertex_index].co
            uvl.data[li].uv = ((co.x - BEARD_U0) / BEARD_SPAN, (co.z - ez - BEARD_DZ0) / BEARD_SPAN)
    for p in me.polygons:
        p.use_smooth = True
    _rigid_to_bone(ob)
    print(f"[look] beard shell: {len(me.vertices)} verts")
    return ob


def pocket_square_and_bracelet():
    """White pocket square on the left chest; beaded bracelet on the left wrist."""
    arm = _armature()
    mw = arm.matrix_world
    suit = _find("elegantsuit")
    if suit:
        sp = mw @ arm.data.bones["spine_03"].head_local
        vs = [v for v in _world_verts(suit) if abs(v.z - (sp.z + 0.06)) < 0.03 and 0.05 < v.x < 0.13]
        if vs:
            fy = min(v.y for v in vs)
            bm = bmesh.new()
            for i, (dx, dz) in enumerate(((0, 0), (0.012, 0.004), (0.024, 0))):
                a = bm.verts.new((dx - 0.012, 0, dz + 0.022))
                b_ = bm.verts.new((dx - 0.018, 0, dz))
                c = bm.verts.new((dx - 0.006, 0, dz))
                bm.faces.new((a, b_, c))
            ob = _new_obj("abel_pocket_square", bm, _material("abel_pocket_white", (0.92, 0.92, 0.9), rough=0.7))
            ob.data.transform(Matrix.Translation((0.095, fy - 0.003, sp.z + 0.06)))
            _rigid_to_bone(ob, "spine_03")
    hb = arm.data.bones["hand_l"]
    wrist = mw @ hb.head_local
    dirv = ((mw @ hb.head_local) - (mw @ arm.data.bones["lowerarm_l"].head_local)).normalized()
    bm = bmesh.new()
    for i in range(14):
        a = 2 * math.pi * i / 14
        b = bmesh.new()
        bmesh.ops.create_icosphere(b, subdivisions=1, radius=0.0042)
        tmp = bpy.data.meshes.new("t")
        b.to_mesh(tmp)
        b.free()
        tmp.transform(Matrix.Translation((math.cos(a) * 0.031, math.sin(a) * 0.031, 0)))
        bm.from_mesh(tmp)
        bpy.data.meshes.remove(tmp)
    ob = _new_obj("abel_bracelet", bm, _material("abel_beads", (0.55, 0.12, 0.08), rough=0.4))
    q = dirv.to_track_quat("Z", "Y")
    ob.data.transform(Matrix.Translation(wrist - dirv * 0.025) @ q.to_matrix().to_4x4())
    _rigid_to_bone(ob, "lowerarm_l")


def _chin_dz(hf):
    body = _find("male_generic") or _find("female_generic")
    mw = body.matrix_world
    ez, front = hf["eye_mid"].z, hf["eye_front_y"]
    pts = [mw @ v.co for v in body.data.vertices]
    face_front = [p for p in pts if abs(p.x) < 0.02 and p.y < front + 0.03 and -0.22 < p.z - ez < -0.05]
    return min(p.z for p in face_front) - ez


def apply_abel_look(photo_face=True):
    hf = head_frame()
    if photo_face:
        # Likeness from the owner's front photo (abel_face.py). His close buzz cut and goatee come
        # from the photo, so the hair cards, modelled brows and beard shell are not used.
        from abel_face import project_face
        body = _find("male_generic")
        skin = next(n.image for sl in body.material_slots for n in sl.material.node_tree.nodes
                    if n.type == "TEX_IMAGE" and n.image and "diffuse" in n.image.name.lower())
        project_face(body, skin, _find("low-poly"), hf["eye_front_y"], _chin_dz(hf))
        for o in list(_mesh_objects()):
            if "short0" in o.name or "eyebrow" in o.name:
                bpy.data.objects.remove(o, do_unlink=True)
    else:
        lighten_skin()
        beard(hf)
    recolour_suit()
    flat_cap(hf)
    glasses(hf)
    pocket_square_and_bracelet()


# ----------------------------------------------------------------------------- skin culling
def cull_hidden_body(max_gap=0.04):
    """Delete body-proxy faces whose vertices are all covered by clothing (ray along the vertex
    normal hits a garment within max_gap). Skin can then never show through clothes."""
    body = _find("male_generic") or _find("female_generic")
    if not body:
        return
    garments = [o for o in _mesh_objects() if o is not body and not any(
        k in o.name for k in ("low-poly", "eyebrow", "eyelash", "short0", "afro", "braid", "bob", "long0", "ponytail",
                              "abel_cap", "abel_glasses", "abel_beard", "abel_pocket", "abel_bracelet"))]
    if not garments:
        return
    deps = bpy.context.evaluated_depsgraph_get()
    trees = []
    for g in garments:
        bm = bmesh.new()
        bm.from_object(g, deps)
        bm.transform(g.matrix_world)
        trees.append(BVHTree.FromBMesh(bm))
        bm.free()
    mw = body.matrix_world
    nm = mw.to_3x3()
    arm = _armature()
    neck_z = (arm.matrix_world @ arm.data.bones["neck_01"].head_local).z
    covered = []
    for v in body.data.vertices:
        p = mw @ v.co
        if p.z > neck_z - 0.02:  # never cut the head/neck: collar rays would hole the face
            covered.append(False)
            continue
        n = (nm @ v.normal).normalized()
        hit = any(t.ray_cast(p + n * 0.001, n, max_gap)[0] is not None for t in trees)
        covered.append(hit)
    bm = bmesh.new()
    bm.from_mesh(body.data)
    bm.faces.ensure_lookup_table()
    doomed = [f for f in bm.faces if all(covered[v.index] for v in f.verts)]
    bmesh.ops.delete(bm, geom=doomed, context="FACES")
    bm.to_mesh(body.data)
    bm.free()
    print(f"[look] culled {len(doomed)} hidden body faces under {len(garments)} garments")
