"""Reality check for retargeted clips: import a character GLB, pose it at a frame of several
clips, render a contact sheet of side views (catches twisted limbs, sliding, floating).
  blender -b --factory-startup -P blender/scripts/check_anims.py -- <glb> <out.png> [Clip:frame ...]"""
import math
import os
import sys

import bpy
from mathutils import Vector

args = sys.argv[sys.argv.index("--") + 1:]
glb, out = os.path.abspath(args[0]), os.path.abspath(args[1])  # Blender resolves relative render paths oddly
clips = args[2:] or ["Idle_Loop:20", "Walk_Loop:8", "Jog_Fwd_Loop:6", "Sprint_Loop:5", "Sitting_Idle_Loop:10", "Idle_TalkingPhone_Loop:20"]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE_NEXT"
scene.render.resolution_x, scene.render.resolution_y = 600, 800
sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
sun.data.energy = 3
sun.rotation_euler = (math.radians(45), 0, math.radians(40))
scene.collection.objects.link(sun)
world = bpy.data.worlds.new("w")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.7
scene.world = world
bpy.ops.mesh.primitive_plane_add(size=6)
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
cam.data.lens = 50
scene.collection.objects.link(cam)
scene.camera = cam
cam.location = (3.6, -2.4, 1.1)
cam.rotation_euler = (Vector((0, 0, 0.9)) - cam.location).to_track_quat("-Z", "Y").to_euler()
frames = []
for spec in clips:
    name, f = spec.split(":")
    # the glTF importer prefixes action names (e.g. "abel|Idle_Loop" / "Idle_Loop_abel"): match loosely
    act = next((a for a in bpy.data.actions if a.name == name or a.name.endswith("|" + name) or a.name.startswith(name + "_") or a.name.startswith(name)), None)
    if not act:
        print("[check] missing", name)
        continue
    arm.animation_data_create()
    arm.animation_data.action = act
    if getattr(act, "slots", None) and len(act.slots) and hasattr(arm.animation_data, "action_slot"):
        arm.animation_data.action_slot = act.slots[0]
    scene.frame_set(int(act.frame_range[0]) + int(f))
    p = os.path.splitext(out)[0] + f"_{name}.png"
    scene.render.filepath = p
    bpy.ops.render.render(write_still=True)
    frames.append(p)
print("[check] actions in file:", len(bpy.data.actions), [a.name for a in bpy.data.actions][:6])
print("[check] rendered", frames)
