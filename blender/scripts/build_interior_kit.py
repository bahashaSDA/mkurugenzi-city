"""Interior kit: rooms you enter GTA-style (press E at a door). Each piece is a closed room with the
exit door in the FRONT wall (Blender -Y, three.js +Z), lit by a bulb, furnished the way these rooms
really are in Nairobi:

  int_kibera   single room (3.2 x 3.4 m): curtain divider, bed with a bright blanket, sofa with crochet
               doilies, small TV on a stand, jiko + sufuria, jerricans, utensil rack, calendar, poster,
               a plate of ugali na sukuma on the table (you can eat it)
  int_house    town-house sitting/dining room (8 x 6.5 m): sofa set with doilies, coffee table, TV unit,
               family photos, dining table with chapati and stew, fridge, rug
  int_shop     duka (6 x 6 m): shelves of goods, counter, soda fridge
  int_hoteli   hoteli (8 x 6 m): tables and benches, counter with flasks, mandazi case, menu board

Interaction spots (eat, drink, counter, TV, exit) are mirrored in src/systems/interiors/rooms.ts.
  blender -b --factory-startup -P blender/scripts/build_interior_kit.py -- --out public/models/raw [--preview blender/previews]
"""
import math
import os
import subprocess
import sys

import bmesh
import bpy
from mathutils import Matrix

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from kitlib import *  # noqa: E402,F401,F403
from kitlib import PIECES, ROOT  # noqa: E402

GEN = os.path.join(ROOT, "blender", "cache")
subprocess.run(["python", os.path.join(ROOT, "tools", "paint_interiors.py"), GEN], check=True)


