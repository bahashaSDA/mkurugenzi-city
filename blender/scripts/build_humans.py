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
import numpy as np

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from common import script_args  # noqa: E402

from bl_ext.blender_org.mpfb.services.humanservice import HumanService  # noqa: E402
from retarget import retarget  # noqa: E402
from mocap import retarget_mocap  # noqa: E402
from abel_look import apply_abel_look, cull_hidden_body  # noqa: E402
from npc_look import headwrap, hi_vis_vest, merch_outfit, recolour_outfit  # noqa: E402

# Per-character dress (Nairobi street wear). Linear colour factors.
NPC_DRESS = {
    "mama_mboga": lambda: (recolour_outfit("female_elegantsuit01", (0.45, 0.06, 0.03), (0.03, 0.16, 0.06),
                                           "mboga_blouse", "mboga_skirt"),
                           headwrap(((0.55, 0.05, 0.03), (0.85, 0.55, 0.05), (0.05, 0.25, 0.45)), seed=4)),
    "auntie": lambda: (recolour_outfit("female_elegantsuit01", (0.20, 0.02, 0.06), (0.04, 0.04, 0.05),
                                       "auntie_blouse", "auntie_skirt"),
                       headwrap(((0.05, 0.30, 0.12), (0.85, 0.75, 0.10), (0.45, 0.05, 0.25)), seed=9)),
    # secondary-school uniform: bottle-green top, grey skirt
    "student": lambda: recolour_outfit("female_elegantsuit01", (0.02, 0.12, 0.05), (0.15, 0.15, 0.16),
                                       "uniform_sweater", "uniform_grey"),
    # matatu conductor (owner photo): the regulation maroon shirt and maroon trousers
    "conductor": lambda: recolour_outfit("male_casualsuit01", (0.22, 0.03, 0.06), (0.16, 0.025, 0.045),
                                         "conductor_shirt", "conductor_trousers"),
    # boda boda rider: hi-vis reflective vest over his clothes
    "hustler": lambda: hi_vis_vest("male_casualsuit05"),
}

BLACK, CHARCOAL, SAND = (0.012, 0.012, 0.014), (0.06, 0.06, 0.065), (0.58, 0.43, 0.26)
COFFEE, BURGUNDY, NAVY = (0.11, 0.045, 0.021), (0.155, 0.008, 0.018), (0.026, 0.045, 0.10)
WHITE, IVORY, GREY, DENIM = (0.82, 0.82, 0.8), (0.83, 0.77, 0.64), (0.4, 0.4, 0.41), (0.05, 0.08, 0.16)
W_LOGO, B_LOGO, BR_LOGO = "merch_logo_white.png", "merch_logo_black.png", "merch_logo_brown.png"

# The crowd wears Abel's own brand (owner request: ~90% in Mkurugenzi merch from mkurugenzi.ke).
FAN_DRESS = {
    "fan_hoodie_black": lambda: merch_outfit("male_casualsuit02", BLACK, BLACK, "black_excellence", W_LOGO),
    "fan_hoodie_sand": lambda: merch_outfit("male_casualsuit02", SAND, DENIM, "desert_sand", BR_LOGO),
    "fan_tee_burgundy": lambda: merch_outfit("male_casualsuit04", BURGUNDY, DENIM, "burgundy_bliss", W_LOGO),
    "fan_tee_botanical": lambda: merch_outfit("male_casualsuit06", WHITE, DENIM, "botanical_white", B_LOGO, pattern="merch_botanical.png"),
    "fan_hoodie_charcoal": lambda: merch_outfit("male_casualsuit02", CHARCOAL, CHARCOAL, "charcoal_grey", W_LOGO),
    "fan_suit_coffee": lambda: merch_outfit("male_casualsuit02", COFFEE, COFFEE, "coffee_brown", W_LOGO),
    "fan_suit_ivory": lambda: merch_outfit("male_casualsuit02", IVORY, IVORY, "ivory_essence", BR_LOGO),
    "fan_tee_navy": lambda: merch_outfit("male_casualsuit04", NAVY, DENIM, "faded_navy", W_LOGO),
    "fan_lady_black": lambda: merch_outfit("female_sportsuit01", BLACK, BLACK, "ladies_black", W_LOGO, logo_size=0.12),
    "fan_lady_burgundy": lambda: merch_outfit("female_sportsuit01", BURGUNDY, BURGUNDY, "ladies_burgundy", W_LOGO, logo_size=0.12),
    "fan_lady_grey": lambda: merch_outfit("female_sportsuit01", GREY, GREY, "ladies_grey", B_LOGO, logo_size=0.12),
    "fan_lady_tee": lambda: merch_outfit("female_casualsuit01", WHITE, DENIM, "ladies_botanical", B_LOGO, pattern="merch_botanical.png"),
}

