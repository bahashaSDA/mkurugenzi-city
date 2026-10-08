"""Realistic human characters for Mkurugenzi City (VISUAL_OVERHAUL V7).

Bodies, skins, eyes, hair and clothes: MPFB2 (MakeHuman for Blender) + MakeHuman CC0 system
assets. Skeleton: MPFB "game_engine" rig (Unreal-mannequin style, ~60 bones).
Animations: Quaternius Universal Animation Library (CC0), retargeted onto that rig here
(retarget.py), exported once as anims_human.glb and shared by every character in three.js
(clips bind by bone name).

Usage (NOT --factory-startup: MPFB is a user extension):
  blender -b -P blender/scripts/build_humans.py -- --out public/models/raw [--only abel] [--preview blender/previews]

The Abel model here is a TEMPORARY stand-in matched to his build, until the approved capture
session produces the real likeness (SPEC 5.5). Swapping in the final GLB needs no code changes.
"""
import math
import os
import sys

import bpy

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from common import script_args  # noqa: E402

from bl_ext.blender_org.mpfb.services.humanservice import HumanService  # noqa: E402
from retarget import retarget  # noqa: E402

UAL1 = "ual1.glb"  # Quaternius UAL 1 Standard (Godot GLB), renamed: the importer rejects "[...]" paths
UAL2 = "ual2.glb"  # Quaternius UAL 2 Standard (Unreal-Godot GLB)
# Animation sets (no combat: the world is non-violent, SPEC 8.6)
PLAYER_ANIMS = {
    UAL1: ["Idle_Loop", "Idle_Talking_Loop", "Walk_Loop", "Walk_Formal_Loop", "Jog_Fwd_Loop", "Sprint_Loop",
           "Jump_Start", "Jump_Loop", "Jump_Land", "Sitting_Enter", "Sitting_Idle_Loop", "Sitting_Talking_Loop",
           "Sitting_Exit", "Interact", "Push_Loop", "Driving_Loop", "Dance_Loop", "PickUp_Table", "Crouch_Idle_Loop"],
    UAL2: ["Idle_FoldArms_Loop", "Idle_TalkingPhone_Loop", "Idle_No_Loop", "Yes", "Walk_Carry_Loop", "Consume",
           "ClimbUp_1m_RM", "Idle_Rail_Loop"],
}
NPC_ANIMS = {
    UAL1: ["Idle_Loop", "Idle_Talking_Loop", "Walk_Loop", "Walk_Formal_Loop", "Sitting_Idle_Loop"],
    UAL2: ["Idle_FoldArms_Loop", "Idle_TalkingPhone_Loop", "Walk_Carry_Loop", "Yes"],
}

ARGS = script_args()
OUT = ARGS[ARGS.index("--out") + 1] if "--out" in ARGS else "public/models/raw"
ONLY = ARGS[ARGS.index("--only") + 1] if "--only" in ARGS else None
PREVIEW = ARGS[ARGS.index("--preview") + 1] if "--preview" in ARGS else None
UAL_DIR = ARGS[ARGS.index("--ual") + 1] if "--ual" in ARGS else None
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


def age_slider(years):
    """MPFB age macro: 0 = 1 yr, 0.1875 = 11, 0.5 = 25, 1 = 90 (piecewise linear)."""
    if years <= 25:
        return 0.1875 + (years - 11) / (25 - 11) * (0.5 - 0.1875)
    return 0.5 + (years - 25) / (90 - 25) * 0.5


def human(name, *, gender, years, weight=0.5, muscle=0.5, height=0.5, skin, hair, eyebrows="eyebrow001",
          clothes=(), proxy=None):
    return {
        "name": name,
        "phenotype": {
            "gender": gender, "age": age_slider(years), "muscle": muscle, "weight": weight,
            "proportions": 0.5, "height": height, "cupsize": 0.5, "firmness": 0.5,
            "race": {"african": 1.0, "asian": 0.0, "caucasian": 0.0},
        },
        "rig": "game_engine",
        "eyes": "low-poly/low-poly.mhclo",
        "eyebrows": f"{eyebrows}/{eyebrows}.mhclo",
        "eyelashes": "eyelashes01/eyelashes01.mhclo",
        "tongue": "",
        "teeth": "",
        "hair": f"{hair}/{hair}.mhclo" if hair else "",
        "proxy": proxy or ("male_generic/male_generic.proxy" if gender > 0.5 else "female_generic/female_generic.proxy"),
        "targets": [],
        "clothes": [f"{c}/{c}.mhclo" for c in clothes],
        "skin_mhmat": f"{skin}/{skin}.mhmat",
        "skin_material_type": "MAKESKIN",  # glTF-exportable (the SSS skin uses Blender-only nodes)
        "eyes_material_type": "MAKESKIN",
        "skin_material_settings": {},
        "eyes_material_settings": {},
        "expressions": [],
        "alternative_materials": {},
    }


