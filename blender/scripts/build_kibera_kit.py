"""Kibera kit, from the owner's Kibera photo: long terraced rows of single rooms squeezed together,
patchwork corrugated roofs (mostly rusted, some new silver, the odd green-painted sheet), stones
and tyres on the roofs, satellite dishes, washing lines; plus enterable homes and a video hall.

Pieces
  kib_row3 / kib_row4 / kib_row6   terraced rows (3.2 m rooms, 3.4 m deep)
  kib_home_open                     enterable room: curtain doorway, bed, table, jiko, TV, chairs...
  kib_video_hall                    plank video hall with chalkboard schedule and a dish
"""
import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Matrix

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from kitlib import *  # noqa: E402,F401,F403
from kitlib import M, PIECES  # noqa: E402

ROOFS = [
    pbr("roof_rust_dark", "CorrugatedSteel005", tint=(0.4, 0.2, 0.11), metal=0.3),
    pbr("roof_rust_orange", "CorrugatedSteel005", tint=(0.6, 0.31, 0.15), metal=0.35),
    pbr("roof_rust_brown", "CorrugatedSteel005", tint=(0.48, 0.3, 0.2), metal=0.35),
    pbr("roof_galvanised", "CorrugatedSteel005", tint=(0.95, 0.95, 0.95), metal=0.6),
    pbr("roof_green_paint", "CorrugatedSteel006A"),
]
ROOF_W = [0.30, 0.30, 0.22, 0.13, 0.05]

# Draw-call discipline: variants above are construction-time slots; finished pieces collapse them
# into a few shared base materials and keep the colour difference as vertex-colour tints.
ROOF_BASE = pbr("kib_roof", "CorrugatedSteel005", metal=0.1, rough=0.8)  # rust: matte, not a mirror
WALL_BASE = pbr("kib_wall", "Plaster007")
WOOD_BASE = pbr("kib_wood", "Planks021")
CLOTH_BASE = pbr("kib_cloth", color=(1, 1, 1), rough=0.9, metal=0.0)
TINT = {  # material object -> (base material, tint)
    "roof_rust_dark": (ROOF_BASE, (0.4, 0.2, 0.11)), "roof_rust_orange": (ROOF_BASE, (0.6, 0.31, 0.15)),
    "roof_rust_brown": (ROOF_BASE, (0.48, 0.3, 0.2)), "roof_galvanised": (ROOF_BASE, (0.95, 0.95, 0.95)),
    "roof_green_paint": (ROOF_BASE, (0.22, 0.5, 0.28)), "mud_plaster": (WALL_BASE, (0.86, 0.72, 0.55)),
    "wall_mabati_rust": (ROOF_BASE, (0.55, 0.38, 0.28)), "wall_block": (WALL_BASE, (0.85, 0.82, 0.76)),
    "wall_plaster_blue": (WALL_BASE, (0.55, 0.7, 0.85)), "timber": (WOOD_BASE, (1, 1, 1)),
    "timber_blue": (WOOD_BASE, (0.35, 0.55, 0.85)), "door_green": (WOOD_BASE, (0.25, 0.55, 0.3)),
    "cloth_0": (CLOTH_BASE, (0.8, 0.15, 0.1)), "cloth_1": (CLOTH_BASE, (0.1, 0.3, 0.7)),
    "cloth_2": (CLOTH_BASE, (0.95, 0.85, 0.2)), "cloth_3": (CLOTH_BASE, (0.9, 0.9, 0.9)),
    "cloth_4": (CLOTH_BASE, (0.2, 0.55, 0.3)),
}


def collapse(ob, **grime):
    """Paint tints + grime into vertex colours, then remap variant slots to shared base materials."""
    mats = list(ob.data.materials)
    tint = {i: TINT[m.name][1] for i, m in enumerate(mats) if m and m.name in TINT}
    paint_grime(ob, tint=tint, **grime)
    bases = []
    remap = {}
    for i, m in enumerate(mats):
        b = TINT[m.name][0] if m and m.name in TINT else m
        if b not in bases:
            bases.append(b)
        remap[i] = bases.index(b)
    idx = [remap[p.material_index] for p in ob.data.polygons]
    # replace slots in place (materials.clear() resets face indices), then drop the unused tail
    for i, b in enumerate(bases):
        ob.data.materials[i] = b
    while len(ob.data.materials) > len(bases):
        ob.data.materials.pop(index=len(ob.data.materials) - 1)
    ob.data.polygons.foreach_set("material_index", idx)
    ob.data.update()
    return ob  # how common each sheet is (photo: overwhelmingly rust)
