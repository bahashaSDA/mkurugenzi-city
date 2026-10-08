"""Lineup render of every character GLB (raw exports) in an idle pose, for a visual check.
  blender -b --factory-startup -P blender/scripts/check_lineup.py -- <out.png> <glb> [<glb> ...]"""
import math
import os
import sys

import bpy
from mathutils import Vector

args = sys.argv[sys.argv.index("--") + 1:]
out, files = os.path.abspath(args[0]), [os.path.abspath(a) for a in args[1:]]
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
for _o in bpy.data.objects:
    if _o.name.startswith('Icosphere'): _o.hide_render = True  # importer's bone-shape helper
for i, f in enumerate(files):
    before = set(bpy.data.objects)
    acts_before = set(bpy.data.actions)
    bpy.ops.import_scene.gltf(filepath=f)
    new = [o for o in bpy.data.objects if o not in before]
    own = [a for a in bpy.data.actions if a not in acts_before]  # this character's own clips
    arm = next(o for o in new if o.type == "ARMATURE")
    arm.location.x = i * 0.95
    idle = next((a for a in own if a.name.startswith("Idle_Loop")), None)
    arm.animation_data_create()
    arm.animation_data.action = idle  # None -> rest pose (builds made with --noanim)
    if idle and getattr(idle, "slots", None) and len(idle.slots) and hasattr(arm.animation_data, "action_slot"):
        arm.animation_data.action_slot = idle.slots[0]
scene.frame_set(15)
for m in bpy.data.materials:  # cut-out alpha like the game (hair, brows, lashes, beard)
    if hasattr(m, "surface_render_method"):
        m.surface_render_method = "DITHERED"
sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
sun.data.energy = 3.5
sun.rotation_euler = (math.radians(55), 0, math.radians(20))
scene.collection.objects.link(sun)
w = bpy.data.worlds.new("w")
w.use_nodes = True
w.node_tree.nodes["Background"].inputs["Color"].default_value = (0.6, 0.66, 0.75, 1)
w.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.9
scene.world = w
bpy.ops.mesh.primitive_plane_add(size=30, location=((len(files) - 1) * 0.475, 0, 0))
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
cam.data.lens = 45
scene.collection.objects.link(cam)
scene.camera = cam
cx = (len(files) - 1) * 0.475
cam.location = (cx, -9.5, 1.35)
cam.rotation_euler = (Vector((cx, 0, 0.95)) - cam.location).to_track_quat("-Z", "Y").to_euler()
scene.render.engine = "BLENDER_EEVEE_NEXT"
scene.render.resolution_x, scene.render.resolution_y = 1800, 800
scene.view_settings.view_transform = "AgX"
scene.render.filepath = out
bpy.ops.render.render(write_still=True)
print("[lineup]", out)
