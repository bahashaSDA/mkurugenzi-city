"""Animation retargeting: Quaternius UAL (Rigify-style DEF- bones) -> MPFB "game_engine" rig.

For every mapped bone:
  C   = rot(target rest dir -> source rest dir) @ target rest rotation   (aligns rest poses: the
        source rests in a T-pose, MPFB in an A-pose, and their bone rolls differ)
  each frame:  target world rotation = source pose world rot @ inv(source rest world rot) @ C
Desired matrices are composed down the hierarchy in pure math (no depsgraph updates), then
converted to pose-bone basis rotations and keyed. The pelvis also gets translation, scaled by
the leg-length ratio so feet stay planted on a differently proportioned body.
"""
import bpy
from mathutils import Matrix, Quaternion

UAL_TO_GAME = {
    "pelvis": "DEF-hips",
    "spine_01": "DEF-spine.001", "spine_02": "DEF-spine.002", "spine_03": "DEF-spine.003",
    "neck_01": "DEF-neck", "head": "DEF-head",
}
for side, s in (("l", "L"), ("r", "R")):
    UAL_TO_GAME.update({
        f"clavicle_{side}": f"DEF-shoulder.{s}", f"upperarm_{side}": f"DEF-upper_arm.{s}",
        f"lowerarm_{side}": f"DEF-forearm.{s}", f"hand_{side}": f"DEF-hand.{s}",
        f"thigh_{side}": f"DEF-thigh.{s}", f"calf_{side}": f"DEF-shin.{s}",
        f"foot_{side}": f"DEF-foot.{s}", f"ball_{side}": f"DEF-toe.{s}",
    })
    for finger in ("index", "middle", "pinky", "ring"):
        for i in (1, 2, 3):
            UAL_TO_GAME[f"{finger}_0{i}_{side}"] = f"DEF-f_{finger}.0{i}.{s}"
    for i in (1, 2, 3):
        UAL_TO_GAME[f"thumb_0{i}_{side}"] = f"DEF-thumb.0{i}.{s}"


# UAL 2 already uses Unreal-mannequin names (same as MPFB game_engine) except "Head".
UE_IDENTITY = {t: t for t in UAL_TO_GAME}
UE_IDENTITY["head"] = "Head"


def mapping_for(src):
    """Pick the bone map by the source skeleton's naming convention."""
    return UAL_TO_GAME if "DEF-hips" in src.data.bones else UE_IDENTITY


def _world_rest(arm, bone):
    return (arm.matrix_world @ bone.matrix_local)


def _dir(arm, bone):
    m = arm.matrix_world
    return (m @ bone.tail_local - m @ bone.head_local).normalized()


def _leg_length(arm, thigh, calf):
    b1, b2 = arm.data.bones[thigh], arm.data.bones[calf]
    m = arm.matrix_world
    return (m @ b1.head_local - m @ b1.tail_local).length + (m @ b2.head_local - m @ b2.tail_local).length


def _ordered(bones):
    def depth(b):
        d = 0
        while b.parent:
            d += 1
            b = b.parent
        return d
    return sorted(bones, key=depth)


def _assign_action(obj, action):
    obj.animation_data_create()
    obj.animation_data.action = action
    slots = getattr(action, "slots", None)
    if slots is not None and len(slots) and hasattr(obj.animation_data, "action_slot"):
        obj.animation_data.action_slot = slots[0]


def retarget(src, tgt, action_names, rename=None):
    """Bake each source action onto tgt as a new action with the same (or renamed) name."""
    scene = bpy.context.scene
    full = mapping_for(src)
    mapping = {t: s for t, s in full.items() if t in tgt.data.bones and s in src.data.bones}
    s_hips, s_thigh, s_calf = full["pelvis"], full["thigh_l"], full["calf_l"]
    tw_rot_inv = tgt.matrix_world.to_quaternion().inverted()
    s_rest_inv, align = {}, {}
    for t, s in mapping.items():
        sb, tb = src.data.bones[s], tgt.data.bones[t]
        s_rest_inv[s] = _world_rest(src, sb).to_quaternion().inverted()
        swing = _dir(tgt, tb).rotation_difference(_dir(src, sb))
        align[t] = swing @ _world_rest(tgt, tb).to_quaternion()
    leg_ratio = _leg_length(tgt, "thigh_l", "calf_l") / _leg_length(src, s_thigh, s_calf)
    s_hips_rest = src.matrix_world @ src.data.bones[s_hips].head_local
    t_pelvis_rest = tgt.matrix_world @ tgt.data.bones["pelvis"].head_local
    order = _ordered(list(tgt.data.bones))
    for pb in tgt.pose.bones:
        pb.rotation_mode = "QUATERNION"

    made = []
    for name in action_names:
        act = bpy.data.actions.get(name)
        if act is None:
            print(f"[retarget] missing source action {name}")
            continue
        _assign_action(src, act)
        f0, f1 = (int(round(v)) for v in act.frame_range)
        out_name = (rename or {}).get(name, name)
        act.name = f"{name}__src"  # free the name, or ours becomes "<name>.001"
        out = bpy.data.actions.new(out_name)
        out.use_fake_user = True
        _assign_action(tgt, out)
        prev = {}
        for f in range(f0, f1 + 1):
            scene.frame_set(f)
            D = {}
            for tb in order:
                chain = (D[tb.parent.name] @ (tb.parent.matrix_local.inverted() @ tb.matrix_local)) if tb.parent else tb.matrix_local.copy()
                if tb.name in mapping:
                    s = mapping[tb.name]
                    sw = src.matrix_world @ src.pose.bones[s].matrix
                    rot_world = sw.to_quaternion() @ s_rest_inv[s] @ align[tb.name]
                    rot_arm = tw_rot_inv @ rot_world
                    loc = chain.translation
                    if tb.name == "pelvis":
                        delta = (sw.translation - s_hips_rest) * leg_ratio
                        loc = tgt.matrix_world.inverted() @ (t_pelvis_rest + delta)
                    D[tb.name] = Matrix.LocRotScale(loc, rot_arm, None)
                else:
                    D[tb.name] = chain
                basis = chain.inverted() @ D[tb.name]
                pb = tgt.pose.bones[tb.name]
                q = basis.to_quaternion()
                if tb.name in prev and prev[tb.name].dot(q) < 0:
                    q.negate()  # keep quaternion hemisphere continuous (no flips when interpolating)
                prev[tb.name] = q
                pb.rotation_quaternion = q
                pb.keyframe_insert("rotation_quaternion", frame=f)
                if tb.name == "pelvis":
                    pb.location = basis.translation
                    pb.keyframe_insert("location", frame=f)
        made.append(out)
        print(f"[retarget] {name} -> {out_name} ({f1 - f0 + 1} frames)")
    tgt.animation_data.action = None
    for pb in tgt.pose.bones:
        pb.rotation_quaternion = Quaternion()
        pb.location = (0, 0, 0)
    return made