WALLS = [
    M["mud_plaster"],
    pbr("wall_mabati_rust", "CorrugatedSteel005", tint=(0.55, 0.38, 0.28), metal=0.3),
    pbr("wall_block", "Concrete040", tint=(0.85, 0.8, 0.72)),
    pbr("wall_plaster_blue", "PaintedPlaster017", tint=(0.55, 0.7, 0.85)),
]
WALL_W = [0.45, 0.3, 0.18, 0.07]
DOORS = [M["timber"], M["timber_blue"], pbr("door_green", "Planks021", tint=(0.25, 0.55, 0.3)), M["steel"]]
CLOTH = M["cloth"]

ROOM_W, ROOM_D = 3.2, 3.4


def pick(items, weights):
    return random.choices(range(len(items)), weights=weights)[0]


def row(name, lod, rooms):
    random.seed(hash(name) & 0xFFFF)
    mats = WALLS + ROOFS + DOORS + [M["stone"], M["rubber"], M["steel"], M["glass_dark"]] + CLOTH
    W0, R0, D0 = 0, len(WALLS), len(WALLS) + len(ROOFS)
    STONE, TYRE, STEEL, GLASS = D0 + 4, D0 + 5, D0 + 6, D0 + 7
    CL0 = D0 + 8
    length = rooms * ROOM_W
    bm = bmesh.new()
    pitch = math.radians(random.uniform(7, 12))
    rise = math.tan(pitch) * ROOM_D
    if lod == 2:
        # far LOD: one shell for the whole row + one patchwork roof slab per room (~120 tris)
        add_box(bm, (length, ROOM_D, 2.35), (0, 0, 1.175), W0)
        for k in range(rooms):
            x = -length / 2 + ROOM_W * (k + 0.5)
            rb = bmesh.new()
            flat_sheet(rb, ROOM_W + 0.05, (ROOM_D + 0.5) / math.cos(pitch), R0 + pick(ROOFS, ROOF_W))
            box_uv(rb, 1.6)
            merge_bm(bm, rb, Matrix.Translation((x, 0.02, 2.35 + rise / 2 + 0.04)) @ Matrix.Rotation(pitch, 4, "X"),
                     R0 + pick(ROOFS, ROOF_W))
        box_uv(bm, 2.0)
        return collapse(new_obj(name, bm, mats), dust_height=0.6, strength=0.6)
    for k in range(rooms):
        x = -length / 2 + ROOM_W * (k + 0.5)
        h = random.uniform(2.2, 2.55)
        wall = W0 + pick(WALLS, WALL_W)
        add_box(bm, (ROOM_W - 0.02, ROOM_D, h), (x, 0, h / 2), wall)
        for v in bm.verts:  # back wall higher (mono-pitch), only this room's top verts
            if abs(v.co.x - x) < ROOM_W / 2 + 1e-3 and v.co.z > h - 1e-4 and v.co.y > 0 and v.co.z < h + 0.01:
                v.co.z += rise
        if lod < 2:
            add_box(bm, (0.8, 0.05, 1.85), (x - 0.6, -ROOM_D / 2 - 0.02, 0.93), D0 + random.randrange(len(DOORS)))
            if random.random() < 0.6:
                add_box(bm, (0.55, 0.04, 0.5), (x + 0.75, -ROOM_D / 2 - 0.02, 1.45), GLASS if random.random() < 0.3 else D0)
        # roof: 3-4 sheets per room, each a random patchwork material, slight jitter
        nsheets = 4
        sw = (ROOM_W + 0.2) / nsheets
        for sidx in range(nsheets):
            mat = R0 + pick(ROOFS, ROOF_W)
            sx = x - (ROOM_W + 0.2) / 2 + sw * (sidx + 0.5)
            rb = bmesh.new()
            ln = (ROOM_D + 0.5) / math.cos(pitch)
            if lod == 0:
                corrugated_sheet(rb, sw + 0.06, ln, mat_index=mat)
            elif lod == 1:
                flat_sheet(rb, sw + 0.04, ln, mat)
            else:
                if sidx:
                    rb.free()
                    continue
                flat_sheet(rb, ROOM_W + 0.2, ln, mat)
                sx = x
            box_uv(rb, 1.6)
            jit = random.uniform(-0.03, 0.03)
            merge_bm(bm, rb, Matrix.Translation((sx, 0.02, h + rise / 2 + 0.04 + jit))
                     @ Matrix.Rotation(pitch + random.uniform(-0.03, 0.03), 4, "X"), mat)
        if lod == 0:
            for _ in range(random.randint(1, 4)):  # stones holding the sheets down
                sb = bmesh.new()
                bmesh.ops.create_icosphere(sb, subdivisions=1, radius=random.uniform(0.08, 0.14))
                y = random.uniform(-ROOM_D / 2, ROOM_D / 2)
                merge_bm(bm, sb, Matrix.Translation((x + random.uniform(-1.3, 1.3), y, h + rise * (y / ROOM_D + 0.5) + 0.1)), STONE)
            if random.random() < 0.3:
                tb = bmesh.new()
                bmesh.ops.create_cone(tb, cap_ends=True, segments=12, radius1=0.3, radius2=0.3, depth=0.16)
                y = random.uniform(-1, 1)
                merge_bm(bm, tb, Matrix.Translation((x, y, h + rise * (y / ROOM_D + 0.5) + 0.12)) @ Matrix.Rotation(pitch, 4, "X"), TYRE)
            if random.random() < 0.18:  # satellite dish (very common on Kibera roofs)
                db = bmesh.new()
                bmesh.ops.create_cone(db, cap_ends=True, segments=10, radius1=0.32, radius2=0.04, depth=0.1)
                merge_bm(bm, db, Matrix.Translation((x + 0.8, -0.6, h + rise * 0.35 + 0.45)) @ Matrix.Rotation(1.2, 4, "X"), STEEL)
            if random.random() < 0.35:  # washing line in front of the door
                add_box(bm, (2.6, 0.01, 0.01), (x, -ROOM_D / 2 - 0.9, 1.9), STEEL)
                for c in range(random.randint(2, 4)):
                    add_box(bm, (0.4, 0.015, 0.55), (x - 1 + c * 0.6, -ROOM_D / 2 - 0.9, 1.6), CL0 + random.randrange(len(CLOTH)))
    box_uv(bm, 2.0)
    ob = new_obj(name, bm, mats)
    return collapse(ob, dust_height=0.6, strength=0.65, streak=0.15, rust=0.35, rust_mats=tuple(range(R0, R0 + 3)))


