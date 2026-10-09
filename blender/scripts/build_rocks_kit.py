"""Rocks kit for Rocky Ridge (owner reference: broken, cracked rocky ground): boulders and outcrops,
noise-displaced and textured with ambientCG Rock063 (CC0).
  blender -b --factory-startup -P blender/scripts/build_rocks_kit.py -- --out public/models/raw [--preview blender/previews]
"""
import math
import os
import random
import sys

import bmesh
from mathutils import Matrix, Vector, noise

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from kitlib import *  # noqa: E402,F401,F403
from kitlib import PIECES  # noqa: E402

ROCK = pbr("rock", "Rock030", tint=(0.95, 0.93, 0.9))


def boulder(bm, c, size, seed, sub, flat=1.0):
    b = bmesh.new()
    bmesh.ops.create_icosphere(b, subdivisions=sub, radius=1.0)
    off = Vector((seed * 3.1, seed * 1.7, seed * 2.3))
    for v in b.verts:
        p = v.co.copy()
        d = 1 + 0.35 * noise.noise(p * 1.3 + off) + 0.12 * noise.noise(p * 4.0 + off)
        v.co = p * d
        v.co.x *= size[0]
        v.co.y *= size[1]
        v.co.z *= size[2] * flat
        if v.co.z < -size[2] * 0.25:  # sunk into the ground
            v.co.z = -size[2] * 0.25
    for f in b.faces:
        f.smooth = True
    merge_bm(bm, b, Matrix.Translation(c), 0)


def rock(name, lod, parts):
    random.seed(hash(name) & 0xFFFF)
    bm = bmesh.new()
    for i, (c, size, flat) in enumerate(parts):
        boulder(bm, c, size, i + len(name), (3, 2, 1)[lod], flat)
    box_uv(bm, 1.5)
    ob = new_obj(name, bm, [ROCK])
    paint_grime(ob, dust_height=0.5, strength=0.45, streak=0.25)
    return ob


ROCKS = {
    "rock_a": [((0, 0, 0.5), (1.1, 0.9, 0.8), 1.0)],
    "rock_b": [((0, 0, 0.6), (1.6, 1.2, 1.0), 0.9), ((1.3, 0.6, 0.3), (0.7, 0.6, 0.5), 1.0)],
    "rock_outcrop": [((0, 0, 1.2), (3.2, 2.4, 2.0), 0.85), ((2.6, -1.0, 0.7), (1.6, 1.4, 1.1), 1.0),
                     ((-2.2, 1.2, 0.6), (1.4, 1.2, 0.9), 1.0), ((0.5, 2.0, 0.4), (1.0, 0.8, 0.6), 1.0)],
    "rock_flat": [((0, 0, 0.15), (2.4, 1.8, 0.35), 1.0)],
}
for name, parts in ROCKS.items():
    built = []
    for lod in range(3):
        ob = rock(name, lod, parts)
        ob.name = f"{name}_LOD{lod}"
        built.append(ob)
    PIECES[name] = (built[0], "hull", built[1:])


def _shots(shot, x):
    shot("rocks.png", (x / 2, -9, 3), (x / 2, 0, 0.8))


finish("rocks_kit.glb", _shots)
