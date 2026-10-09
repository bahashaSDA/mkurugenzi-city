"""Project the owner-supplied front photo of Abel onto the head (single-photo likeness).

Method
  1. Bake the body proxy's world-space POSITION and NORMAL into float images laid out in the skin
     UVs (Cycles emission bake), so every skin texel knows where it sits on the head.
  2. Warp (x, z) -> photo pixel with a thin-plate spline through 22 matched landmarks (eye corners,
     nose, mouth corners, chin, jaw, face edge, forehead, temples), measured on an orthographic
     render of the head (offsets from the eye centre, so small rig changes don't break it) and on
     the photo. The spline also undoes the photo's slight head turn and roll.
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
# landmark: (mesh x, mesh z relative to the eye-centre height) metres  ->  photo pixel (x, y)
# mesh side measured on an orthographic front render of the v2 head (face_probe), wearer's right = -x
LANDMARKS = {
    "eye_r": ((-0.0328, -0.002), (163.8, 153.8)), "eye_r_out": ((-0.0448, -0.002), (150.0, 156.0)),
    "eye_r_in": ((-0.0200, -0.002), (178.8, 152.5)), "eye_l": ((0.0328, -0.002), (230.0, 135.0)),
    "eye_l_in": ((0.0200, -0.002), (211.3, 138.8)), "eye_l_out": ((0.0456, -0.002), (246.3, 133.8)),
    "nose": ((0.0, -0.046), (207.5, 178.8)), "ala_r": ((-0.016, -0.0468), (186.3, 183.8)), "ala_l": ((0.016, -0.0468), (223.8, 180.0)),
    "mouth_r": ((-0.0252, -0.0748), (180.0, 212.5)), "mouth_l": ((0.026, -0.0748), (238.8, 202.5)),
    "mouth": ((0.0, -0.0728), (208.8, 210.0)), "chin": ((0.0, -0.1228), (217.5, 260.0)),
    "jaw_r": ((-0.0608, -0.078), (152.5, 210.0)), "jaw_l": ((0.0608, -0.078), (280.0, 195.0)),
    "edge_r": ((-0.0744, -0.002), (137.5, 152.5)), "edge_l": ((0.0752, -0.002), (276.3, 140.0)),
    "angle_r": ((-0.0528, -0.1092), (158.8, 237.5)), "angle_l": ((0.0528, -0.1092), (272.5, 230.0)),
    "forehead": ((0.0, 0.062), (203.0, 70.0)), "temple_r": ((-0.062, 0.048), (145.0, 95.0)), "temple_l": ((0.062, 0.048), (262.5, 85.0)),
}
FACE_OVAL = {"cx": 204, "cy": 160, "rx": 66, "ry": 110, "rot_deg": -12}  # his face in the photo
HAIR_RGB = np.array([0.075, 0.055, 0.05])


def _load_photo():
    img = bpy.data.images.load(PHOTO, check_existing=True)
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape(h, w, 4)[::-1, :, :3].copy()  # Blender rows are bottom-up -> top-down
    # closed-mouth fix: only the TEETH inside the smile (an ellipse through the mouth corners, and
    # whitish = bright + unsaturated) become lip colour; skin highlights on the chin stay skin
    (x0, y0), (x1, y1) = LANDMARKS["mouth_r"][1], LANDMARKS["mouth_l"][1]
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2 + 1
    ang = np.arctan2(y1 - y0, x1 - x0)
    rx, ry = np.hypot(x1 - x0, y1 - y0) / 2 * 0.92, 7.5
    yy, xx = np.mgrid[0:h, 0:w]
    du, dv = xx - cx, yy - cy
    eu = (du * np.cos(ang) + dv * np.sin(ang)) / rx
    ev = (-du * np.sin(ang) + dv * np.cos(ang)) / ry
    inside = eu * eu + ev * ev < 1.0
    lum = px.mean(axis=2)
    sat = px.max(axis=2) - px.min(axis=2)
    teeth = inside & (lum > 0.42) & (sat < 0.22)
    lips = inside & (lum > 0.12) & (lum < 0.38)
    lip = np.median(px[lips], axis=0) if lips.any() else np.array([0.32, 0.18, 0.16])
    px[teeth] = lip * 0.9
    # the studio photo is warm/pink and bright: pull it towards his natural deep brown
    px = px * np.array([0.9, 0.95, 0.98]) * 0.92
    return np.clip(px, 0, 1)


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


def _tps(src, dst, reg=1e-7):
    """Thin-plate spline from src (n, 2) to dst (n, 2); returns f(points (m, 2)) -> (m, 2)."""
    n = len(src)

    def U(r2):
        return np.where(r2 > 0, 0.5 * r2 * np.log(np.maximum(r2, 1e-300)), 0.0)  # r^2 log r

    K = U(((src[:, None, :] - src[None, :, :]) ** 2).sum(-1)) + reg * np.eye(n)
    Pm = np.c_[np.ones(n), src]
    L = np.zeros((n + 3, n + 3))
    L[:n, :n], L[:n, n:], L[n:, :n] = K, Pm, Pm.T
    coef = np.linalg.solve(L, np.r_[dst, np.zeros((3, 2))])
    w, a = coef[:n], coef[n:]

    def f(pts):
        out = np.c_[np.ones(len(pts)), pts] @ a
        for i in range(0, len(pts), 20000):  # chunks keep the kernel matrix small
            chunk = pts[i:i + 20000]
            out[i:i + 20000] += U(((chunk[:, None, :] - src[None, :, :]) ** 2).sum(-1)) @ w
        return out

    err = np.abs(f(src) - dst).max()
    print(f"[face] thin-plate warp through {n} landmarks (max error {err:.2f} px)")
    return f


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
    src = np.array([(x, ez + dz) for (x, dz), _ in LANDMARKS.values()], dtype=np.float64)
    dst = np.array([p for _, p in LANDMARKS.values()], dtype=np.float64)
    warp = _tps(src, dst)

    P = pos[..., :3][valid]
    N = nrm[..., :3][valid]
    uv = warp(np.c_[P[:, 0], P[:, 2]])
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