def img(name, file, rough=0.7, glow=False):
    mat = bpy.data.materials.new(name + ("_glow" if glow else ""))
    mat.use_nodes = True
    nt = mat.node_tree
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = bpy.data.images.load(os.path.join(GEN, file), check_existing=True)
    b = nt.nodes["Principled BSDF"]
    nt.links.new(t.outputs["Color"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = 0.0
    return mat


def col(name, c, rough=0.8, metal=0.0):
    return pbr(name, color=c, rough=rough, metal=metal)


CEMENT = pbr("int_cement", "Concrete040", tint=(0.75, 0.73, 0.7))
TILES = pbr("int_tiles", "Tiles074")
PLASTER = pbr("int_plaster", "PaintedPlaster017", tint=(1.0, 0.95, 0.85))
MUD = pbr("int_mud", "Plaster007", tint=(0.9, 0.78, 0.62))
MABATI = pbr("int_mabati", "CorrugatedSteel007A")
WOOD = pbr("int_wood", "Planks021")
MAROON = col("fabric_maroon", (0.32, 0.03, 0.06), 0.9)
BLANKET = col("fabric_blanket", (0.75, 0.1, 0.35), 0.9)
CURTAIN = col("fabric_curtain", (0.95, 0.65, 0.1), 0.85)
GREENF = col("fabric_green", (0.08, 0.3, 0.18), 0.9)
WHITE = col("paint_white", (0.92, 0.92, 0.9), 0.5)
BLACK = col("plastic_black", (0.03, 0.03, 0.035), 0.4)
STEEL = col("steel", (0.7, 0.7, 0.72), 0.3, 0.9)
YELLOW = col("plastic_yellow", (0.95, 0.7, 0.05), 0.5)
UGALI = col("food_ugali", (0.96, 0.94, 0.86), 0.7)
SUKUMA = col("food_sukuma", (0.12, 0.35, 0.1), 0.8)
CHAPATI = col("food_chapati", (0.85, 0.62, 0.3), 0.8)
STEW = col("food_stew", (0.5, 0.2, 0.08), 0.6)
RUG = col("rug_red", (0.55, 0.12, 0.1), 0.95)
BULB = col("bulb_glow", (1.0, 0.88, 0.6), 0.3)
WINDOW = col("window_glow", (0.85, 0.92, 1.0), 0.3)
SODA = col("fridge_glow", (0.85, 0.95, 1.0), 0.3)
GOODS = [col(f"goods_{i}", c, 0.6) for i, c in enumerate([(0.8, 0.1, 0.1), (0.1, 0.3, 0.8), (0.95, 0.75, 0.1), (0.95, 0.95, 0.95), (0.15, 0.6, 0.25)])]
CAL = img("img_calendar", "int_calendar.png")
POSTER_A = img("img_poster_a", "int_poster_a.png")
POSTER_B = img("img_poster_b", "int_poster_b.png")
PHOTOS = img("img_photos", "int_photos.png")
MENU = img("img_menu", "int_menu.png")
TV = img("img_tv", "int_tv.png", 0.3, glow=True)
DOILY = img("img_doily", "int_doily.png", 0.9)


class Room:
    """Collects geometry by material and a list of collider boxes."""

    def __init__(self, name, mats):
        self.name = name
        self.mats = mats
        self.bm = bmesh.new()
        self.cols = []

    def mi(self, m):
        if m not in self.mats:
            self.mats.append(m)
        return self.mats.index(m)

    def box(self, size, center, m, rot=0.0, solid=False):
        t = bmesh.new()
        bmesh.ops.create_cube(t, size=1.0)
        bmesh.ops.scale(t, vec=size, verts=t.verts)
        box_uv(t, 1.0)
        merge_bm(self.bm, t, Matrix.Translation(center) @ Matrix.Rotation(rot, 4, "Z"), self.mi(m))
        if solid:
            self.cols.append((center, size if not rot or abs(math.sin(rot)) < 0.5 else (size[1], size[0], size[2])))

    def cyl(self, r, h, center, m, seg=16, r2=None):
        t = bmesh.new()
        bmesh.ops.create_cone(t, cap_ends=True, segments=seg, radius1=r, radius2=r if r2 is None else r2, depth=h)
        box_uv(t, 1.0)
        merge_bm(self.bm, t, Matrix.Translation(center), self.mi(m))

    def dome(self, r, center, m, flat=0.55):
        t = bmesh.new()
        bmesh.ops.create_uvsphere(t, u_segments=14, v_segments=7, radius=r)
        bmesh.ops.delete(t, geom=[v for v in t.verts if v.co.z < -1e-4], context="VERTS")
        for v in t.verts:
            v.co.z *= flat
        merge_bm(self.bm, t, Matrix.Translation(center), self.mi(m))

    def picture(self, w, h, center, m, facing):
        """Flat image on a wall; facing: 'N','S','E','W' = which way the image looks."""
        t = bmesh.new()
        uv = t.loops.layers.uv.verify()
        vs = [t.verts.new(p) for p in ((-w / 2, 0, -h / 2), (w / 2, 0, -h / 2), (w / 2, 0, h / 2), (-w / 2, 0, h / 2))]
        f = t.faces.new(vs)
        for loop, c in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
            loop[uv].uv = c
        rot = {"S": 0.0, "N": math.pi, "E": math.pi / 2, "W": -math.pi / 2}[facing]  # S looks towards -Y
        merge_bm(self.bm, t, Matrix.Translation(center) @ Matrix.Rotation(rot, 4, "Z"), self.mi(m))

    def shell(self, W, D, H, floor, wall, door_w=0.95, door_h=2.05, windows=()):
        """Floor, ceiling and four walls (front = -Y) with a door opening and glowing windows."""
        t = 0.12
        self.box((W, D, 0.1), (0, 0, -0.05), floor, solid=True)
        self.box((W, D, 0.1), (0, 0, H + 0.05), WHITE)
        self.box((W + 2 * t, t, H), (0, D / 2 + t / 2, H / 2), wall, solid=True)
        self.box((t, D, H), (-W / 2 - t / 2, 0, H / 2), wall, solid=True)
        self.box((t, D, H), (W / 2 + t / 2, 0, H / 2), wall, solid=True)
        side = (W - door_w) / 2
        self.box((side + t, t, H), (-W / 2 + side / 2 - t / 2, -D / 2 - t / 2, H / 2), wall, solid=True)
        self.box((side + t, t, H), (W / 2 - side / 2 + t / 2, -D / 2 - t / 2, H / 2), wall, solid=True)
        self.box((door_w, t, H - door_h), (0, -D / 2 - t / 2, door_h + (H - door_h) / 2), wall)
        self.box((door_w, 0.05, door_h), (0, -D / 2 - t - 0.03, door_h / 2), WOOD, solid=True)  # closed door: E to leave
        self.box((0.05, 0.06, 0.04), (0.35, -D / 2 - 0.08, 1.0), STEEL)  # handle
        for (x, z, w, h, wallside) in windows:
            if wallside == "back":
                self.box((w, 0.02, h), (x, D / 2 - 0.01, z), WINDOW)
                self.box((w + 0.12, 0.05, 0.08), (x, D / 2 - 0.04, z - h / 2), WHITE)
            else:
                sx = -1 if wallside == "left" else 1
                self.box((0.02, w, h), (sx * (W / 2 - 0.01), x, z), WINDOW)
        self.cyl(0.05, 0.12, (0, 0, H - 0.08), BULB, 10)  # bulb on its flex
        self.box((0.01, 0.01, 0.25), (0, 0, H - 0.15), BLACK)

    def sofa(self, x, y, rot, w, fabric, doily=True):
        m = Matrix.Translation((x, y, 0)) @ Matrix.Rotation(rot, 4, "Z")
        parts = [((w, 0.8, 0.42), (0, 0, 0.21)), ((w, 0.2, 0.85), (0, 0.32, 0.43)), ((0.18, 0.8, 0.62), (-w / 2 + 0.09, 0, 0.31)), ((0.18, 0.8, 0.62), (w / 2 - 0.09, 0, 0.31))]
        for size, c in parts:
            t = bmesh.new()
            bmesh.ops.create_cube(t, size=1.0)
            bmesh.ops.scale(t, vec=size, verts=t.verts)
            box_uv(t, 1.0)
            merge_bm(self.bm, t, m @ Matrix.Translation(c), self.mi(fabric))
        if doily:  # crochet doilies on the backrest (every Kenyan sitting room)
            for k in range(max(1, int(w / 0.7))):
                t = bmesh.new()
                bmesh.ops.create_cube(t, size=1.0)
                bmesh.ops.scale(t, vec=(0.42, 0.02, 0.36), verts=t.verts)
                uvl = t.loops.layers.uv.verify()
                for f in t.faces:
                    for loop, c in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
                        loop[uvl].uv = c
                merge_bm(self.bm, t, m @ Matrix.Translation((-w / 2 + 0.35 + k * 0.7, 0.21, 0.75)), self.mi(DOILY))
        cx, cy = x, y
        self.cols.append(((cx, cy, 0.4), (w if abs(math.sin(rot)) < 0.5 else 0.8, 0.8 if abs(math.sin(rot)) < 0.5 else w, 0.8)))

    def table(self, x, y, w, d, h, top=WOOD):
        self.box((w, d, 0.05), (x, y, h), top, solid=False)
        for sx in (-1, 1):
            for sy in (-1, 1):
                self.box((0.05, 0.05, h), (x + sx * (w / 2 - 0.05), y + sy * (d / 2 - 0.05), h / 2), WOOD)
        self.cols.append(((x, y, h / 2), (w, d, h)))

    def plate(self, x, y, z, food):
        self.cyl(0.13, 0.015, (x, y, z + 0.01), WHITE, 18)
        if food == "ugali":
            self.dome(0.07, (x - 0.03, y, z + 0.018), UGALI)
            self.cyl(0.05, 0.02, (x + 0.06, y + 0.02, z + 0.025), SUKUMA, 10)
        elif food == "chapati":
            self.cyl(0.1, 0.02, (x, y, z + 0.03), CHAPATI, 16)
            self.cyl(0.07, 0.05, (x + 0.2, y, z + 0.035), STEW, 14, r2=0.05)

    def finish(self):
        ob = new_obj(f"{self.name}_LOD0", self.bm, self.mats)
        paint_grime(ob, dust_height=0.3, strength=0.2)
        cols = self.cols
        PIECES[self.name] = (ob, lambda _o, cols=cols: cols, [ob.copy(), ob.copy()])
        for k, d in enumerate(PIECES[self.name][2]):
            d.name = f"{self.name}_LOD{k + 1}"
            ob.users_collection[0].objects.link(d)


# ----------------------------------------------------------------------------- Kibera room
r = Room("int_kibera", [])
W, D, H = 3.2, 3.4, 2.4
r.shell(W, D, H, CEMENT, MUD, door_w=0.8, door_h=1.9, windows=[(0.0, 1.5, 0.5, 0.4, "back")])
r.box((W - 0.2, 0.02, 1.1), (0, D / 2 - 0.06, 1.75), MABATI)  # mabati showing above the plaster line
r.box((0.02, 1.6, 2.0), (0.2, 0.75, 1.0), CURTAIN)  # curtain divider across the room, bed behind it
r.box((1.2, 1.9, 0.35), (0.95, 0.6, 0.25), WOOD, solid=True)  # bed
r.box((1.15, 1.85, 0.12), (0.95, 0.6, 0.48), BLANKET)
r.box((0.5, 0.3, 0.1), (0.95, 1.38, 0.58), WHITE)  # pillow
r.sofa(-0.95, 1.2, math.pi, 1.2, MAROON)  # against the back wall, facing the door
r.table(-0.95, 0.15, 0.7, 0.45, 0.42)
r.plate(-1.05, 0.15, 0.45, "ugali")
r.cyl(0.05, 0.3, (-0.7, 0.2, 0.6), (GOODS[1]), 12)  # thermos flask
r.box((0.6, 0.35, 0.55), (-1.25, -1.35, 0.28), WOOD, solid=True)  # TV stand
r.box((0.55, 0.05, 0.35), (-1.25, -1.35, 0.75), BLACK)
r.picture(0.5, 0.3, (-1.25, -1.32, 0.75), TV, "N")
r.cyl(0.16, 0.22, (0.7, -1.2, 0.11), BLACK, 12, r2=0.2)  # jiko
r.cyl(0.14, 0.14, (0.7, -1.2, 0.3), STEEL, 14)  # sufuria
r.box((0.25, 0.18, 0.38), (1.35, -1.4, 0.19), YELLOW, solid=True)  # jerricans
r.box((0.25, 0.18, 0.38), (1.35, -1.1, 0.19), YELLOW)
r.box((0.6, 0.2, 0.04), (1.0, -1.6, 1.3), WOOD)  # utensil rack
for k in range(4):
    r.cyl(0.07, 0.02, (0.8 + k * 0.13, -1.6, 1.4), WHITE, 12)
r.picture(0.3, 0.45, (-0.6, D / 2 - 0.08, 1.5), CAL, "S")
r.picture(0.4, 0.6, (-1.55, 0.3, 1.5), POSTER_A, "E")
r.finish()

# ----------------------------------------------------------------------------- town house
r = Room("int_house", [])
W, D, H = 8.0, 6.5, 2.8
r.shell(W, D, H, TILES, PLASTER, windows=[(-2.0, 1.5, 1.6, 1.2, "back"), (1.8, 1.5, 1.6, 1.2, "back"), (0.0, 1.5, 1.4, 1.2, "left")])
for x in (-2.0, 1.8):
    r.box((0.8, 0.04, 1.8), (x - 1.0, D / 2 - 0.1, 1.5), CURTAIN)
r.box((3.2, 2.2, 0.01), (-1.8, 0.0, 0.005), RUG)
r.sofa(-1.8, 1.4, math.pi, 2.4, MAROON)
r.sofa(-3.4, 0.0, math.pi / 2, 1.8, MAROON)
r.sofa(-0.2, 0.0, -math.pi / 2, 0.9, MAROON)
r.table(-1.8, 0.0, 1.1, 0.6, 0.42, top=WOOD)
r.cyl(0.08, 0.25, (-1.8, 0.0, 0.57), GOODS[4], 12)  # vase of flowers
r.box((2.2, 0.45, 0.55), (-1.8, -2.8, 0.28), WOOD, solid=True)  # TV unit
r.box((1.6, 0.06, 0.9), (-1.8, -2.85, 1.05), BLACK)
r.picture(1.5, 0.84, (-1.8, -2.8, 1.05), TV, "N")
r.picture(1.4, 0.7, (0.0, D / 2 - 0.08, 1.9), PHOTOS, "S")  # family photos between the windows
r.picture(0.4, 0.6, (W / 2 - 0.08, 1.5, 1.6), POSTER_B, "W")
r.picture(0.3, 0.45, (W / 2 - 0.08, 0.0, 1.6), CAL, "W")
r.table(2.3, 0.6, 1.8, 1.0, 0.76)  # dining table with food
for sx in (-0.55, 0.0, 0.55):
    for sy in (-1, 1):
        r.box((0.42, 0.42, 0.45), (2.3 + sx, 0.6 + sy * 0.75, 0.23), WOOD)
r.plate(2.0, 0.6, 0.79, "chapati")
r.plate(2.6, 0.6, 0.79, "ugali")
r.box((0.75, 0.7, 1.8), (3.5, -2.7, 0.9), WHITE, solid=True)  # fridge
r.box((0.02, 0.6, 0.6), (3.12, -2.7, 1.1), SODA)
r.box((2.0, 0.6, 0.9), (2.0, -2.85, 0.45), WOOD, solid=True)  # kitchen counter
r.finish()

# ----------------------------------------------------------------------------- duka (shop)
r = Room("int_shop", [])
W, D, H = 6.0, 6.0, 3.0
r.shell(W, D, H, CEMENT, PLASTER, door_w=1.4, door_h=2.3)
for x in (-2.6, 2.6):  # side shelves with goods
    r.box((0.5, 4.4, 2.2), (x, 0.4, 1.1), WOOD, solid=True)
    for lvl in range(4):
        for k in range(9):
            r.box((0.3, 0.32, 0.3), (x - math.copysign(0.05, x), -1.4 + k * 0.45, 0.3 + lvl * 0.5), GOODS[(k + lvl) % 5])
r.box((4.0, 0.6, 1.0), (0, 1.6, 0.5), WOOD, solid=True)  # counter
r.box((4.0, 0.62, 0.05), (0, 1.6, 1.02), WHITE)
r.box((0.4, 0.3, 0.2), (1.2, 1.6, 1.15), STEEL)  # till
r.box((0.9, 0.7, 1.9), (0, 2.6, 0.95), WHITE, solid=True)  # soda fridge
r.box((0.75, 0.02, 1.4), (0, 2.24, 1.05), SODA)
r.picture(0.3, 0.45, (-1.4, D / 2 - 0.08, 1.9), CAL, "S")
r.finish()

# ----------------------------------------------------------------------------- hoteli
r = Room("int_hoteli", [])
W, D, H = 8.0, 6.0, 3.0
r.shell(W, D, H, CEMENT, PLASTER, door_w=1.4, door_h=2.3, windows=[(-2.5, 1.6, 1.8, 1.0, "back")])
for (x, y) in [(-2.6, -1.0), (-2.6, 1.0), (0.0, -1.0), (0.0, 1.0)]:
    r.table(x, y, 1.4, 0.8, 0.76, top=GREENF)
    for sy in (-1, 1):
        r.box((1.4, 0.3, 0.45), (x, y + sy * 0.7, 0.23), WOOD)
    r.plate(x - 0.3, y, 0.79, "chapati")
r.box((0.6, 4.6, 1.05), (3.3, 0.0, 0.53), WOOD, solid=True)  # counter
r.box((0.5, 1.0, 0.45), (3.3, -1.0, 1.28), WINDOW)  # mandazi glass case
for k in range(3):
    r.cyl(0.09, 0.35, (3.3, 0.6 + k * 0.3, 1.23), GOODS[k], 12)  # chai flasks
r.picture(1.6, 1.2, (W / 2 - 0.08, 0.0, 2.0), MENU, "W")
r.picture(0.4, 0.6, (-W / 2 + 0.08, 0.0, 1.7), POSTER_A, "E")
r.finish()


def _shots(shot, x):
    for nm in ("int_kibera", "int_house"):
        ob = PIECES[nm][0]
        vx = ob.location.x
        shot(f"{nm}.png", (vx, -ob.dimensions.y / 2 + 0.6, 1.6), (vx, ob.dimensions.y / 2, 1.0))


finish("interior_kit.glb", _shots)
