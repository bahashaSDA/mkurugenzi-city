"""Export a district as chunk GLBs, one per 200 m streaming cell (SPEC 5.2.4 / 10.1).

Usage: blender -b district.blend -P blender/scripts/export_district.py -- --district hub --out public/models/raw
Each chunk GLB contains the LOD0/1/2 render meshes and COL_ meshes whose origin falls in that cell.
COL_ meshes carry the extra `collider` (box|hull) so the runtime builds Rapier colliders from them.
Raw output then goes through `npm run assets:optimize` (meshopt + KTX2 + budgets).
"""
import os as _os
import sys as _sys

_sys.path.append(_os.path.dirname(_os.path.abspath(__file__)))

import math
import os
import bpy
from common import script_args, deselect_all

args = script_args()


def arg(name, default):
    return args[args.index(name) + 1] if name in args else default


DISTRICT = arg("--district", "district")
OUT = bpy.path.abspath(arg("--out", "//export"))
CELL = 200.0
HALF = 800.0  # world is 1.6 km square, centred on spawn


def cell_of(obj):
    # Blender is Z-up: world X = three X, Blender Y = three -Z.
    x = obj.matrix_world.translation.x
    z = -obj.matrix_world.translation.y
    return (int(math.floor((x + HALF) / CELL)), int(math.floor((z + HALF) / CELL)))


def main():
    os.makedirs(OUT, exist_ok=True)
    cells = {}
    for o in bpy.context.scene.objects:
        if o.type != "MESH":
            continue
        cells.setdefault(cell_of(o), []).append(o)

    for (cx, cz), objs in cells.items():
        deselect_all()
        for o in objs:
            o.select_set(True)
        path = os.path.join(OUT, f"{DISTRICT}_{cx}_{cz}.glb")
        bpy.ops.export_scene.gltf(
            filepath=path,
            export_format="GLB",
            use_selection=True,
            export_extras=True,  # custom props (collider type, no_collider, ...)
            export_yup=True,
            export_apply=True,
            export_texcoords=True,
            export_normals=True,
            export_materials="EXPORT",
            export_animations=False,
        )
        print(f"[export] {path} ({len(objs)} objects)")


main()