def row_collider(rooms):
    def f(_ob):
        return [((0, 0, 1.3), (rooms * ROOM_W, ROOM_D, 2.6))]
    return f


for _n in (3, 4, 6):
    def _make(name, lod, n=_n):
        return row(name, lod, n)
    _built = []
    for _lod in range(3):
        _o = _make(f"kib_row{_n}", _lod)
        _o.name = f"kib_row{_n}_LOD{_lod}"
        _built.append(_o)
    PIECES[f"kib_row{_n}"] = (_built[0], row_collider(_n), _built[1:])


def home_open(name, lod):
    """Enterable single room (3.6 x 3.6 m): curtain doorway (no door collider), furnished inside."""
    random.seed(11)
    w, d, h = 3.6, 3.6, 2.45
    mats = [M["mud_plaster"], ROOFS[1], M["timber"], CLOTH[1], CLOTH[0], M["plastic_red"], M["rust_metal"],
            M["glass_dark"], pbr("blanket", color=(0.55, 0.08, 0.1), rough=0.95, metal=0.0),
            pbr("floor_cement", "Concrete040", tint=(0.7, 0.68, 0.64)), M["plastic_black"], CLOTH[2],
            pbr("bulb_glow", color=(1.0, 0.85, 0.55), rough=0.3, metal=0.0)]
    WALL, ROOF, WOOD, CURT, CL, CHAIR, JIKO, TV, BLANK, FLOOR, BLACK, CL2, BULB = range(13)
    bm = bmesh.new()
    t = 0.12
    add_box(bm, (w, t, h), (0, d / 2 - t / 2, h / 2), WALL)          # back
    add_box(bm, (t, d, h), (-w / 2 + t / 2, 0, h / 2), WALL)         # left
    add_box(bm, (t, d, h), (w / 2 - t / 2, 0, h / 2), WALL)          # right
    door_w = 1.0
    add_box(bm, ((w - door_w) / 2, t, h), (-w / 4 - door_w / 4, -d / 2 + t / 2, h / 2), WALL)  # front left
    add_box(bm, ((w - door_w) / 2, t, h), (w / 4 + door_w / 4, -d / 2 + t / 2, h / 2), WALL)   # front right
    add_box(bm, (door_w, t, h - 2.0), (0, -d / 2 + t / 2, 2.0 + (h - 2.0) / 2), WALL)          # lintel
    add_box(bm, (w, d, 0.04), (0, 0, 0.02), FLOOR)
    rb = bmesh.new()
    if lod == 0:
        corrugated_sheet(rb, w + 0.4, d + 0.4, mat_index=ROOF)
    else:
        flat_sheet(rb, w + 0.4, d + 0.4, ROOF)
    box_uv(rb, 1.6)
    merge_bm(bm, rb, Matrix.Translation((0, 0, h + 0.1)) @ Matrix.Rotation(math.radians(6), 4, "X"), ROOF)
    if lod < 2:
        # curtain pulled to one side of the doorway
        add_box(bm, (0.45, 0.03, 1.95), (-0.32, -d / 2 - 0.02, 1.0), CURT)
        # bed with blanket (back-left), small table + chairs, jiko, TV on a stand, shelf, clothes
        add_box(bm, (1.9, 1.0, 0.45), (-0.75, d / 2 - 0.65, 0.23), WOOD)
        add_box(bm, (1.85, 0.95, 0.12), (-0.75, d / 2 - 0.65, 0.5), BLANK)
        add_box(bm, (0.5, 0.35, 0.1), (-1.45, d / 2 - 0.65, 0.6), CL)  # pillow
        add_box(bm, (0.8, 0.55, 0.05), (0.9, 0.2, 0.72), WOOD)
        for lx in (0.55, 1.25):
            for ly in (-0.05, 0.45):
                add_box(bm, (0.04, 0.04, 0.72), (lx, ly, 0.36), WOOD)
        for cx in (0.55, 1.25):
            add_box(bm, (0.42, 0.42, 0.04), (cx, -0.45, 0.45), CHAIR)
            add_box(bm, (0.42, 0.04, 0.4), (cx, -0.66, 0.65), CHAIR)
        jb = bmesh.new()
        bmesh.ops.create_cone(jb, cap_ends=True, segments=10, radius1=0.15, radius2=0.18, depth=0.28)
        merge_bm(bm, jb, Matrix.Translation((1.4, -1.3, 0.14)), JIKO)
        add_box(bm, (0.7, 0.4, 0.55), (1.35, d / 2 - 0.3, 0.28), WOOD)   # TV stand
        add_box(bm, (0.6, 0.35, 0.45), (1.35, d / 2 - 0.3, 0.78), BLACK)  # CRT TV
        add_box(bm, (0.5, 0.02, 0.36), (1.35, d / 2 - 0.48, 0.78), TV)
        add_box(bm, (1.2, 0.25, 0.03), (-1.0, -d / 2 + 0.3, 1.6), WOOD)   # shelf
        for i in range(5):
            add_box(bm, (0.1, 0.1, 0.18), (-1.45 + i * 0.22, -d / 2 + 0.3, 1.71), CHAIR if i % 2 else JIKO)
        for i in range(3):  # clothes hanging on nails
            add_box(bm, (0.38, 0.03, 0.6), (-w / 2 + 0.1, -0.6 + i * 0.5, 1.5), CL2 if i % 2 else CL)
        add_box(bm, (0.06, 0.06, 0.1), (0, 0, h - 0.12), BULB)
    box_uv(bm, 1.5)
    ob = new_obj(name, bm, mats)
    paint_grime(ob, dust_height=0.4, strength=0.5, streak=0.12)
    return ob


