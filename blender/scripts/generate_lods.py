"""Create LOD1 (~40%) and LOD2 (~10%) from every *_LOD0 object (SPEC 5.2.1).

Usage: blender -b district.blend -P blender/scripts/generate_lods.py -- [--lod1 0.4] [--lod2 0.1] [--save]
Uses Blender's Collapse decimation, which keeps open boundaries stable. Check silhouettes of
hero assets by eye; for those, hand-made LODs or a LOD2 impostor billboard can replace the output.
"""
import os as _os
import sys as _sys

_sys.path.append(_os.path.dirname(_os.path.abspath(__file__)))

import bpy
from common import script_args, lod0_objects, base_name, deselect_all

args = script_args()


def arg(name, default):
    return float(args[args.index(name) + 1]) if name in args else default


RATIOS = {"_LOD1": arg("--lod1", 0.4), "_LOD2": arg("--lod2", 0.1)}


def tri_count(obj):
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def make_lod(src, suffix, ratio):
    name = base_name(src.name) + suffix
    old = bpy.data.objects.get(name)
    if old:
        bpy.data.objects.remove(old, do_unlink=True)
    dup = src.copy()
    dup.data = src.data.copy()
    dup.name = name
    for col in src.users_collection:
        col.objects.link(dup)
    mod = dup.modifiers.new("lod_decimate", "DECIMATE")
    mod.decimate_type = "COLLAPSE"
    mod.ratio = ratio
    mod.use_collapse_triangulate = True
    deselect_all()
    bpy.context.view_layer.objects.active = dup
    dup.select_set(True)
    bpy.ops.object.modifier_apply(modifier=mod.name)
    return dup


def main():
    for src in lod0_objects():
        base = tri_count(src)
        for suffix, ratio in RATIOS.items():
            lod = make_lod(src, suffix, ratio)
            print(f"[lod] {lod.name}: {base} -> {tri_count(lod)} tris (target {ratio:.0%})")
    if "--save" in args:
        bpy.ops.wm.save_mainfile()


main()