# CMU trials (see mocap.py): (file, clip name, loop search (start fraction, min, max frames @120 Hz))
MOCAP = [
    ("111_28.bvh", "Idle_Loop", (0.15, 500, 1400)),   # standing still: weight shifts, breathing
    ("35_01.bvh", "Walk_Loop", (0.20, 110, 190)),     # natural walk
    ("07_04.bvh", "Walk_Slow_Loop", (0.30, 120, 200)),  # slow stroll (pedestrians)
    ("16_35.bvh", "Jog_Fwd_Loop", (0.30, 55, 110)),   # jog
    ("09_01.bvh", "Sprint_Loop", (0.35, 45, 95)),     # run
]
MOCAP_NPC = {"Idle_Loop", "Walk_Loop", "Walk_Slow_Loop"}

UAL1 = "ual1.glb"  # Quaternius UAL 1 Standard (Godot GLB), renamed: the importer rejects "[...]" paths
UAL2 = "ual2.glb"  # Quaternius UAL 2 Standard (Unreal-Godot GLB)
# Animation sets (no combat: the world is non-violent, SPEC 8.6)
PLAYER_ANIMS = {
    UAL1: ["Idle_Talking_Loop", "Jump_Start", "Jump_Loop", "Jump_Land", "Sitting_Enter", "Sitting_Idle_Loop", "Sitting_Talking_Loop",
           "Sitting_Exit", "Interact", "Push_Loop", "Driving_Loop", "Dance_Loop", "PickUp_Table", "Crouch_Idle_Loop"],
    UAL2: ["Idle_FoldArms_Loop", "Idle_TalkingPhone_Loop", "Idle_No_Loop", "Yes", "Walk_Carry_Loop", "Consume",
           "ClimbUp_1m_RM", "Idle_Rail_Loop"],
}
NPC_ANIMS = {
    UAL1: ["Idle_Talking_Loop", "Sitting_Idle_Loop"],
    UAL2: ["Idle_FoldArms_Loop", "Idle_TalkingPhone_Loop", "Walk_Carry_Loop", "Yes"],
}

ARGS = script_args()
OUT = ARGS[ARGS.index("--out") + 1] if "--out" in ARGS else "public/models/raw"
ONLY = ARGS[ARGS.index("--only") + 1] if "--only" in ARGS else None
PREVIEW = ARGS[ARGS.index("--preview") + 1] if "--preview" in ARGS else None
UAL_DIR = ARGS[ARGS.index("--ual") + 1] if "--ual" in ARGS else None
MOCAP_DIR = ARGS[ARGS.index("--mocap") + 1] if "--mocap" in ARGS else None
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


def age_slider(years):
    """MPFB age macro: 0 = 1 yr, 0.1875 = 11, 0.5 = 25, 1 = 90 (piecewise linear)."""
    if years <= 25:
        return 0.1875 + (years - 11) / (25 - 11) * (0.5 - 0.1875)
    return 0.5 + (years - 25) / (90 - 25) * 0.5


