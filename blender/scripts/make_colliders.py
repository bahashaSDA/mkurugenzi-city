"""Auto-generate COL_<name> collision meshes for every LOD0 object (SPEC 5.2.3 / 9).

Usage: blender -b district.blend -P blender/scripts/make_colliders.py -- [--hull] [--save]
  default: oriented bounding box per object
  --hull:  convex hull (for irregular props like rocks, mkokoteni)
Manual override: if COL_<name> already exists and has the custom property `manual = True`, it is kept.
Objects with custom property `no_collider = True` are skipped (small clutter).
"""
import os as _os
import sys as _sys

_sys.path.append(_os.path.dirname(_os.path.abspath(__file__)))

import bmesh
import bpy
from mathutils import Vector
from common import script_args, lod0_objects, base_name, ensure_collection

args = script_args()
USE_HULL = "--hull" in args


def box_mesh(obj, name):
    corners = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    bm = bmesh.new()
    verts = [bm.verts.new(c) for c in corners]
    # bound_box vertex order -> 6 quads
    for f in ((0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (4, 0, 3, 7)):
        bm.faces.new([verts[i] for i in f])
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return me


def hull_mesh(obj, name):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.transform(obj.matrix_world)
    bmesh.ops.convex_hull(bm, input=bm.verts)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return me


def main():
    col_collection = ensure_collection("COLLIDERS")
    made = kept = skipped = 0
    for obj in lod0_objects():
        if obj.get("no_collider"):
            skipped += 1
            continue
        name = "COL_" + base_name(obj.name)
        existing = bpy.data.objects.get(name)
        if existing and existing.get("manual"):
            kept += 1
            continue
        if existing:
            bpy.data.objects.remove(existing, do_unlink=True)
        me = hull_mesh(obj, name) if (USE_HULL or obj.get("hull")) else box_mesh(obj, name)
        col = bpy.data.objects.new(name, me)
        col["collider"] = "hull" if (USE_HULL or obj.get("hull")) else "box"
        col.display_type = "WIRE"
        col.hide_render = True
        col_collection.objects.link(col)
        made += 1
    print(f"[colliders] made {made}, kept manual {kept}, exempt {skipped}")
    if "--save" in args:
        bpy.ops.wm.save_mainfile()


main()