CHARACTERS = {
    # Temporary Abel stand-in: Kenyan man in his late 30s, sturdy build, short hair, casual wear.
    "abel": human("abel", gender=1.0, years=38, weight=0.62, muscle=0.55, height=0.52,
                  skin="middleage_african_male", hair="short01", clothes=("male_casualsuit03", "shoes02")),
    # Street pedestrians: varied ages, builds, hair and clothing (VISUAL_OVERHAUL 19: no clones).
    "mama_mboga": human("mama_mboga", gender=0.0, years=45, weight=0.7, muscle=0.45, height=0.42,
                        skin="middleage_african_female", hair="braid01", clothes=("female_casualsuit02", "shoes05")),
    "hustler": human("hustler", gender=1.0, years=24, weight=0.42, muscle=0.55, height=0.55,
                     skin="young_african_male", hair="short03", clothes=("male_casualsuit05", "shoes01")),
    "office": human("office", gender=1.0, years=35, weight=0.55, muscle=0.5, height=0.6,
                    skin="middleage_african_male", hair="short01", clothes=("male_elegantsuit01", "shoes03")),
    "student": human("student", gender=0.0, years=17, weight=0.45, muscle=0.45, height=0.45,
                     skin="young_african_female", hair="ponytail01", clothes=("female_casualsuit01", "shoes06")),
    "elder": human("elder", gender=1.0, years=68, weight=0.48, muscle=0.4, height=0.48,
                   skin="old_african_male", hair="short04", clothes=("male_worksuit01", "shoes02")),
    "young_woman": human("young_woman", gender=0.0, years=26, weight=0.5, muscle=0.5, height=0.52,
                         skin="young_african_female", hair="afro01", clothes=("female_sportsuit01", "shoes04")),
    "worker": human("worker", gender=1.0, years=30, weight=0.55, muscle=0.62, height=0.5,
                    skin="young_african_male", hair="short02", clothes=("male_worksuit01", "shoes01")),
    "auntie": human("auntie", gender=0.0, years=55, weight=0.62, muscle=0.42, height=0.45,
                    skin="old_african_female", hair="bob02", clothes=("female_elegantsuit01", "shoes05")),
}

NPC_TRIS = 7000  # per pedestrian (Abel keeps full detail)


def decimate_for_crowd():
    """Pedestrians: drop eyelashes (invisible at crowd distance)."""
    meshes = [o for o in bpy.data.objects if o.type == "MESH" and o.visible_get() and not o.name.endswith(".body")]
    for o in list(meshes):
        if "eyelash" in o.name:
            bpy.data.objects.remove(o, do_unlink=True)
            meshes.remove(o)
    def tris(o):
        o.data.calc_loop_triangles()
        return len(o.data.loop_triangles)
    total = sum(tris(o) for o in meshes)
    # Polygon reduction happens later in tools/optimize-assets.mjs with meshoptimizer, which keeps
    # UV seams intact. (Blender's collapse decimation at ~17% shattered the textures.)
    print(f"[human]   crowd mesh {total} tris before web simplification")


DATA = os.path.join(os.environ["APPDATA"], "Blender Foundation", "Blender", "4.5", "extensions", ".user",
                    "blender_org", "mpfb", "data")


def finish_materials(name, eye_color="brown", hair_rgb=(0.035, 0.03, 0.028)):
    """Eye iris texture swap (MakeHuman's default iris read reddish) and near-black hair."""
    for o in bpy.data.objects:
        if o.type != "MESH":
            continue
        for slot in o.material_slots:
            m = slot.material
            if not m or not m.use_nodes:
                continue
            nt = m.node_tree
            if "low-poly" in m.name or "high-poly" in m.name:
                for n in nt.nodes:
                    if n.type == "TEX_IMAGE" and n.image and "eye" in n.image.name.lower() and "normal" not in n.image.name.lower():
                        n.image = bpy.data.images.load(os.path.join(DATA, "eyes", "materials", f"{eye_color}_eye.png"), check_existing=True)
            if any(h in m.name for h in ("short0", "afro", "braid", "bob", "long0", "ponytail")) and hair_rgb:
                bsdf = nt.nodes.get("Principled BSDF")
                base = bsdf.inputs["Base Color"] if bsdf else None
                if base is not None and base.is_linked:
                    mix = nt.nodes.new("ShaderNodeMix")
                    mix.data_type = "RGBA"
                    mix.blend_type = "MULTIPLY"
                    mix.inputs["Factor"].default_value = 1.0
                    nt.links.new(base.links[0].from_socket, mix.inputs[6])
                    mix.inputs[7].default_value = (hair_rgb[0] * 4, hair_rgb[1] * 4, hair_rgb[2] * 4, 1)
                    nt.links.new(mix.outputs[2], base)