def human(name, *, gender, years, weight=0.5, muscle=0.5, height=0.5, skin, hair, eyebrows="eyebrow001",
          clothes=(), proxy=None, targets=()):
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
        "targets": [{"target": t, "value": v} for t, v in targets],
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
    # Abel stand-in matched to the owner's reference photo: full rounded face, broad warm smile
    # lines, trimmed beard (added in abel_look), suit + tie; cap/glasses/beard/pocket square/bracelet
    # are modelled in abel_look.py. Final likeness still needs the SPEC 5.5 capture session.
    "abel": human("abel", gender=1.0, years=38, weight=0.6, muscle=0.55, height=0.55,
                  skin="middleage_african_male", hair="short01", eyebrows="eyebrow002",
                  clothes=("male_elegantsuit01", "shoes03"),
                  # his face (ref photo): broad and round, full cheeks, wide jaw, short neck
                  # v2 (measured against ref_22: face ~20% narrower and ~8% longer per eye spacing than v1,
                  # larger almond eyes, warm smile): oval rather than round, smiling mouth corners
                  targets=(("head-oval", 0.5), ("head-round", 0.15), ("head-scale-horiz-decr", 0.3),
                           ("head-scale-vert-incr", 0.1), ("head-fat-incr", 0.1),
                           ("l-cheek-volume-incr", 0.15), ("r-cheek-volume-incr", 0.15), ("chin-height-incr", 0.35),
                           ("neck-scale-horiz-incr", 0.25), ("l-eye-scale-incr", 0.35), ("r-eye-scale-incr", 0.35),
                           ("l-eye-trans-out", 0.45), ("r-eye-trans-out", 0.45),
                           ("mouth-scale-horiz-incr", 0.35), ("mouth-angles-up", 0.6), ("mouth-laugh-lines-in", 0.5),
                           ("mouth-lowerlip-volume-incr", 0.2))),
    # Street pedestrians: varied ages, builds, hair and clothing (VISUAL_OVERHAUL 19: no clones).
    "mama_mboga": human("mama_mboga", gender=0.0, years=45, weight=0.7, muscle=0.45, height=0.42,
                        skin="middleage_african_female", hair="braid01", clothes=("female_elegantsuit01", "shoes05")),
    "hustler": human("hustler", gender=1.0, years=24, weight=0.42, muscle=0.55, height=0.55,
                     skin="young_african_male", hair="short03", clothes=("male_casualsuit05", "shoes01")),
    "office": human("office", gender=1.0, years=35, weight=0.55, muscle=0.5, height=0.6,
                    skin="middleage_african_male", hair="short01", clothes=("male_elegantsuit01", "shoes03")),
    "student": human("student", gender=0.0, years=17, weight=0.45, muscle=0.45, height=0.45,
                     skin="young_african_female", hair="short02", clothes=("female_elegantsuit01", "shoes06")),  # Kenyan schools: short cropped hair
    "elder": human("elder", gender=1.0, years=68, weight=0.48, muscle=0.4, height=0.48,
                   skin="old_african_male", hair="short04", clothes=("male_casualsuit01", "shoes02")),
    "young_woman": human("young_woman", gender=0.0, years=26, weight=0.5, muscle=0.5, height=0.52,
                         skin="young_african_female", hair="afro01", clothes=("female_sportsuit01", "shoes04")),
    "worker": human("worker", gender=1.0, years=30, weight=0.55, muscle=0.62, height=0.5,
                    skin="young_african_male", hair="short02", clothes=("male_worksuit01", "shoes01")),
    "conductor": human("conductor", gender=1.0, years=27, weight=0.42, muscle=0.55, height=0.55,
                       skin="young_african_male", hair="short04", clothes=("male_casualsuit01", "shoes01")),
    "auntie": human("auntie", gender=0.0, years=55, weight=0.62, muscle=0.42, height=0.45,
                    skin="old_african_female", hair="bob02", clothes=("female_elegantsuit01", "shoes05")),
    # ---- Wakurugenzi in merch (varied ages, builds and hair: no clones) ----
    "fan_hoodie_black": human("fan_hoodie_black", gender=1.0, years=23, weight=0.45, muscle=0.6, height=0.6,
                              skin="young_african_male", hair="short02", clothes=("male_casualsuit02", "shoes04")),
    "fan_hoodie_sand": human("fan_hoodie_sand", gender=1.0, years=31, weight=0.55, muscle=0.5, height=0.52,
                             skin="middleage_african_male", hair="short04", clothes=("male_casualsuit02", "shoes01")),
    "fan_tee_burgundy": human("fan_tee_burgundy", gender=1.0, years=27, weight=0.5, muscle=0.6, height=0.57,
                              skin="young_african_male", hair="short03", clothes=("male_casualsuit04", "shoes04")),
    "fan_tee_botanical": human("fan_tee_botanical", gender=1.0, years=42, weight=0.62, muscle=0.5, height=0.5,
                               skin="middleage_african_male", hair="short01", clothes=("male_casualsuit06", "shoes02")),
    "fan_hoodie_charcoal": human("fan_hoodie_charcoal", gender=1.0, years=19, weight=0.38, muscle=0.5, height=0.62,
                                 skin="young_african_male", hair="short02", clothes=("male_casualsuit02", "shoes04")),
    "fan_suit_coffee": human("fan_suit_coffee", gender=1.0, years=35, weight=0.6, muscle=0.55, height=0.55,
                             skin="middleage_african_male", hair="short04", clothes=("male_casualsuit02", "shoes01")),
    "fan_suit_ivory": human("fan_suit_ivory", gender=1.0, years=52, weight=0.65, muscle=0.45, height=0.48,
                            skin="old_african_male", hair="short04", clothes=("male_casualsuit02", "shoes03")),
    "fan_tee_navy": human("fan_tee_navy", gender=1.0, years=29, weight=0.5, muscle=0.55, height=0.5,
                          skin="young_african_male", hair="short01", clothes=("male_casualsuit04", "shoes01")),
    "fan_lady_black": human("fan_lady_black", gender=0.0, years=24, weight=0.48, muscle=0.5, height=0.55,
                            skin="young_african_female", hair="afro01", clothes=("female_sportsuit01", "shoes04")),
    "fan_lady_burgundy": human("fan_lady_burgundy", gender=0.0, years=33, weight=0.58, muscle=0.45, height=0.48,
                               skin="middleage_african_female", hair="braid01", clothes=("female_sportsuit01", "shoes06")),
    "fan_lady_grey": human("fan_lady_grey", gender=0.0, years=21, weight=0.42, muscle=0.5, height=0.52,
                           skin="young_african_female", hair="short02", clothes=("female_sportsuit01", "shoes04")),
    "fan_lady_tee": human("fan_lady_tee", gender=0.0, years=45, weight=0.66, muscle=0.42, height=0.45,
                          skin="middleage_african_female", hair="bob02", clothes=("female_casualsuit01", "shoes05")),
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


