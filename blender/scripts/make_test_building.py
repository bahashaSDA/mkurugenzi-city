"""Phase 0 pipeline test: build one mabati kiosk (hub reference: 2.4 x 1.8 m, counter 1.0 m),
then run LODs + colliders + export so the whole chain is exercised end to end.

Usage: blender -b --factory-startup -P blender/scripts/make_test_building.py -- --out public/models/raw
"""
import os
import sys
import bpy

sys.path.append(os.path.dirname(__file__))
from common import script_args  # noqa: E402

args = script_args()
OUT = args[args.index("--out") + 1] if "--out" in args else "public/models/raw"

# Empty scene
bpy.ops.wm.read_factory_settings(use_empty=True)

# Walls: 2.4 (x) x 1.8 (y, depth) x 2.3 (z, height), with a counter opening at the front.
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 1.15))
kiosk = bpy.context.active_object
kiosk.scale = (2.4, 1.8, 2.3)
bpy.ops.object.transform_apply(scale=True)
bpy.ops.object.modifier_add(type="BEVEL")
kiosk.modifiers["Bevel"].width = 0.02
kiosk.modifiers["Bevel"].segments = 2
bpy.ops.object.modifier_add(type="SUBSURF")
kiosk.modifiers["Subdivision"].levels = 2  # gives the decimator something to chew on
bpy.ops.object.convert(target="MESH")
kiosk.name = "test_kiosk_LOD0"

mat = bpy.data.materials.new("kiosk_paint")
mat.use_nodes = True
mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.18, 0.55, 0.24, 1)  # #2E8B3D
kiosk.data.materials.append(mat)

# Mono-pitch mabati roof
bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0, 2.38))
roof = bpy.context.active_object
roof.scale = (2.9, 2.3, 1)
roof.rotation_euler = (0.18, 0, 0)
bpy.ops.object.transform_apply(scale=True)
roof.name = "test_kiosk_roof_LOD0"
roof["no_collider"] = True  # covered by the kiosk box collider

here = os.path.dirname(__file__)
for script in ("generate_lods.py", "make_colliders.py"):
    exec(compile(open(os.path.join(here, script)).read(), script, "exec"), {"__name__": "__main__", "__file__": script})

sys.argv = [sys.argv[0], "--", "--district", "test", "--out", OUT]
exec(compile(open(os.path.join(here, "export_district.py")).read(), "export_district.py", "exec"), {"__name__": "__main__"})
