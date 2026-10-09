"""Motion-capture retargeting: CMU Graphics Lab Motion Capture Database (BVH conversion by
B. Hahne / cgspeed, via github.com/una-dinosauria/cmu-mocap) -> MPFB "game_engine" rig.

Real recorded human motion. It replaces the stylised Quaternius locomotion (wide stance, bent
knees) that made characters move like mannequins.

Method (per mapped bone, world space):
  target_world = heading_fix @ source_world @ inv(source_T_pose_world) @ align
  align = swing(target rest dir -> source T-pose dir) @ target rest   (limbs only; torso bones of
          the two rigs follow different tail conventions, aligning them would tilt the body)
Each recording is cut to its most seamless cycle, the walking heading is cancelled (so the motion
always faces the character's forward) and forward travel is removed: the game's character
controller moves the body. The cycle's real speed is reported so playback can match ground speed.
"""
import math

import bpy
from mathutils import Matrix, Quaternion, Vector

from retarget import _assign_action, _dir, _leg_length, _ordered, _world_rest

CMU_TO_GAME = {
    "pelvis": "Hips", "spine_01": "LowerBack", "spine_02": "Spine", "spine_03": "Spine1",
    "neck_01": "Neck", "head": "Head",
}
for _side, _s in (("l", "Left"), ("r", "Right")):
    CMU_TO_GAME.update({
        f"clavicle_{_side}": f"{_s}Shoulder", f"upperarm_{_side}": f"{_s}Arm", f"lowerarm_{_side}": f"{_s}ForeArm",
        f"hand_{_side}": f"{_s}Hand", f"thigh_{_side}": f"{_s}UpLeg", f"calf_{_side}": f"{_s}Leg",
        f"foot_{_side}": f"{_s}Foot", f"ball_{_side}": f"{_s}ToeBase",
    })
LIMB = ("clavicle", "upperarm", "lowerarm", "hand", "thigh", "calf", "foot", "ball")
SRC_FPS = 120  # CMU capture rate


def _pw(arm, name):
    pb = arm.pose.bones[name]
    m = arm.matrix_world
    return (m @ pb.matrix), ((m @ pb.tail) - (m @ pb.head)).normalized()


def _signature(src):
    hips_inv = _pw(src, "Hips")[0].to_quaternion().inverted()
    return [hips_inv @ _pw(src, b)[0].to_quaternion()
            for b in ("LeftUpLeg", "LeftLeg", "RightUpLeg", "RightLeg", "LeftArm", "RightArm", "Spine1")]


def _dist(a, b):
    return sum(qa.rotation_difference(qb).angle for qa, qb in zip(a, b))


def _forward(src):
    l = _pw(src, "LeftUpLeg")[0].translation
    r = _pw(src, "RightUpLeg")[0].translation
    v = Vector((0, 0, 1)).cross(r - l)
    v.z = 0
    return v.normalized()


def find_loop(src, act, start_frac, min_len, max_len):
    """Pick [s, e) whose end pose best matches its start pose (seamless cycle)."""
    scene = bpy.context.scene
    f0, f1 = (int(round(v)) for v in act.frame_range)
    s = int(f0 + (f1 - f0) * start_frac)
    scene.frame_set(s)
    ref = _signature(src)
    best, best_e = 1e9, None
    for e in range(s + min_len, min(s + max_len, f1)):
        scene.frame_set(e)
        d = _dist(ref, _signature(src))
        if d < best:
            best, best_e = d, e
    if best_e is None:
        raise RuntimeError(f"clip too short for loop search ({f0}-{f1})")
    return s, best_e, best


