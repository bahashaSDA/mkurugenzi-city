"""Town kit: the buildings of the outer towns (SPEC section 6 districts) and the CBD.
Facades are bay-by-floor grids, each quad mapped to one painted tile (tools/paint_facades.py), so
one material covers a whole street with no visible stretching. Plaster colours vary by vertex tint.

  bld_shops_2/3/4   commercial block, ground-floor shops under a veranda, 2-4 floors above
  bld_apart_5       5-storey apartment block, balconies with washing
  bld_office_8      8-storey office block, ribbon windows, glass lobby
  bld_tower_a/b     glass towers (16 / 22 floors)
  mk_tower          Mkurugenzi Tower (CBD landmark, ~110 m, glowing crown sign)
  house_bungalow_a/b, house_maisonette   suburban homes behind stone walls and black gates
  petrol_station, church, school_block ("Freddie's School"), studio_hangar ("Phil-It Studios"),
  arena ("Wakurugenzi Arena"), fire_circle ("Storyteller's Fire")
All signs and business names are original (no real brands).
  blender -b --factory-startup -P blender/scripts/build_town_kit.py -- --out public/models/raw [--preview blender/previews]
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
subprocess.run(["python", os.path.join(ROOT, "tools", "paint_facades.py"), GEN], check=True)


def image_mat(name, file, rough=0.8, metal=0.0, glow=False):
    mat = bpy.data.materials.new(name + ("_glow" if glow else ""))
    mat.use_nodes = True
    nt = mat.node_tree
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = bpy.data.images.load(os.path.join(GEN, file), check_existing=True)
    b = nt.nodes["Principled BSDF"]
    nt.links.new(t.outputs["Color"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    return mat


UPPER = image_mat("fac_upper", "fac_upper.png")
SHOPS = image_mat("fac_shops", "fac_shops.png")
GLASSF = image_mat("fac_glass", "fac_glass.png", rough=0.12, metal=0.55)
HOUSE = image_mat("fac_house", "fac_house.png")
CONC = pbr("town_concrete", "Concrete034")
STONE = pbr("town_stone", "Bricks059")
ROOFT = pbr("roof_tiles", "RoofingTiles006")
MABATI = pbr("town_mabati", "CorrugatedSteel005", tint=(0.55, 0.36, 0.25), metal=0.15, rough=0.8)
STEEL = pbr("steel_black", color=(0.03, 0.03, 0.035), rough=0.5, metal=0.6)
WHITE = pbr("paint_white", color=(0.9, 0.9, 0.88), rough=0.6, metal=0.0)
BLUE = pbr("paint_blue", color=(0.1, 0.25, 0.6), rough=0.6, metal=0.0)
RED = pbr("paint_red", color=(0.65, 0.06, 0.08), rough=0.5, metal=0.0)
GRASS = pbr("pitch_grass", color=(0.16, 0.42, 0.12), rough=0.95, metal=0.0)
SEATS = pbr("stand_seats", color=(0.75, 0.1, 0.12), rough=0.7, metal=0.0)
LIGHT = pbr("lamp_glow", color=(1.0, 0.95, 0.85), rough=0.3, metal=0.0)
EMBER = pbr("ember_glow", color=(1.0, 0.42, 0.08), rough=0.4, metal=0.0)
LOGS = pbr("logs_bark", color=(0.28, 0.18, 0.1), rough=0.9, metal=0.0)
TANK = pbr("tank_black", color=(0.05, 0.05, 0.05), rough=0.6, metal=0.0)


def sign_mat(file):
    return image_mat(file.replace(".png", ""), file, rough=0.5, glow=True)


# ----------------------------------------------------------------------------- geometry helpers
def quad_grid(bm, origin, along, up, width, height, nx, ny, uv_of, mi):
    """Grid of quads on a plane; uv_of(ix, iy) -> (u0, v0, u1, v1) tile rect for that cell."""
    uv = bm.loops.layers.uv.verify()
    o, a, u = Vector(origin), Vector(along).normalized(), Vector(up).normalized()
    verts = [[bm.verts.new(o + a * (width * i / nx) + u * (height * j / ny)) for j in range(ny + 1)] for i in range(nx + 1)]
    for i in range(nx):
        for j in range(ny):
            f = bm.faces.new((verts[i][j], verts[i + 1][j], verts[i + 1][j + 1], verts[i][j + 1]))
            f.material_index = mi
            u0, v0, u1, v1 = uv_of(i, j)
            for loop, (uu, vv) in zip(f.loops, ((u0, v0), (u1, v0), (u1, v1), (u0, v1))):
                loop[uv].uv = (uu, vv)


def facades(bm, w, d, z0, height, floors, bay, uv_of, mi):
    """Four outward-facing facades of a w x d box from z0 (front faces -Y)."""
    hw, hd = w / 2, d / 2
    sides = [((-hw, -hd, z0), (1, 0, 0), w), ((hw, -hd, z0), (0, 1, 0), d), ((hw, hd, z0), (-1, 0, 0), w), ((-hw, hd, z0), (0, -1, 0), d)]
    for k, (o, a, ln) in enumerate(sides):
        nx = max(1, round(ln / bay))
        quad_grid(bm, o, a, (0, 0, 1), ln, height, nx, floors, lambda i, j, k=k: uv_of(k, i, j), mi)


def cap(bm, w, d, z, mi, tile=4.0):
    add_box(bm, (w, d, 0.2), (0, 0, z + 0.1), mi)


def tile_rect(col, row, cols, rows):
    return (col / cols, row / rows, (col + 1) / cols, (row + 1) / rows)


def cyl(bm, center, r, h, mi, seg=12):
    t = bmesh.new()
    bmesh.ops.create_cone(t, cap_ends=True, segments=seg, radius1=r, radius2=r, depth=h)
    merge_bm(bm, t, Matrix.Translation(center), mi)


def hip_roof(bm, w, d, z, rise, mi, over=0.6):
    """Hipped roof over a w x d plan (Kenyan bungalow)."""
    t = bmesh.new()
    hw, hd = w / 2 + over, d / 2 + over
    ridge = max(0.0, (w - d) / 2) if w > d else 0.0
    a = [t.verts.new(p) for p in ((-hw, -hd, z), (hw, -hd, z), (hw, hd, z), (-hw, hd, z))]
    r0 = t.verts.new((-ridge, 0, z + rise))
    r1 = t.verts.new((ridge, 0, z + rise))
    t.faces.new((a[0], a[1], r1, r0))
    t.faces.new((a[1], a[2], r1))
    t.faces.new((a[2], a[3], r0, r1))
    t.faces.new((a[3], a[0], r0))
    bmesh.ops.recalc_face_normals(t, faces=t.faces)
    box_uv(t, 2.0)
    merge_bm(bm, t, Matrix.Identity(4), mi)


def gable_roof(bm, w, d, z, rise, mi, over=0.5):
    t = bmesh.new()
    hw, hd = w / 2 + over, d / 2 + over
    a = [t.verts.new(p) for p in ((-hw, -hd, z), (hw, -hd, z), (hw, hd, z), (-hw, hd, z), (-hw, 0, z + rise), (hw, 0, z + rise))]
    t.faces.new((a[0], a[1], a[5], a[4]))
    t.faces.new((a[2], a[3], a[4], a[5]))
    t.faces.new((a[1], a[2], a[5]))
    t.faces.new((a[3], a[0], a[4]))
    bmesh.ops.recalc_face_normals(t, faces=t.faces)
    box_uv(t, 2.0)
    merge_bm(bm, t, Matrix.Identity(4), mi)


def sign_board(bm, w, h, center, rot_z, mi):
    t = bmesh.new()
    uv = t.loops.layers.uv.verify()
    vs = [t.verts.new(p) for p in ((-w / 2, 0, -h / 2), (w / 2, 0, -h / 2), (w / 2, 0, h / 2), (-w / 2, 0, h / 2))]
    f = t.faces.new(vs)
    for loop, c in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
        loop[uv].uv = c
    merge_bm(bm, t, Matrix.Translation(center) @ Matrix.Rotation(rot_z, 4, "Z"), mi)


def finish_obj(name, bm, mats, tint=None, grime=0.35):
    ob = new_obj(f"{name}_LOD0", bm, mats)  # runtime + finish() look for <piece>_LOD0
    paint_grime(ob, dust_height=1.2, strength=grime, streak=0.2, tint=tint)
    return ob


PLASTER = [(1.0, 0.97, 0.9), (1.0, 0.86, 0.72), (0.82, 0.9, 1.0), (0.86, 1.0, 0.86), (1.0, 0.92, 0.8), (0.95, 0.95, 0.95)]


# ----------------------------------------------------------------------------- buildings
def commercial(name, floors, w=16.0, d=14.0, variant=0, seed=0):
    rng = random.Random(seed)
    mats = [UPPER, SHOPS, CONC, TANK, STEEL, MABATI]
    bm = bmesh.new()
    gf = 4.0
    shop0 = rng.randrange(8)
    facades(bm, w, d, 0.0, gf, 1, 4.0, lambda k, i, j: tile_rect((shop0 + k * 3 + i) % 8, 0, 8, 1), 1)
    up_h = floors * 3.5
    facades(bm, w, d, gf, up_h, floors, 4.0, lambda k, i, j: tile_rect(variant % 2, 1 - variant // 2, 2, 2), 0)
    top = gf + up_h
    cap(bm, w, d, top, 2)
    for k in range(4):  # parapet
        a = k * math.pi / 2
        L = w if k % 2 == 0 else d
        off = d / 2 if k % 2 == 0 else w / 2
        add_box(bm, (L, 0.25, 0.9) if k % 2 == 0 else (0.25, L, 0.9),
                (0, -off if k == 0 else off, top + 0.6) if k % 2 == 0 else (off if k == 1 else -off, 0, top + 0.6), 2)
    # veranda canopy over the shopfront (front and one side), on thin steel posts
    add_box(bm, (w + 0.4, 1.8, 0.15), (0, -d / 2 - 0.9, gf - 0.1), 2)
    for x in (-w / 2 + 0.3, 0, w / 2 - 0.3):
        add_box(bm, (0.12, 0.12, gf - 0.2), (x, -d / 2 - 1.65, (gf - 0.2) / 2), 4)
    for _ in range(rng.randint(1, 3)):  # water tanks
        cyl(bm, (rng.uniform(-w / 3, w / 3), rng.uniform(-d / 3, d / 3), top + 1.1), 0.75, 1.6, 3)
    if rng.random() < 0.5:  # rooftop mabati shed
        add_box(bm, (3, 3, 2.2), (w / 4, d / 4, top + 1.2), 5)
    ob = finish_obj(name, bm, mats, tint={0: PLASTER[seed % len(PLASTER)]})
    return ob, [((0, 0, top / 2), (w, d, top))]


def apartment(name, floors=5, w=22.0, d=12.0, seed=0):
    mats = [UPPER, CONC, TANK, STEEL]
    bm = bmesh.new()
    facades(bm, w, d, 0.0, floors * 3.2, floors, 3.6, lambda k, i, j: tile_rect(1 if j == 0 else 1, 0 if (i + j) % 3 else 1, 2, 2), 0)
    top = floors * 3.2
    cap(bm, w, d, top, 1)
    for x in (-w / 3, 0, w / 3):
        cyl(bm, (x, 0, top + 1.0), 0.8, 1.6, 2)
    add_box(bm, (2.2, 0.6, 2.4), (0, -d / 2 - 0.3, 1.2), 3)  # gate/door
    return finish_obj(name, bm, mats, tint={0: PLASTER[(seed + 2) % len(PLASTER)]})


def office(name, floors=8, w=26.0, d=20.0):
    mats = [UPPER, GLASSF, CONC]
    bm = bmesh.new()
    facades(bm, w, d, 0.0, 4.5, 1, 4.5, lambda k, i, j: (0, 0, 1, 1), 1)  # glass lobby
    facades(bm, w, d, 4.5, floors * 3.6, floors, 4.0, lambda k, i, j: tile_rect(0, 0, 2, 2), 0)
    cap(bm, w, d, 4.5 + floors * 3.6, 2)
    add_box(bm, (w * 0.4, d * 0.4, 3.0), (0, 0, 4.5 + floors * 3.6 + 1.5), 2)  # plant room
    return finish_obj(name, bm, mats, grime=0.2)


def tower(name, floors, w, tint):
    mats = [GLASSF, CONC, STONE, STEEL]
    bm = bmesh.new()
    facades(bm, w + 6, w + 6, 0.0, 8.0, 2, 4.0, lambda k, i, j: (0.0, 0.0, 1.0, 1.0), 2)  # stone podium
    cap(bm, w + 6, w + 6, 8.0, 1)
    facades(bm, w, w, 8.0, floors * 3.6, floors, 3.6, lambda k, i, j: (0, 0, 1, 1), 0)
    top = 8.0 + floors * 3.6
    cap(bm, w, w, top, 1)
    add_box(bm, (w * 0.6, w * 0.6, 5.0), (0, 0, top + 2.5), 1)
    cyl(bm, (0, 0, top + 9), 0.25, 8, 3, 6)
    return finish_obj(name, bm, mats, tint={0: tint}, grime=0.1)


def mk_tower(name):
    sign = sign_mat("sign_tower.png")
    mats = [GLASSF, CONC, STONE, STEEL, sign, LIGHT]
    bm = bmesh.new()
    facades(bm, 44, 44, 0.0, 10.0, 2, 5.0, lambda k, i, j: (0.0, 0.0, 1.0, 1.0), 2)
    cap(bm, 44, 44, 10.0, 1)
    floors = 26
    facades(bm, 30, 30, 10.0, floors * 3.6, floors, 3.75, lambda k, i, j: (0, 0, 1, 1), 0)
    top = 10.0 + floors * 3.6
    cap(bm, 30, 30, top, 1)
    facades(bm, 24, 24, top + 0.2, 8.0, 2, 4.0, lambda k, i, j: (0, 0, 1, 1), 0)  # crown
    cap(bm, 24, 24, top + 8.2, 1)
    for k in range(4):  # MKURUGENZI sign on all four sides of the crown
        a = k * math.pi / 2
        c = Vector((math.sin(a) * 12.15, -math.cos(a) * 12.15, top + 4.2))
        sign_board(bm, 20, 3.75, c, a, 4)
    cyl(bm, (0, 0, top + 24), 0.4, 32, 3, 8)  # spire
    cyl(bm, (0, 0, top + 40.2), 0.6, 0.6, 5, 8)  # beacon
    return finish_obj(name, bm, mats, tint={0: (0.75, 0.88, 1.0)}, grime=0.08)


def bungalow(name, seed, two_storey=False):
    rng = random.Random(seed)
    mats = [HOUSE, ROOFT, STONE, STEEL, CONC, CONC]  # drive uses the concrete already in the kit
    bm = bmesh.new()
    w, d = (12.0, 9.0) if not two_storey else (11.0, 9.0)
    floors = 2 if two_storey else 1
    hy = 3.0  # house sits towards the back of a 22 x 22 plot
    facades_at(bm, w, d, (0, hy, 0), floors * 3.0, floors, 4.0, lambda k, i, j: (0, 0, 1, 1), 0)
    t = bmesh.new()
    hip_roof(t, w, d, floors * 3.0, 2.2, 1)
    merge_bm(bm, t, Matrix.Translation((0, hy, 0)), 1)
    # perimeter wall (stone, 2.2 m) with a black steel gate in the front
    P = 11.0
    for (x, y, sx, sy) in [(0, P, 2 * P, 0.25), (-P, 0, 0.25, 2 * P), (P, 0, 0.25, 2 * P)]:
        add_box(bm, (sx, sy, 2.2), (x, y, 1.1), 2)
    add_box(bm, (P - 2.2, 0.25, 2.2), (-(P + 2.2) / 2, -P, 1.1), 2)
    add_box(bm, (P - 2.2, 0.25, 2.2), ((P + 2.2) / 2, -P, 1.1), 2)
    add_box(bm, (4.4, 0.08, 2.0), (0, -P, 1.1), 3)  # gate
    add_box(bm, (4.0, 7.0, 0.05), (0, -P + 3.7, 0.03), 4)  # paved drive
    if rng.random() < 0.6:
        add_box(bm, (1.0, 1.0, 1.4), (P - 1.5, P - 1.5, 0.7), 5)  # water tank stand
    ob = finish_obj(name, bm, mats, tint={0: PLASTER[seed % len(PLASTER)]})
    h = floors * 3.0
    return ob, [((0, hy, h / 2 + 1), (w, d, h + 2)), ((0, P, 1.1), (2 * P, 0.3, 2.2)), ((-P, 0, 1.1), (0.3, 2 * P, 2.2)),
                ((P, 0, 1.1), (0.3, 2 * P, 2.2)), ((-(P + 2.2) / 2, -P, 1.1), (P - 2.2, 0.3, 2.2)), (((P + 2.2) / 2, -P, 1.1), (P - 2.2, 0.3, 2.2)),
                ((0, -P, 1.1), (4.4, 0.2, 2.0))]  # the gate is solid: walk round to the door via the interior system


def facades_at(bm, w, d, offset, height, floors, bay, uv_of, mi):
    t = bmesh.new()
    facades(t, w, d, 0.0, height, floors, bay, uv_of, mi)
    merge_bm_keep_uv(bm, t, Matrix.Translation(offset))


def merge_bm_keep_uv(dst, src, matrix):
    me = bpy.data.meshes.new("tmp")
    src.to_mesh(me)
    src.free()
    me.transform(matrix)
    dst.from_mesh(me)
    bpy.data.meshes.remove(me)


def petrol(name):
    sign = sign_mat("sign_petrol.png")
    mats = [CONC, WHITE, RED, STEEL, sign, LIGHT, UPPER, SHOPS]
    bm = bmesh.new()
    add_box(bm, (16, 11, 0.8), (0, 0, 5.4), 1)  # canopy
    add_box(bm, (16.1, 11.1, 0.3), (0, 0, 5.0), 2)  # red fascia band
    for x in (-5, 5):
        for y in (-3, 3):
            add_box(bm, (0.5, 0.5, 5.0), (x, y, 2.5), 1)
    for x in (-5, 5):
        add_box(bm, (1.0, 0.6, 1.6), (x, 0, 0.8), 2)  # pumps
    add_box(bm, (16, 11, 0.12), (0, 0, 0.06), 0)
    facades_at(bm, 10, 7, (0, 12, 0), 3.8, 1, 5.0, lambda k, i, j: tile_rect(i % 8, 0, 8, 1), 7)  # shop
    cap(bm, 10, 7, 3.8, 0)
    t = bmesh.new()
    add_box(t, (10, 7, 0.2), (0, 12, 3.9), 0)
    merge_bm(bm, t, Matrix.Identity(4), 0)
    add_box(bm, (0.4, 0.4, 7.0), (9.5, -7, 3.5), 3)  # totem sign
    sign_board(bm, 2.6, 1.0, Vector((9.5, -7.25, 6.4)), 0, 4)
    sign_board(bm, 8.0, 1.6, Vector((0, -5.56, 5.4)), 0, 4)
    ob = finish_obj(name, bm, mats, grime=0.2)
    cols = [((0, 12, 2), (10, 7, 4)), ((9.5, -7, 3.5), (0.5, 0.5, 7))]
    cols += [((x, y, 2.5), (0.6, 0.6, 5)) for x in (-5, 5) for y in (-3, 3)]
    cols += [((x, 0, 0.8), (1.0, 0.6, 1.6)) for x in (-5, 5)]
    return ob, cols


def church(name):
    sign = sign_mat("sign_church.png")
    mats = [HOUSE, MABATI, STONE, WHITE, sign]
    bm = bmesh.new()
    facades(bm, 12, 24, 0.0, 6.0, 1, 4.0, lambda k, i, j: (0, 0, 1, 1), 0)
    gable_roof(bm, 12, 24, 6.0, 3.5, 1)
    t = bmesh.new()
    add_box(t, (4.5, 4.5, 15.0), (0, -14.0, 7.5), 2)  # bell tower
    merge_bm(bm, t, Matrix.Identity(4), 2)
    add_box(bm, (0.3, 0.3, 2.6), (0, -14.0, 16.3), 3)
    add_box(bm, (1.6, 0.3, 0.3), (0, -14.0, 16.9), 3)
    sign_board(bm, 6.0, 1.1, Vector((0, -16.3, 4.0)), 0, 4)
    return finish_obj(name, bm, mats)


def school(name):
    sign = sign_mat("sign_school.png")
    mats = [HOUSE, MABATI, BLUE, STEEL, sign, CONC]
    bm = bmesh.new()
    facades(bm, 34, 8, 0.0, 3.4, 1, 4.25, lambda k, i, j: (0, 0, 1, 1), 0)
    gable_roof(bm, 34, 8, 3.4, 1.6, 1, over=1.2)
    for x in range(-14, 16, 7):
        add_box(bm, (1.0, 0.1, 2.2), (x, -4.05, 1.1), 2)  # blue classroom doors
    add_box(bm, (34, 2.4, 0.3), (0, -5.3, 0.15), 5)  # veranda floor
    for x in (-6, 6):
        add_box(bm, (0.15, 0.15, 3.2), (x, -18, 1.6), 3)
    sign_board(bm, 12.0, 2.2, Vector((0, -18.1, 3.6)), 0, 4)
    add_box(bm, (0.12, 0.12, 9.0), (14, -16, 4.5), 3)  # flagpole
    ob = finish_obj(name, bm, mats)
    return ob, [((0, 0, 2.5), (34, 8, 5)), ((-6, -18, 1.6), (0.3, 0.3, 3.2)), ((6, -18, 1.6), (0.3, 0.3, 3.2)), ((14, -16, 4.5), (0.3, 0.3, 9))]


def ring(A, B, n, depth, height, z0=0.0):
    """Segments around an ellipse (semi-axes A, B): (center, length, angle) per segment."""
    out = []
    for k in range(n):
        t0, t1 = 2 * math.pi * k / n, 2 * math.pi * (k + 1) / n
        p0 = Vector((A * math.cos(t0), B * math.sin(t0)))
        p1 = Vector((A * math.cos(t1), B * math.sin(t1)))
        m = (p0 + p1) / 2
        out.append(((m.x, m.y, z0 + height / 2), (p1 - p0).length + 0.35, math.atan2(p1.y - p0.y, p1.x - p0.x)))
    return out


def studio(name):
    sign = sign_mat("sign_studio.png")
    mats = [MABATI, CONC, STEEL, sign, WHITE]
    bm = bmesh.new()
    t = bmesh.new()  # arched sound stage: half-cylinder roof along Y, end walls
    R, Hh, L, seg = 15.0, 12.0, 40.0, 14
    arcs = []
    for y in (-L / 2, L / 2):
        arcs.append([t.verts.new((R * math.cos(math.pi * k / seg), y, Hh * math.sin(math.pi * k / seg))) for k in range(seg + 1)])
    for k in range(seg):
        t.faces.new((arcs[0][k], arcs[0][k + 1], arcs[1][k + 1], arcs[1][k]))
    t.faces.new(arcs[0][::-1])
    t.faces.new(arcs[1])
    bmesh.ops.recalc_face_normals(t, faces=t.faces)
    box_uv(t, 2.0)
    merge_bm(bm, t, Matrix.Identity(4), 0)
    add_box(bm, (12, 0.3, 9.0), (0, -L / 2 - 0.15, 4.5), 2)  # big sliding door
    sign_board(bm, 18, 3.4, Vector((0, -L / 2 - 0.35, 10.2)), 0, 3)
    ob = finish_obj(name, bm, mats)
    return ob, [((0, 0, 4.5), (2 * R * 0.85, L, 9.0)), ((0, 0, 10.5), (2 * R * 0.5, L, 3.0))]


def arena(name):
    sign = sign_mat("sign_arena.png")
    mats = [CONC, SEATS, GRASS, STEEL, sign, LIGHT, WHITE]
    bm = bmesh.new()
    add_box(bm, (100, 68, 0.1), (0, 0, 0.05), 2)  # pitch
    for x in (-49, 49):
        add_box(bm, (0.15, 7.3, 2.4), (x, 0, 1.2), 6)  # goals
    n = 40
    for row in range(7):  # stepped stands around the oval
        h = 0.8 + row * 1.0
        for (cx, cy, cz), ln, ang in ring(60 + row * 1.6, 44 + row * 1.6, n, 1.6, h):
            if abs(cx) < 8 and cy < 0:
                continue  # tunnel through the stands to the pitch
            t = bmesh.new()
            add_box(t, (ln, 1.6, h), (0, 0, 0), 1)
            merge_bm(bm, t, Matrix.Translation((cx, cy, cz)) @ Matrix.Rotation(ang, 4, "Z"), 1 if row % 2 == 0 else 0)
    for (cx, cy, cz), ln, ang in ring(72.5, 56.5, n, 1.0, 13.0):  # outer wall (gap = entrance)
        if abs(cx) < 8 and cy < 0:
            continue
        t = bmesh.new()
        add_box(t, (ln, 1.0, 13.0), (0, 0, 0), 0)
        merge_bm(bm, t, Matrix.Translation((cx, cy, cz)) @ Matrix.Rotation(ang, 4, "Z"), 0)
    for (x, y) in [(-66, -50), (66, -50), (-66, 50), (66, 50)]:  # floodlight towers
        add_box(bm, (0.8, 0.8, 34), (x, y, 17), 3)
        add_box(bm, (6, 0.8, 3), (x, y, 35), 5)
    sign_board(bm, 40, 5.0, Vector((0, -57.6, 15.0)), 0, 4)
    ob = finish_obj(name, bm, mats, grime=0.25)
    # entrance gap at the front (south) so you can walk in
    cols = [((c[0], c[1], c[2]), (ln, 1.0, 13.0), ang) for c, ln, ang in ring(72.5, 56.5, n, 1.0, 13.0) if not (abs(c[0]) < 8 and c[1] < 0)]
    return ob, cols


def fire_circle(name):
    mats = [STONE, LOGS, EMBER]  # reuse kit materials: keeps town_kit.glb in budget
    bm = bmesh.new()
    for k in range(14):
        a = 2 * math.pi * k / 14
        add_box(bm, (0.5, 0.4, 0.35), (math.cos(a) * 1.4, math.sin(a) * 1.4, 0.17), 0)
    for k in range(5):
        a = 2 * math.pi * k / 5
        t = bmesh.new()
        add_box(t, (0.18, 1.4, 0.18), (0, 0, 0), 1)
        merge_bm(bm, t, Matrix.Translation((math.cos(a) * 0.3, math.sin(a) * 0.3, 0.45)) @ Matrix.Rotation(a, 4, "Z") @ Matrix.Rotation(0.6, 4, "X"), 1)
    add_box(bm, (1.6, 1.6, 0.15), (0, 0, 0.1), 2)  # embers
    for k in range(6):  # log benches around the fire
        a = 2 * math.pi * k / 6
        t = bmesh.new()
        add_box(t, (2.4, 0.45, 0.45), (0, 0, 0.25), 1)
        merge_bm(bm, t, Matrix.Translation((math.cos(a) * 5, math.sin(a) * 5, 0)) @ Matrix.Rotation(a + math.pi / 2, 4, "Z"), 1)
    return finish_obj(name, bm, mats, grime=0.2)


# ----------------------------------------------------------------------------- register
def same_lods(ob):
    """Facade grids are already low-poly, and decimating them scrambles the tile UVs (smeared
    facades in the distance): far LODs share the LOD0 mesh instead."""
    out = []
    for k in (1, 2):
        dup = ob.copy()
        dup.name = ob.name.replace("_LOD0", f"_LOD{k}")
        ob.users_collection[0].objects.link(dup)
        out.append(dup)
    return out


def reg(name, fn, collider="box"):
    ob = fn()
    PIECES[name] = (ob, collider, same_lods(ob))


def reg2(name, fn):
    ob, cols = fn()
    PIECES[name] = (ob, lambda _ob, cols=cols: cols, same_lods(ob) if name != "arena" else None)


reg2("bld_shops_2", lambda: commercial("bld_shops_2", 2, seed=1))
reg2("bld_shops_3", lambda: commercial("bld_shops_3", 3, variant=1, seed=2))
reg2("bld_shops_4", lambda: commercial("bld_shops_4", 4, w=18, d=16, variant=3, seed=3))
reg("bld_apart_5", lambda: apartment("bld_apart_5", seed=4))
reg("bld_office_8", lambda: office("bld_office_8"))
reg("bld_tower_a", lambda: tower("bld_tower_a", 16, 26, (0.7, 0.95, 0.9)))
reg("bld_tower_b", lambda: tower("bld_tower_b", 22, 22, (0.75, 0.85, 1.0)))
reg("mk_tower", lambda: mk_tower("mk_tower"))
reg2("house_bungalow_a", lambda: bungalow("house_bungalow_a", 1))
reg2("house_bungalow_b", lambda: bungalow("house_bungalow_b", 4))
reg2("house_maisonette", lambda: bungalow("house_maisonette", 2, two_storey=True))
reg2("petrol_station", lambda: petrol("petrol_station"))
reg("church", lambda: church("church"))
reg2("school_block", lambda: school("school_block"))
reg2("studio_hangar", lambda: studio("studio_hangar"))
reg("fire_circle", lambda: fire_circle("fire_circle"))
reg2("arena", lambda: arena("arena"))  # hollow: a ring of wall segments, entrance on the south side


def _shots(shot, x):
    for nm in ("bld_shops_3", "mk_tower", "house_bungalow_a", "arena"):
        ob = PIECES[nm][0]
        dims = ob.dimensions
        vx = ob.location.x
        dist = max(dims.x, dims.z) * 1.4 + 10
        shot(f"town_{nm}.png", (vx + dist * 0.5, -dist, dims.z * 0.5 + 3), (vx, 0, dims.z * 0.35))


finish("town_kit.glb", _shots)