def add_animations(anim_sets):
    """Import each UAL library, retarget the chosen clips onto our armature, delete the source."""
    tgt = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    for rel, names in anim_sets.items():
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=os.path.join(UAL_DIR, rel))
        new = [o for o in bpy.data.objects if o not in before]
        src = next(o for o in new if o.type == "ARMATURE")
        retarget(src, tgt, names)
        for o in new:
            bpy.data.objects.remove(o, do_unlink=True)
    # drop imported source actions; keep only the retargeted ones (fake-user)
    for a in list(bpy.data.actions):
        if not a.use_fake_user:
            bpy.data.actions.remove(a)


def export(name):
    """One GLB: skinned meshes + game_engine skeleton + all retargeted clips."""
    os.makedirs(os.path.join(ROOT, OUT), exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for o in bpy.data.objects:
        # the MPFB base mesh is fully masked behind the body proxy: never export it
        if o.type == "ARMATURE" or (o.type == "MESH" and o.visible_get() and not o.name.endswith(".body")):
            o.select_set(True)
    path = os.path.join(ROOT, OUT, f"{'abel' if name == 'abel' else 'npc_' + name}.glb")
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", use_selection=True, export_apply=True, export_yup=True,
        export_skins=True, export_animations=True, export_animation_mode="ACTIONS",
        export_force_sampling=True, export_optimize_animation_size=True, export_def_bones=False,
        export_materials="EXPORT", export_image_format="JPEG", export_jpeg_quality=85,
    )
    print(f"[human]   exported {path}")


def build(spec):
    bpy.ops.wm.read_homefile(use_empty=True)
    settings = HumanService.get_default_deserialization_settings()
    settings["subdiv_levels"] = 0
    settings["override_skin_model"] = "MAKESKIN"
    basemesh = HumanService.deserialize_from_dict(spec, settings)
    return basemesh


def report():
    tris = 0
    for o in bpy.data.objects:
        if o.type == "MESH":
            deps = bpy.context.evaluated_depsgraph_get()
            me = o.evaluated_get(deps).to_mesh()
            me.calc_loop_triangles()
            t = len(me.loop_triangles)
            o.evaluated_get(deps).to_mesh_clear()
            vis = "" if o.visible_get() else " (hidden)"
            print(f"[human]   mesh {o.name:40s} {t:7d} tris  mats={[m.name for m in o.data.materials]}{vis}")
            tris += t
        elif o.type == "ARMATURE":
            print(f"[human]   armature {o.name} bones={len(o.data.bones)}")
    print(f"[human]   total {tris} tris (incl. hidden base mesh)")


for name, spec in CHARACTERS.items():
    if ONLY and name != ONLY:
        continue
    if "--npcs" in ARGS and name == "abel":
        continue
    print(f"[human] building {name}")
    build(spec)
    finish_materials(name)
    report()
    if UAL_DIR:
        add_animations(PLAYER_ANIMS if name == "abel" else NPC_ANIMS)
        if name != "abel":
            decimate_for_crowd()
        export(name)


def preview(name, out_dir):
    """Reality-check render: front and three-quarter, neutral daylight."""
    import mathutils
    scene = bpy.context.scene
    arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    print("[human]   bones", [b.name for b in arm.data.bones])
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.data.energy = 3.5
    sun.rotation_euler = (math.radians(50), 0, math.radians(30))
    scene.collection.objects.link(sun)
    world = bpy.data.worlds.new("w")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.55, 0.6, 0.68, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.8
    scene.world = world
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    cam.data.lens = 70
    scene.collection.objects.link(cam)
    scene.camera = cam
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x, scene.render.resolution_y = 900, 1200
    scene.view_settings.view_transform = "AgX"
    for label, loc in (("front", (0, -4.2, 1.0)), ("threequarter", (2.6, -3.2, 1.2)), ("face", (0.35, -1.1, 1.62))):
        cam.location = loc
        target = mathutils.Vector((0, 0, 1.55 if label == "face" else 0.9))
        cam.rotation_euler = (target - mathutils.Vector(loc)).to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = os.path.join(ROOT, out_dir, f"human_{name}_{label}.png")
        bpy.ops.render.render(write_still=True)
        print(f"[human]   preview {scene.render.filepath}")


if PREVIEW:
    preview(ONLY or "abel", PREVIEW)
