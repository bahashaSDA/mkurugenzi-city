"""Project the owner-supplied front photo of Abel onto the head (single-photo likeness).

Method
  1. Bake the body proxy's world-space POSITION and NORMAL into float images laid out in the skin
     UVs (Cycles emission bake), so every skin texel knows where it sits on the head.
  2. Fit an affine map (x, z) -> photo pixel from 4 landmarks (both eyes, mouth centre, chin), then
     sample the photo for every front-facing face texel. The head roll in the photo is absorbed by
     the affine fit.
  3. Feathered masks: a face oval (in photo space) x front-facing normal. Teeth in the smiling
     photo are repainted as lips (the mesh mouth is closed). The rest of the body skin is
     tone-matched to the photo, and the scalp gets his close buzz cut.

RIGHTS: the source photo (research/owner-references/ref_22.png) was supplied by the project
owner; its photographer's licence is not cleared for public release. Replace it with photos from
Abel's team (SPEC 5.5 capture session) before launch. See ASSETS.md.
"""
import os

import bpy
import numpy as np
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PHOTO = os.path.join(ROOT, "research", "owner-references", "ref_22.png")
# landmarks measured on the photo (pixels, origin top-left), see research notes
PHOTO_LM = {"eye_r": (163, 153), "eye_l": (230, 135), "mouth": (207, 210), "chin": (213, 260)}
FACE_OVAL = {"cx": 204, "cy": 160, "rx": 66, "ry": 110, "rot_deg": -12}  # his face in the photo
MOUTH_BOX = (172, 198, 248, 224)  # x0, y0, x1, y1: smile region (teeth -> lips)
HAIR_RGB = np.array([0.075, 0.055, 0.05])


def _load_photo():
    img = bpy.data.images.load(PHOTO, check_existing=True)
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape(h, w, 4)[::-1, :, :3].copy()  # Blender rows are bottom-up -> top-down
    # closed-mouth fix: bright teeth inside the smile box become lip colour
    x0, y0, x1, y1 = MOUTH_BOX
    box = px[y0:y1, x0:x1]
    lum = box.mean(axis=2)
    lip = np.median(box[(lum > 0.18) & (lum < 0.4)], axis=0) if ((lum > 0.18) & (lum < 0.4)).any() else np.array([0.35, 0.2, 0.18])
    box[lum > 0.5] = lip * 0.95
    px[y0:y1, x0:x1] = box
    return px


def _sample(photo, u, v):
    """Bilinear sample photo (h, w, 3) at pixel coords u (x), v (y)."""
    h, w, _ = photo.shape
    u = np.clip(u, 0, w - 1.001)
    v = np.clip(v, 0, h - 1.001)
    x0, y0 = np.floor(u).astype(int), np.floor(v).astype(int)
    fx, fy = (u - x0)[:, None], (v - y0)[:, None]
    a, b = photo[y0, x0], photo[y0, x0 + 1]
    c, d = photo[y0 + 1, x0], photo[y0 + 1, x0 + 1]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def _bake_attr(body, img_size, attr):
    """Bake Geometry.Position or .Normal into a float image in the body's UV layout."""
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 1
    scene.cycles.device = "CPU"
    img = bpy.data.images.new(f"bake_{attr}", img_size, img_size, alpha=True, float_buffer=True)
    mat = bpy.data.materials.new(f"bake_{attr}")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    emit = nt.nodes.new("ShaderNodeEmission")
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    nt.nodes.active = tex
    nt.links.new(geo.outputs[attr], emit.inputs["Color"])
    nt.links.new(emit.outputs["Emission"], out.inputs["Surface"])
    saved = [s.material for s in body.material_slots]
    for s in body.material_slots:
        s.material = mat
    for o in bpy.context.view_layer.objects:
        o.select_set(o is body)
    bpy.context.view_layer.objects.active = body
    scene.render.bake.use_clear = True
    scene.render.bake.margin = 3
    bpy.ops.object.bake(type="EMIT")
    for s, m in zip(body.material_slots, saved):
        s.material = m
    arr = np.empty(img_size * img_size * 4, dtype=np.float32)
    img.pixels.foreach_get(arr)
    return arr.reshape(img_size, img_size, 4)