def home_colliders(_ob):
    w, d, h, t, dw = 3.6, 3.6, 2.6, 0.12, 1.0
    return [
        ((0, d / 2 - t / 2, h / 2), (w, t, h)), ((-w / 2 + t / 2, 0, h / 2), (t, d, h)), ((w / 2 - t / 2, 0, h / 2), (t, d, h)),
        ((-w / 4 - dw / 4, -d / 2 + t / 2, h / 2), ((w - dw) / 2, t, h)), ((w / 4 + dw / 4, -d / 2 + t / 2, h / 2), ((w - dw) / 2, t, h)),
        ((-0.75, d / 2 - 0.65, 0.3), (1.9, 1.0, 0.6)), ((0.9, 0.2, 0.37), (0.8, 0.55, 0.74)), ((1.35, d / 2 - 0.3, 0.5), (0.7, 0.4, 1.0)),
    ]


@piece("kib_home_open", collider=home_colliders, lods=True)
def _(name, lod):
    return home_open(name, lod)


@piece("kib_video_hall", collider=lambda ob: [((0, 0, 1.3), (5.0, 4.0, 2.6))], lods=True)
def _(name, lod):
    """Plank video hall (owner photo): weathered timber boards, rusty roof, chalkboard schedule."""
    random.seed(17)
    mats = [pbr("planks_weathered", "Planks021", tint=(0.6, 0.5, 0.42)), ROOFS[0],
            pbr("chalkboard", color=(0.04, 0.05, 0.045), rough=0.9, metal=0.0),
            pbr("chalk", color=(0.85, 0.85, 0.82), rough=0.9, metal=0.0), M["steel"], M["sign_red"], M["sign_white"]]
    PL, RF, CB, CH, ST, RED, WH = range(7)
    w, d, h = 5.0, 4.0, 2.6
    bm = bmesh.new()
    add_box(bm, (w, d, h), (0, 0, h / 2), PL)
    if lod == 0:
        for i in range(12):  # board seams
            add_box(bm, (0.02, 0.03, h), (-w / 2 + 0.2 + i * 0.4, -d / 2 - 0.01, h / 2), ST)
    rb = bmesh.new()
    if lod == 0:
        corrugated_sheet(rb, w + 0.6, d + 0.8, mat_index=RF)
    else:
        flat_sheet(rb, w + 0.6, d + 0.8, RF)
    box_uv(rb, 1.6)
    merge_bm(bm, rb, Matrix.Translation((0, -0.1, h + 0.15)) @ Matrix.Rotation(math.radians(-8), 4, "X"), RF)
    add_box(bm, (0.95, 0.05, 2.0), (1.4, -d / 2 - 0.02, 1.0), PL)            # door
    add_box(bm, (1.3, 0.04, 1.3), (-1.1, -d / 2 - 0.03, 1.45), CB)           # chalkboard
    add_box(bm, (0.5, 0.03, 0.6), (-2.1, -d / 2 - 0.03, 1.6), CB)
    add_box(bm, (0.6, 0.03, 0.35), (0.4, -d / 2 - 0.03, 2.1), RED)           # poster
    if lod == 0:
        db = bmesh.new()
        bmesh.ops.create_cone(db, cap_ends=True, segments=12, radius1=0.4, radius2=0.05, depth=0.12)
        merge_bm(bm, db, Matrix.Translation((-2.0, -1.2, h + 0.7)) @ Matrix.Rotation(1.1, 4, "X"), WH)
    box_uv(bm, 1.5)
    for i, line in enumerate(("LEO", "YOUNG & STUPID", "HEADLINE HITTERS", "7PM - KSH 20")[: (4, 1, 0)[lod]]):
        tm = text_mesh(line, 0.12 if i else 0.16, depth=0.003, resolution=1)
        merge_bm(bm, tm, Matrix.Translation((-1.1, -d / 2 - 0.06, 1.95 - i * 0.24)) @ Matrix.Rotation(math.pi / 2, 4, "X"), CH)
    ob = new_obj(name, bm, mats)
    paint_grime(ob, dust_height=0.7, strength=0.6, streak=0.2)
    return ob