def retarget_mocap(src, tgt, out_name, loop=(0.35, 90, 170), out_step=4, frames=None, oneshot=False,
                   abs_height=False, face=None):
    """Bake one looping clip from an imported CMU BVH armature onto tgt. Returns (action, m/s).

    frames=(s0, s1) uses a fixed range instead of the loop search; oneshot=True drops the closing
    loop key; abs_height=<frame where the subject stands upright> keeps the hips' real height above
    the floor (lying, kneeling, getting up) instead of measuring it from the first frame; face=(bone, frame) aims the clip
    so that bone (a punching hand, a kicking foot) points forward at that frame."""
    scene = bpy.context.scene
    act = src.animation_data.action
    f0 = int(round(act.frame_range[0]))
    mapping = {t: s for t, s in CMU_TO_GAME.items() if t in tgt.data.bones and s in src.pose.bones}

    scene.frame_set(f0)  # frame 1 = T-pose added by the BVH conversion
    ref_inv, align, swings = {}, {}, {}
    for t, s in mapping.items():
        mw, d_s = _pw(src, s)
        ref_inv[s] = mw.to_quaternion().inverted()
    # Hands and toes inherit their parent's alignment: in the BVH T-pose the hand bone's tail
    # points straight up (toward a finger-base offset), so aligning it on its own direction bent
    # every wrist 90 deg (hands thrust forward, palms up).
    INHERIT = {"hand_l": "lowerarm_l", "hand_r": "lowerarm_r", "ball_l": "foot_l", "ball_r": "foot_r"}
    for t in sorted(mapping, key=lambda n: n in INHERIT):
        tb = tgt.data.bones[t]
        swing = Quaternion()
        if t in INHERIT:
            swing = swings.get(INHERIT[t], Quaternion())
        elif t.startswith(LIMB):
            d_s = _pw(src, mapping[t])[1]
            d_t = _dir(tgt, tb)
            if d_t.angle(d_s) < 2.6:
                swing = d_t.rotation_difference(d_s)
        swings[t] = swing
        align[t] = swing @ _world_rest(tgt, tb).to_quaternion()
    ref_fwd = _forward(src)
    leg_src = ((_pw(src, "LeftUpLeg")[0].translation - _pw(src, "LeftLeg")[0].translation).length
               + (_pw(src, "LeftLeg")[0].translation - _pw(src, "LeftFoot")[0].translation).length)
    leg_ratio = _leg_length(tgt, "thigh_l", "calf_l") / leg_src
    t_pelvis_rest = tgt.matrix_world @ tgt.data.bones["pelvis"].head_local

    if abs_height:  # a frame where the subject stands upright in this take: hips there = rest height
        scene.frame_set(abs_height)
        t_pose_hips_z = _pw(src, "Hips")[0].translation.z
    s0, s1, err = (frames[0], frames[1], 0.0) if frames else find_loop(src, act, *loop)
    scene.frame_set(s0)
    p0 = _pw(src, "Hips")[0].translation.copy()
    if abs_height:
        p0.z = t_pose_hips_z
    scene.frame_set(s1)
    p1 = _pw(src, "Hips")[0].translation.copy()
    travel = p1 - p0
    travel.z = 0
    duration = (s1 - s0) / SRC_FPS
    speed = travel.length * leg_ratio / duration
    if face:
        scene.frame_set(face[1])
        heading = _pw(src, face[0])[0].translation - _pw(src, "Hips")[0].translation
        heading.z = 0
        heading.normalize()
    elif speed > 0.3:
        heading = travel.normalized()
    else:  # standing: average hip facing over the cycle
        acc = Vector()
        for f in range(s0, s1, 8):
            scene.frame_set(f)
            acc += _forward(src)
        heading = acc.normalized()
    yaw = math.atan2(heading.y, heading.x) - math.atan2(ref_fwd.y, ref_fwd.x)
    corr = Quaternion(Vector((0, 0, 1)), -yaw)
    tw_inv = tgt.matrix_world.to_quaternion().inverted()
    tw_inv_m = tgt.matrix_world.inverted()
    order = _ordered(list(tgt.data.bones))
    for pb in tgt.pose.bones:
        pb.rotation_mode = "QUATERNION"

    out = bpy.data.actions.new(out_name)
    out.use_fake_user = True
    _assign_action(tgt, out)
    fps = scene.render.fps
    frames = list(range(s0, s1, out_step))
    prev, first = {}, {}
    for i, f in enumerate(frames + [None]):  # final key repeats the first: seamless loop
        frame_out = 1 + (i * out_step) / SRC_FPS * fps
        if f is None:
            if oneshot:
                break
            for name, (q, loc) in first.items():
                pb = tgt.pose.bones[name]
                pb.rotation_quaternion = q
                pb.keyframe_insert("rotation_quaternion", frame=frame_out)
                if loc is not None:
                    pb.location = loc
                    pb.keyframe_insert("location", frame=frame_out)
            break
        scene.frame_set(f)
        D = {}
        for tb in order:
            chain = (D[tb.parent.name] @ (tb.parent.matrix_local.inverted() @ tb.matrix_local)) if tb.parent else tb.matrix_local.copy()
            if tb.name in mapping:
                s = mapping[tb.name]
                sw = _pw(src, s)[0]
                rot = tw_inv @ corr @ sw.to_quaternion() @ ref_inv[s] @ align[tb.name]
                loc = chain.translation
                if tb.name == "pelvis":
                    # in place: keep bob and sway, remove the forward travel of the cycle
                    t = (f - s0) / (s1 - s0)
                    delta = corr @ (sw.translation - p0 - travel * t) * leg_ratio
                    loc = tw_inv_m @ (t_pelvis_rest + delta)
                D[tb.name] = Matrix.LocRotScale(loc, rot, None)
            else:
                D[tb.name] = chain
            basis = chain.inverted() @ D[tb.name]
            pb = tgt.pose.bones[tb.name]
            q = basis.to_quaternion()
            if tb.name in prev and prev[tb.name].dot(q) < 0:
                q.negate()
            prev[tb.name] = q
            pb.rotation_quaternion = q
            pb.keyframe_insert("rotation_quaternion", frame=frame_out)
            loc_key = None
            if tb.name == "pelvis":
                pb.location = basis.translation
                pb.keyframe_insert("location", frame=frame_out)
                loc_key = basis.translation.copy()
            if i == 0:
                first[tb.name] = (q.copy(), loc_key)
    tgt.animation_data.action = None
    for pb in tgt.pose.bones:
        pb.rotation_quaternion = Quaternion()
        pb.location = (0, 0, 0)
    print(f"[mocap] {out_name}: frames {s0}-{s1} ({duration:.2f}s, loop err {err:.2f}), "
          f"speed {speed:.2f} m/s, heading fix {math.degrees(yaw):.0f} deg")
    return out, speed