def project_face(body, skin_img, eyes_obj, front_y, chin_dz):
    """Blend the photo into skin_img (Blender image, edited in place)."""
    W, H = skin_img.size
    pos = _bake_attr(body, W, "Position")
    nrm = _bake_attr(body, W, "Normal")
    valid = np.abs(pos[..., :3]).sum(axis=2) > 1e-6

    # 3D landmarks (world, Z-up, face looks toward -Y)
    ev = [eyes_obj.matrix_world @ v.co for v in eyes_obj.data.vertices]
    el = sum((v for v in ev if v.x > 0), Vector()) / max(1, sum(1 for v in ev if v.x > 0))
    er = sum((v for v in ev if v.x <= 0), Vector()) / max(1, sum(1 for v in ev if v.x <= 0))
    ez = (el.z + er.z) / 2
    lm3 = {"eye_r": (er.x, er.z), "eye_l": (el.x, el.z), "mouth": (0.0, ez - 0.079), "chin": (0.0, ez + chin_dz + 0.004)}
    A = np.array([[x, z, 1.0] for x, z in (lm3[k] for k in PHOTO_LM)])
    B = np.array([PHOTO_LM[k] for k in PHOTO_LM], dtype=np.float64)
    M, *_ = np.linalg.lstsq(A, B, rcond=None)  # (3, 2): [x z 1] @ M = [u v]
    resid = np.abs(A @ M - B).max()
    print(f"[face] affine fit max landmark error {resid:.1f} px")

    P = pos[..., :3][valid]
    N = nrm[..., :3][valid]
    uv = np.c_[P[:, 0], P[:, 2], np.ones(len(P))] @ M
    u, v = uv[:, 0], uv[:, 1]
    # face oval mask in photo space (feathered), x front-facing normals, x in front half of head
    o = FACE_OVAL
    c, s = np.cos(np.radians(o["rot_deg"])), np.sin(np.radians(o["rot_deg"]))
    du, dv = u - o["cx"], v - o["cy"]
    ru, rv = (du * c + dv * s) / o["rx"], (-du * s + dv * c) / o["ry"]
    r = np.sqrt(ru * ru + rv * rv)
    m_oval = np.clip((1.0 - r) / 0.18, 0, 1)
    m_front = np.clip((-N[:, 1] - 0.15) / 0.35, 0, 1)
    m_depth = np.clip((front_y + 0.13 - P[:, 1]) / 0.03, 0, 1)
    m = m_oval * m_front * m_depth
    photo = _load_photo()
    col = _sample(photo, u, v)

    sk = np.empty(W * H * 4, dtype=np.float32)
    skin_img.pixels.foreach_get(sk)
    sk = sk.reshape(H, W, 4)
    skin = sk[..., :3][valid]

    # tone-match the whole body to his photo skin (cheeks/forehead, well inside the mask)
    # compare photo vs skin texture in the feather ring around the face (same surface, both sides)
    ring = (m > 0.15) & (m < 0.6) & (m_front > 0.5)
    target = np.median(col[ring], axis=0)
    body_tone = np.median(skin[ring], axis=0)
    gain = np.clip(target / np.maximum(body_tone, 1e-3), 0.5, 2.6)
    print(f"[face] body skin gain {np.round(gain, 2)}")
    sk[..., :3] = np.clip(sk[..., :3] * gain, 0, 1)
    skin = sk[..., :3][valid]

    # buzz cut: dark short hair above a hairline that drops from the forehead to the nape
    ez_rel = P[:, 2] - ez
    back = np.clip((P[:, 1] - front_y) / 0.17, 0, 1)
    hairline = 0.072 - back * 0.13
    ears = (np.abs(P[:, 0]) > 0.062) & (np.abs(ez_rel + 0.01) < 0.04) & (back > 0.35) & (back < 0.75)
    m_hair = np.clip((ez_rel - hairline) / 0.012, 0, 1) * (~ears)
    rng = np.random.default_rng(5)
    hair = HAIR_RGB * rng.normal(1.0, 0.18, (len(P), 1))
    skin = skin * (1 - m_hair[:, None] * 0.92) + hair * m_hair[:, None] * 0.92

    out = skin * (1 - m[:, None]) + col * m[:, None]
    sk[..., :3][valid] = out
    skin_img.pixels.foreach_set(sk.ravel())
    skin_img.update()
    skin_img.pack()
    print(f"[face] projected {int((m > 0.5).sum())} face texels from the photo")
    bpy.context.scene.render.engine = "BLENDER_EEVEE_NEXT"
