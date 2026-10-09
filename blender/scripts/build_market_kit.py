"""Market kit: Nairobi open-air market (owner reference photo: umbrellas, produce stalls, price cards)
and a Chipoz-style chips booth (orange counter, tribal-pattern sign band; fictional "CHIPO EXPRESS").

Pieces: market_stall (table + umbrella + fruit), market_stall_b (produce on sacks + umbrella),
chips_booth, crate_stack, sack_pile.  Usage like the other kits:
  blender -b --factory-startup -P blender/scripts/build_market_kit.py -- --out public/models/raw [--preview blender/previews]
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
from kitlib import M, PIECES  # noqa: E402

WHITE = pbr("cloth_white", color=(0.92, 0.92, 0.9), rough=0.85, metal=0.0)  # tinted by vertex colour
PRODUCE = pbr("produce", color=(0.95, 0.95, 0.95), rough=0.45, metal=0.0)    # tinted by vertex colour
WOOD = M["timber"]
CARD = pbr("price_card", color=(0.95, 0.95, 0.92), rough=0.8, metal=0.0)
INK = pbr("card_ink", color=(0.75, 0.05, 0.04), rough=0.6, metal=0.0)
SACK = pbr("sack", "Planks021", tint=(0.85, 0.78, 0.62), rough=0.95)
TIN = pbr("tin", color=(0.75, 0.75, 0.72), rough=0.35, metal=0.9)
STEEL = pbr("steel_counter", color=(0.8, 0.8, 0.82), rough=0.25, metal=0.9)
ORANGE = pbr("booth_orange", color=(0.85, 0.36, 0.06), rough=0.55, metal=0.0)
SIGN_Y = pbr("sign_yellow_glow", color=(1.0, 0.82, 0.1), rough=0.4, metal=0.0)

# produce colours (linear)
COL = {
    "tomato": (0.62, 0.05, 0.02), "mango": (0.55, 0.42, 0.04), "mango_g": (0.18, 0.32, 0.05),
    "avocado": (0.05, 0.12, 0.03), "banana": (0.75, 0.6, 0.05), "banana_g": (0.25, 0.45, 0.05),
    "orange": (0.7, 0.3, 0.02), "onion": (0.35, 0.06, 0.12), "potato": (0.42, 0.3, 0.16),
    "cabbage": (0.35, 0.55, 0.22), "pineapple": (0.45, 0.32, 0.05), "watermelon": (0.06, 0.2, 0.05),
}


KINDS = list(COL)
PROD_MATS = [pbr(f"produce_{k}", color=c, rough=0.42 if k not in ("potato", "pineapple", "avocado") else 0.8, metal=0.0)
             for k, c in COL.items()]
PROD0 = 8  # produce materials start at this slot in every stall


def kidx(kind):
    return PROD0 + KINDS.index(kind)


def blob(bm, center, r, mat_idx, squash=1.0, jitter=0.12, sub=1):
    b = bmesh.new()
    bmesh.ops.create_icosphere(b, subdivisions=sub, radius=r)
    for v in b.verts:
        v.co *= 1 + random.uniform(-jitter, jitter)
        v.co.z *= squash
    for f in b.faces:
        f.smooth = True
    merge_bm(bm, b, Matrix.Translation(center), mat_idx)


def heap(bm, cx, cy, z0, r, n, kind, mat_idx, base=0.22):
    """Pyramid pile of round produce."""
    placed = 0
    layer = 0
    while placed < n:
        ring_r = base * max(0.15, 1 - layer * 0.33)
        k = max(1, int(6 * ring_r / base) + (1 if layer == 0 else 0))
        for i in range(k):
            if placed >= n:
                break
            a = 2 * math.pi * i / k + layer
            blob(bm, Vector((cx + math.cos(a) * ring_r * 0.7, cy + math.sin(a) * ring_r * 0.7, z0 + r + layer * r * 1.6)),
                 r, kidx(kind))
            KIND_FACES.append(kind)
            placed += 1
        layer += 1


KIND_FACES = []  # parallel list of produce kinds per blob (for vertex colouring)


def banana_bunch(bm, c, mat_idx, green=False):
    for i in range(7):
        a = -0.6 + i * 0.2
        b = bmesh.new()
        pts = [Vector((math.sin(a) * 0.04, 0, 0)) + Vector((math.sin(a) * t * 0.18, t * 0.05, t * 0.16 - t * t * 0.08))
               for t in (0, 0.33, 0.66, 1.0)]
        for j in range(3):
            seg = bmesh.new()
            d = pts[j + 1] - pts[j]
            bmesh.ops.create_cone(seg, cap_ends=True, segments=6, radius1=0.018, radius2=0.016, depth=d.length)
            q = d.to_track_quat("Z", "Y")
            tmp = bpy.data.meshes.new("t")
            seg.to_mesh(tmp)
            seg.free()
            tmp.transform(Matrix.Translation((pts[j] + pts[j + 1]) / 2) @ q.to_matrix().to_4x4())
            b.from_mesh(tmp)
            bpy.data.meshes.remove(tmp)
        for f in b.faces:
            f.smooth = True
        merge_bm(bm, b, Matrix.Translation(c), kidx("banana_g" if green else "banana"))


STRIPE_B = [0]


def umbrella(bm, c, radius, height, fabric_idx, pole_idx, panels=8):
    add_box(bm, (0.035, 0.035, height), (c[0], c[1], height / 2), pole_idx)
    ring = []
    for i in range(panels * 2):
        a = math.pi * i / panels
        ring.append(Vector((c[0] + math.cos(a) * radius, c[1] + math.sin(a) * radius, height - 0.45)))
    top = bm.verts.new((c[0], c[1], height + 0.05))
    for i in range(panels * 2):
        v1 = bm.verts.new(ring[i])
        v2 = bm.verts.new(ring[(i + 1) % (panels * 2)])
        mid = (ring[i] + ring[(i + 1) % (panels * 2)]) / 2
        sag = bm.verts.new(mid + Vector((0, 0, 0.06)))
        for tri in ((top, v1, sag), (top, sag, v2)):
            f = bm.faces.new(tri)
            f.material_index = fabric_idx if i // 2 % 2 == 0 else STRIPE_B[0]  # alternating stripes


UMB_PANELS = []


def colour_pass(ob, produce_idx, fabric_idx, stripes, card_idx=None):
    """Vertex colours: per produce blob kind; umbrella stripes alternating two colours."""
    me = ob.data
    if not me.color_attributes:
        me.color_attributes.new("Col", "BYTE_COLOR", "CORNER")
    attr = me.color_attributes[0]
    # produce faces come in blob order: walk connected components among produce faces
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.faces.ensure_lookup_table()
    comp = {}
    seen = set()
    kinds = iter(KIND_FACES)
    for f in bm.faces:
        if f.material_index != produce_idx or f.index in seen:
            continue
        kind = next(kinds, "tomato")
        stack = [f]
        tone = random.uniform(0.85, 1.12)
        while stack:
            g = stack.pop()
            if g.index in seen:
                continue
            seen.add(g.index)
            comp[g.index] = (kind, tone)
            for e in g.edges:
                for h in e.link_faces:
                    if h.material_index == produce_idx and h.index not in seen:
                        stack.append(h)
    fabric = [f for f in bm.faces if f.material_index == fabric_idx]
    bm.free()
    for i, p in enumerate(me.polygons):
        if p.index in comp:
            kind, tone = comp[p.index]
            c = tuple(min(1.0, ch * tone) for ch in COL[kind])
        elif p.material_index == fabric_idx:
            k = fabric.index(next(f for f in fabric if f.index == p.index)) if False else None
            c = stripes[(UMB_STRIPE.get(p.index, 0))]
        else:
            c = (1.0, 1.0, 1.0)
        for li in p.loop_indices:
            attr.data[li].color = (*c, 1.0)


UMB_STRIPE = {}


def _assign_umbrella_stripes(ob, fabric_idx):
    i = 0
    for p in ob.data.polygons:
        if p.material_index == fabric_idx:
            UMB_STRIPE[p.index] = UMB_PANELS[i // 2] if i // 2 < len(UMB_PANELS) else 0
            i += 1


def price_card(bm, c, text, card_idx, ink_idx):
    add_box(bm, (0.16, 0.01, 0.11), c, card_idx)
    t = text_mesh(text, 0.06, depth=0.002, resolution=1)
    merge_bm(bm, t, Matrix.Translation((c[0], c[1] - 0.007, c[2])) @ Matrix.Rotation(math.pi / 2, 4, "X"), ink_idx)


def stall(name, lod, stripes, variant):
    random.seed(hash(name) & 0xFFFF)
    KIND_FACES.clear()
    UMB_PANELS.clear()
    UMB_STRIPE.clear()
    fab = [pbr(f"umbrella_{name}_a", color=stripes[0], rough=0.85, metal=0.0),
           pbr(f"umbrella_{name}_b", color=stripes[1], rough=0.85, metal=0.0)]
    mats = [WOOD, PRODUCE, fab[0], M["steel"], CARD, INK, SACK, TIN] + PROD_MATS + [fab[1]]
    W_, P_, F_, S_, C_, I_, K_, T_ = range(8)
    FB = len(mats) - 1  # second stripe material
    bm = bmesh.new()
    if variant == "table":
        # rough plank table 2.4 x 1.1 at 0.8 m, stick legs, slanted display shelf at the front
        add_box(bm, (2.4, 1.1, 0.05), (0, 0, 0.8), W_)
        for x in (-1.1, 1.1):
            for y in (-0.48, 0.48):
                add_box(bm, (0.06, 0.06, 0.8), (x, y, 0.4), W_)
        if lod < 2:
            add_box(bm, (2.4, 0.4, 0.04), (0, -0.7, 0.62), W_)  # lower front shelf
        if lod == 0:
            for i, kind in enumerate(("tomato", "tomato", "onion", "tomato")):
                x = -0.9 + i * 0.6
                tb = bmesh.new()  # 'debe' tin with a heap of tomatoes on top
                bmesh.ops.create_cone(tb, cap_ends=True, segments=10, radius1=0.12, radius2=0.13, depth=0.18)
                merge_bm(bm, tb, Matrix.Translation((x, -0.3, 0.92)), T_)
                heap(bm, x, -0.3, 1.0, 0.035, 10, kind, P_, base=0.11)
            heap(bm, -0.55, 0.25, 0.83, 0.055, 14, "mango", P_, base=0.25)
            heap(bm, 0.15, 0.25, 0.83, 0.05, 10, "avocado", P_, base=0.2)
            heap(bm, 0.75, 0.25, 0.83, 0.045, 12, "orange", P_, base=0.2)
            for k, x in enumerate((-0.8, -0.2, 0.4, 0.95)):
                banana_bunch(bm, (x, -0.72, 0.66), P_, green=k % 2 == 1)
            for x, txt in ((-0.9, "20/="), (-0.3, "20/="), (0.3, "30/="), (0.9, "10/=")):
                price_card(bm, (x, -0.5, 1.12), txt, C_, I_)
        elif lod == 1:
            for i, x in enumerate((-0.9, -0.3, 0.3, 0.9)):
                blob(bm, (x, -0.3, 0.98), 0.13, kidx("tomato" if i != 2 else "onion"), squash=0.7, sub=1)
            for x, kind in ((-0.55, "mango"), (0.15, "avocado"), (0.75, "orange")):
                blob(bm, (x, 0.25, 0.9), 0.2, kidx(kind), squash=0.5, sub=1)
    else:
        # produce on sacks on the ground + a low bench, potatoes/onions/cabbages/pineapples
        for k, (x, y) in enumerate(((-0.8, -0.2), (0, -0.25), (0.8, -0.2), (-0.4, 0.5), (0.45, 0.5))):
            add_box(bm, (0.75, 0.65, 0.02), (x, y, 0.01), K_)
            kind = ("potato", "onion", "cabbage", "pineapple", "watermelon")[k]
            if lod == 0:
                n, r = {"potato": (16, 0.04), "onion": (16, 0.035), "cabbage": (6, 0.1), "pineapple": (5, 0.07),
                        "watermelon": (3, 0.14)}[kind]
                heap(bm, x, y, 0.02, r, n, kind, P_, base=0.24)
            else:
                blob(bm, (x, y, 0.08), 0.2, kidx(kind), squash=0.45, sub=1)
        add_box(bm, (1.6, 0.35, 0.05), (0, 1.05, 0.42), W_)
        for x in (-0.7, 0.7):
            add_box(bm, (0.06, 0.3, 0.42), (x, 1.05, 0.21), W_)
        if lod == 0:
            for x, txt in ((-0.8, "50/="), (0.0, "20/="), (0.8, "40/=")):
                price_card(bm, (x, -0.6, 0.12), txt, C_, I_)
    STRIPE_B[0] = FB
    if lod < 2:
        umbrella(bm, (0.0, 0.45 if variant == "table" else 0.2, 0), 1.45, 2.55, F_, S_, panels=8 if lod == 0 else 6)
    else:
        add_box(bm, (2.6, 2.6, 0.05), (0, 0.4, 2.2), F_)
    box_uv(bm, 1.0)
    ob = new_obj(name, bm, mats)
    paint_grime(ob, dust_height=0.35, strength=0.3)
    return ob


@piece("market_stall", collider=lambda ob: [((0, 0, 0.45), (2.4, 1.1, 0.9)), ((0, 0.45, 1.3), (0.08, 0.08, 2.6))], lods=True)
def _(name, lod):
    return stall(name, lod, ((0.85, 0.25, 0.05), (0.75, 0.05, 0.04)), "table")  # orange / red


@piece("market_stall_b", collider=lambda ob: [((0, 1.05, 0.22), (1.6, 0.35, 0.45)), ((0, 0.2, 1.3), (0.08, 0.08, 2.6))], lods=True)
def _(name, lod):
    return stall(name, lod, ((0.05, 0.22, 0.6), (0.85, 0.85, 0.85)), "ground")  # blue / white


@piece("chips_booth", collider=lambda ob: [((0, 0, 0.55), (3.2, 2.2, 1.1))], lods=True)
def _(name, lod):
    """Chipoz-style chips booth (fictional CHIPO EXPRESS): curved orange counter, steel worktop,
    posts, sign band with zig-zag tribal pattern and a yellow light-box name."""
    random.seed(7)
    mats = [ORANGE, STEEL, SIGN_Y, pbr("sign_band", color=(0.35, 0.16, 0.08), rough=0.6, metal=0.0),
            pbr("band_pattern", color=(0.9, 0.55, 0.25), rough=0.6, metal=0.0), M["glass_dark"], M["timber"]]
    O_, S_, Y_, B_, P_, G_, Wd = range(7)
    w, d = 3.2, 2.2
    bm = bmesh.new()
    # counter ring (front + sides), rounded front corners approximated by bevelled boxes
    add_box(bm, (w, 0.12, 1.05), (0, -d / 2, 0.525), O_)
    add_box(bm, (0.12, d, 1.05), (-w / 2, 0, 0.525), O_)
    add_box(bm, (0.12, d * 0.5, 1.05), (w / 2, -d * 0.25, 0.525), O_)
    add_box(bm, (w + 0.1, 0.42, 0.05), (0, -d / 2 + 0.12, 1.08), S_)     # steel worktop
    add_box(bm, (0.42, d, 0.05), (-w / 2 + 0.12, 0, 1.08), S_)
    for x, y in ((-w / 2, -d / 2), (w / 2, -d / 2), (-w / 2, d / 2), (w / 2, d / 2)):
        add_box(bm, (0.06, 0.06, 2.6), (x, y, 1.3), Wd)
    add_box(bm, (w + 0.3, d + 0.3, 0.12), (0, 0, 2.62), B_)              # roof
    add_box(bm, (w + 0.3, 0.1, 0.55), (0, -d / 2 - 0.15, 2.4), B_)        # sign band
    if lod == 0:
        for i in range(16):                                               # zig-zag pattern
            x = -w / 2 + 0.1 + i * (w + 0.1) / 16
            tri = bmesh.new()
            vs = [tri.verts.new(p) for p in ((x, 0, 0), (x + 0.1, 0, 0.32), (x + 0.2, 0, 0))]
            tri.faces.new(vs)
            merge_bm(bm, tri, Matrix.Translation((0, -d / 2 - 0.21, 2.2)), P_)
        fr = bmesh.new()                                                  # fryer + glass cabinet
        add_box(fr, (0.7, 0.5, 0.35), (0, 0, 0), S_)
        merge_bm(bm, fr, Matrix.Translation((0.6, 0.2, 1.28)), S_)
        add_box(bm, (0.9, 0.4, 0.45), (-0.6, -d / 2 + 0.2, 1.33), G_)
    box_uv(bm, 1.0)
    for i, line in enumerate(["CHIPO EXPRESS"] if lod < 2 else []):
        t = text_mesh(line, 0.36, depth=0.03, resolution=(3, 1, 1)[lod])
        merge_bm(bm, t, Matrix.Translation((0, -d / 2 - 0.25, 2.42)) @ Matrix.Rotation(math.pi / 2, 4, "X"), Y_)
    ob = new_obj(name, bm, mats)
    paint_grime(ob, dust_height=0.4, strength=0.25)
    return ob


@piece("crate_stack", collider="box")
def _(name):
    """Stack of red and yellow plastic soda crates."""
    bm = bmesh.new()
    for i in range(4):
        add_box(bm, (0.42, 0.3, 0.27), (0.0 if i % 2 == 0 else 0.03, 0, 0.135 + i * 0.27), i % 2)
    box_uv(bm, 0.5)
    return new_obj(name, bm, [M["plastic_red"], M["plastic_yellow"]])


@piece("sack_pile", collider="hull")
def _(name):
    """Sacks of charcoal / potatoes."""
    random.seed(3)
    bm = bmesh.new()
    for i, (x, y, z) in enumerate(((-0.25, 0, 0.3), (0.3, 0.05, 0.3), (0.0, 0.0, 0.75))):
        b = bmesh.new()
        bmesh.ops.create_icosphere(b, subdivisions=2, radius=0.32)
        for v in b.verts:
            v.co.z *= 1.15
            v.co *= 1 + random.uniform(-0.05, 0.05)
        merge_bm(bm, b, Matrix.Translation((x, y, z)), 0)
    box_uv(bm, 0.8)
    ob = new_obj(name, bm, [SACK])
    paint_grime(ob, dust_height=0.4, strength=0.4)
    return ob


def _shots(shot, x):
    sx = PIECES["market_stall"][0].location.x
    shot("market_stalls.png", (sx + 1.8, -5.2, 1.8), (sx + 1.8, 0, 0.9))
    bx = PIECES["chips_booth"][0].location.x
    shot("market_chips.png", (bx, -6.5, 1.9), (bx, 0, 1.5))


finish("market_kit.glb", _shots)