LAUNDRY = [pbr(f"laundry_{i}", color=c, rough=0.9, metal=0.0) for i, c in enumerate(
    [(0.75, 0.08, 0.06), (0.05, 0.25, 0.6), (0.92, 0.92, 0.88), (0.9, 0.6, 0.05), (0.08, 0.45, 0.2), (0.55, 0.1, 0.45)])]
LITTER = [pbr("litter_white", color=(0.85, 0.85, 0.82), rough=0.6, metal=0.0), pbr("litter_black", color=(0.03, 0.03, 0.03), rough=0.5, metal=0.0),
          pbr("litter_blue", color=(0.1, 0.3, 0.65), rough=0.5, metal=0.0), pbr("litter_husk", color=(0.6, 0.5, 0.3), rough=0.9, metal=0.0),
          pbr("litter_bottle", color=(0.55, 0.75, 0.6), rough=0.15, metal=0.0)]


@piece("kib_washline", collider=lambda ob: [], lods=True)
def _(name, lod):
    """Washing line across an alley (owner photo): khangas, shirts and trousers drying at 2 m."""
    random.seed(23)
    bm = bmesh.new()
    add_box(bm, (1.7, 0.012, 0.012), (0, 0, 2.05), 0)  # the line, wall to wall
    x = -0.75
    while x < 0.7:
        w = random.uniform(0.25, 0.5)
        hgt = random.uniform(0.35, 0.8)
        mi = 1 + random.randrange(len(LAUNDRY))
        add_box(bm, (w, 0.008, hgt), (x + w / 2, random.uniform(-0.02, 0.02), 2.05 - hgt / 2), mi)
        if random.random() < 0.4:  # shirt sleeves
            add_box(bm, (w + 0.24, 0.008, 0.12), (x + w / 2, 0, 1.98), mi)
        x += w + random.uniform(0.04, 0.12)
    ob = new_obj(name, bm, [M["steel"]] + LAUNDRY)
    ob["no_collider"] = True  # walk through the laundry
    return ob


