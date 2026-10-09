"""Add motion-capture clips to an already-built character GLB (no full rebuild of the human).

  blender -b --factory-startup -P blender/scripts/add_clips.py -- --glb public/models/raw/abel.glb --set player
  blender -b --factory-startup -P blender/scripts/add_clips.py -- --glb public/models/raw/npc_x.glb --set npc

Clips (CMU Graphics Lab mocap, BVH by cgspeed via github.com/una-dinosauria/cmu-mocap, files in
blender/cache/mocap/): swimming, a boxing guard, punches, a kick, a knockdown, lying hurt, getting
up, and a limp for low health. Loops are cut at their most seamless cycle (mocap.find_loop);
one-shots use the measured frame ranges below (found with research tooling, see PROGRESS.md).
Everything is in place: the game's controller moves the body.
"""
import math
import os
import sys

import bpy
from mathutils import Matrix, Quaternion, Vector

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import mocap  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
MOCAP_DIR = os.path.join(ROOT, "blender", "cache", "mocap")
argv = sys.argv[sys.argv.index("--") + 1:]
GLB = argv[argv.index("--glb") + 1]
SET = argv[argv.index("--set") + 1] if "--set" in argv else "player"
OUT = argv[argv.index("--out") + 1] if "--out" in argv else GLB

# (bvh, clip, options for mocap.retarget_mocap). Frame numbers are CMU frames @120 Hz, measured
# with a probe (hip height, hand reach, foot height per frame) and checked with check_anims.py.
SWIM = ("79_02.bvh", "Swim_Loop", dict(loop=(0.2, 100, 150)))  # front-crawl arms; body pitched flat at runtime
GUARD = ("13_17.bvh", "Fight_Idle_Loop", dict(loop=(0.01, 150, 200), face=("RightHand", 100)))
PUNCH_R = ("13_17.bvh", "Punch_R", dict(frames=(221, 281), oneshot=True, face=("RightHand", 241)))
PUNCH_L = ("13_17.bvh", "Punch_L", dict(frames=(339, 389), oneshot=True, face=("LeftHand", 361)))
CROSS = ("13_17.bvh", "Punch_Cross", dict(frames=(1050, 1115), oneshot=True, face=("RightHand", 1081)))
KICK = ("74_03.bvh", "Kick", dict(frames=(168, 244), oneshot=True, face=("RightFoot", 201)))
KNOCK = ("90_16.bvh", "Knockdown", dict(frames=(428, 520), oneshot=True, abs_height=100))
DOWN = ("90_16.bvh", "Down_Loop", dict(frames=(544, 604), abs_height=100))
GETUP = ("111_06.bvh", "GetUp", dict(frames=(900, 1262), oneshot=True, abs_height=1400))
LIMP = ("77_19.bvh", "Limp_Loop", dict(loop=(0.25, 100, 200)))
CLIPS = {
    "player": [SWIM, GUARD, PUNCH_R, PUNCH_L, CROSS, KICK, KNOCK, DOWN, GETUP, LIMP],
    "npc": [GUARD, PUNCH_R, KNOCK, DOWN, GETUP],
}


def stash(arm, action):
    """Keep the action exportable: the glTF exporter (ACTIONS mode) exports NLA-stashed actions."""
    arm.animation_data_create()
    tr = arm.animation_data.nla_tracks.new()
    tr.name = action.name
    tr.strips.new(action.name, int(action.frame_range[0]), action)
    tr.mute = True


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.abspath(GLB))
    arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    existing = {a.name for a in bpy.data.actions}
    print("[clips] existing:", len(existing))
    # every imported action must stay exportable
    for a in list(bpy.data.actions):
        a.use_fake_user = True
    if arm.animation_data and arm.animation_data.action:
        arm.animation_data.action = None
    have_tracks = {t.name for t in (arm.animation_data.nla_tracks if arm.animation_data else [])}
    for a in list(bpy.data.actions):
        if not any(a.name in t for t in have_tracks):
            stash(arm, a)
    for bvh, clip, opts in CLIPS[SET]:
        if clip in existing:
            print(f"[clips] {clip} already in the GLB, skipped")
            continue
        before = set(bpy.data.objects)
        bpy.ops.import_anim.bvh(filepath=os.path.join(MOCAP_DIR, bvh), global_scale=0.056444,
                                rotate_mode="NATIVE", axis_forward="-Z", axis_up="Y")
        src = next(o for o in bpy.data.objects if o not in before and o.type == "ARMATURE")
        act, _ = mocap.retarget_mocap(src, arm, clip, **opts)
        stash(arm, act)
        src_act = src.animation_data.action
        bpy.data.objects.remove(src, do_unlink=True)
        if src_act:
            bpy.data.actions.remove(src_act)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(
        filepath=os.path.abspath(OUT), export_format="GLB", use_selection=True, export_apply=True, export_yup=True,
        export_skins=True, export_animations=True, export_animation_mode="ACTIONS",
        export_force_sampling=True, export_optimize_animation_size=True, export_def_bones=False,
        export_materials="EXPORT", export_image_format="AUTO",
    )
    print("[clips] exported", OUT, "actions:", len(bpy.data.actions))


main()