# ----------------------------------------------------------------------------- crowd atlas
CUTOUT_RE = ("short0", "afro", "braid", "bob", "long0", "ponytail", "eyebrow", "eyelash", "beard")


def _srgb_to_lin(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def _lin_to_srgb(c):
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(np.maximum(c, 0), 1 / 2.4) - 0.055)


def _base_colour(mat, size):
    """(size, size, 4) sRGB RGBA of a material's base colour: its diffuse texture (resized) times any
    MULTIPLY tint (recolour_outfit), or a flat colour."""
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    texs = [n for n in nt.nodes if n.type == "TEX_IMAGE" and n.image]
    pick = [n for n in texs if any(k in n.image.name.lower() for k in ("diffuse", "albedo", "color", "dyed", "_d."))]
    pick = pick or [n for n in texs if not any(k in n.image.name.lower() for k in ("normal", "rough", "spec", "bump", "ao"))]
    out = np.ones((size, size, 4), dtype=np.float32)
    if pick:
        img = pick[0].image.copy()
        img.scale(size, size)
        px = np.empty(size * size * 4, dtype=np.float32)
        img.pixels.foreach_get(px)
        out = px.reshape(size, size, 4)
        bpy.data.images.remove(img)
    elif bsdf:
        out[..., :3] = _lin_to_srgb(np.array(bsdf.inputs["Base Color"].default_value[:3]))
    for n in nt.nodes:
        if n.type == "MIX" and getattr(n, "blend_type", "") == "MULTIPLY":
            tint = np.array(n.inputs[7].default_value[:3])
            out[..., :3] = _lin_to_srgb(_srgb_to_lin(out[..., :3]) * tint)
    return out