@piece("kib_litter", collider=lambda ob: [], lods=True)
def _(name, lod):
    """Rubbish in the alleys: plastic bags, bottles, papers and maize husks trodden into the murram."""
    random.seed(31 + lod)
    bm = bmesh.new()
    for _ in range((14, 8, 4)[lod]):
        kind = random.random()
        x, y = random.uniform(-1.0, 1.0), random.uniform(-0.5, 0.5)
        if kind < 0.45:  # crumpled bag
            t = bmesh.new()
            bmesh.ops.create_icosphere(t, subdivisions=1, radius=random.uniform(0.06, 0.12))
            for v in t.verts:
                v.co.z *= 0.45
                v.co *= random.uniform(0.85, 1.15)
            merge_bm(bm, t, Matrix.Translation((x, y, 0.03)), random.choice([0, 1, 2]))
        elif kind < 0.65:  # bottle on its side
            t = bmesh.new()
            bmesh.ops.create_cone(t, cap_ends=True, segments=8, radius1=0.035, radius2=0.035, depth=0.25)
            merge_bm(bm, t, Matrix.Translation((x, y, 0.035)) @ Matrix.Rotation(random.uniform(0, 6.28), 4, "Z") @ Matrix.Rotation(math.pi / 2, 4, "X"), 4)
        else:  # paper / husk
            add_box(bm, (random.uniform(0.1, 0.3), random.uniform(0.08, 0.2), 0.006), (x, y, 0.005), 0 if kind < 0.85 else 3)
    ob = new_obj(name, bm, LITTER)
    ob["no_collider"] = True
    return ob


def _shots(shot, x):
    rx = PIECES["kib_row6"][0].location.x
    shot("kibera_rows.png", (rx - 4, -9, 7), (rx + 2, 2, 1.5))
    hx = PIECES["kib_home_open"][0].location.x
    shot("kibera_home_in.png", (hx + 0.2, -1.2, 1.5), (hx - 0.6, 1.6, 0.6))
    vx = PIECES["kib_video_hall"][0].location.x
    shot("kibera_video.png", (vx, -6, 1.7), (vx, 0, 1.5))


finish("kibera_kit.glb", _shots)