def _atlas(objs, name, size, alpha):
    """Join objs into one mesh; composite every material into a grid atlas and remap UVs to it.
    One material = one draw call per person instead of one per garment."""
    objs = [o for o in objs if o.data.materials]
    if not objs:
        return
    for o in bpy.context.view_layer.objects:
        o.select_set(o in objs)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    mats = list(ob.data.materials)
    g = math.ceil(math.sqrt(len(mats)))
    cell = size // g
    pad = 4
    atlas = np.zeros((size, size, 4), dtype=np.float32)
    for i, m in enumerate(mats):
        cx, cy = (i % g) * cell, (i // g) * cell
        atlas[cy:cy + cell, cx:cx + cell] = _base_colour(m, cell)
    me = ob.data
    uv = me.uv_layers.active.data
    for poly in me.polygons:
        i = poly.material_index
        ox, oy = (i % g) * cell, (i // g) * cell
        for li in poly.loop_indices:
            u, v = uv[li].uv
            u = min(max(u, 0.0), 1.0)
            v = min(max(v, 0.0), 1.0)
            uv[li].uv = ((ox + pad + u * (cell - 2 * pad)) / size, (oy + pad + v * (cell - 2 * pad)) / size)
    img = bpy.data.images.new(name, size, size, alpha=True)
    img.pixels.foreach_set(atlas.ravel())
    img.pack()
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = img
    b = nt.nodes["Principled BSDF"]
    nt.links.new(t.outputs["Color"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.75
    if alpha:
        nt.links.new(t.outputs["Alpha"], b.inputs["Alpha"])
    me.materials.clear()
    me.materials.append(mat)
    for poly in me.polygons:
        poly.material_index = 0
    print(f"[human]   atlas {name}: {len(mats)} materials -> 1 ({g}x{g} grid, {cell}px cells)")


def atlas_crowd(name):
    """Pedestrians: 2 draw calls each (opaque atlas + hair/brow cut-out atlas)."""
    meshes = [o for o in bpy.data.objects if o.type == "MESH" and o.visible_get() and not o.name.endswith(".body")]
    cut = [o for o in meshes if any(k in m.name.lower() for m in o.data.materials if m for k in CUTOUT_RE)]
    opaque = [o for o in meshes if o not in cut]
    _atlas(opaque, f"{name}_atlas", 1024, alpha=False)
    _atlas(cut, f"{name}_hair_alpha", 512, alpha=True)


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
    if MOCAP_DIR:
        speeds = {}
        for fname, clip, loop in MOCAP:
            if anim_sets is NPC_ANIMS and clip not in MOCAP_NPC:
                continue
            before = set(bpy.data.objects)
            bpy.ops.import_anim.bvh(filepath=os.path.join(MOCAP_DIR, fname), global_scale=0.056444,
                                    rotate_mode="NATIVE", axis_forward="-Z", axis_up="Y")
            src = next(o for o in bpy.data.objects if o not in before and o.type == "ARMATURE")
            _, speeds[clip] = retarget_mocap(src, tgt, clip, loop=loop)
            bpy.data.objects.remove(src, do_unlink=True)
        print("[human]   mocap speeds", {k: round(v, 2) for k, v in speeds.items()})
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
        export_materials="EXPORT", export_image_format="AUTO",  # AUTO keeps PNG alpha: hair/brow/lash cards need it (JPEG made them solid slabs)
    )
    print(f"[human]   exported {path}")


def build(spec):
    bpy.ops.wm.read_homefile(use_empty=True)
    settings = HumanService.get_default_deserialization_settings()
    settings["subdiv_levels"] = 0
    settings["override_skin_model"] = "MAKESKIN"
    basemesh = HumanService.deserialize_from_dict(spec, settings)
    if spec.get("targets"):
        # face-shape targets change the head after hair/clothes were fitted: refit them, or the
        # hair hangs over the face
        HumanService.refit(basemesh)
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
    if "--fans" in ARGS and not name.startswith("fan_"):
        continue
    print(f"[human] building {name}")
    build(spec)
    finish_materials(name)
    cull_hidden_body()
    if name == "abel":
        apply_abel_look()
    elif name in NPC_DRESS:
        NPC_DRESS[name]()
    elif name in FAN_DRESS:
        FAN_DRESS[name]()
    report()
    if UAL_DIR:
        if "--noanim" not in ARGS:
            add_animations(PLAYER_ANIMS if name == "abel" else NPC_ANIMS)
        if name != "abel":
            decimate_for_crowd()
            atlas_crowd(name)
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
