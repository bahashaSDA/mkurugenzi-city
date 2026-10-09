import * as THREE from 'three';

// Shared setup for every character GLB built by blender/scripts/build_humans.py.

/** Native forward speed (m/s) of each mocap locomotion clip (printed by mocap.py at build time).
 *  Playback is scaled by actual speed / native so feet don't slide. */
export const NATIVE_SPEED: Record<string, number> = {
  Walk_Slow_Loop: 1.04, // CMU 07_04 slow walk
  Walk_Loop: 1.33, // CMU 35_01 walk
  Jog_Fwd_Loop: 3.04, // CMU 16_35 jog
  Sprint_Loop: 3.75, // CMU 09_01 run
};

// Cut-out cards (hair, brows, lashes, beard, wrap prints): alpha-test, never alpha-blend.
const CUTOUT = /short0|afro|braid|bob|long0|ponytail|eyebrow|eyelash|beard|_alpha/i;

/** Materials: the exporter marks everything BLEND; only cut-out cards need alpha, and they must
 *  alpha-test (sorting-free, writes depth). Everything else is opaque, so skin and clothes
 *  never turn see-through or sort wrongly. */
const SKIN = /skin|body|human/i;

export function prepareCharacter(root: THREE.Object3D, shadows: boolean) {
  root.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isMesh) return;
    m.castShadow = shadows;
    m.receiveShadow = true;
    m.frustumCulled = false; // skinned bounds don't follow the pose
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) {
      mat.transparent = false;
      mat.depthWrite = true;
      if (CUTOUT.test(mat.name)) {
        mat.alphaTest = 0.5;
        mat.side = THREE.DoubleSide;
      } else {
        mat.alphaTest = 0;
      }
      if (SKIN.test(mat.name)) {
        // the face photo already carries its own highlights: keep skin matte, no mirror sheen
        const std = mat as THREE.MeshStandardMaterial;
        std.roughness = Math.max(std.roughness ?? 1, 0.7);
        std.envMapIntensity = 0.45;
      }
      mat.needsUpdate = true;
    }
  });
}

// Lower-body bones: the stylised UAL gesture clips (phone, talking, folded arms, nod) have a wide
// "action hero" stance, so their legs are replaced by the mocap standing idle (real weight shifts).
const LOWER = /^(Root|pelvis|thigh_[lr]|calf_[lr]|foot_[lr]|ball_[lr])\./;

/** Loop-extend a track to a target duration (repeat, then trim), so legs from a different-length
 *  idle clip keep cycling under the upper-body gesture. */
function extendTrack(track: THREE.KeyframeTrack, duration: number, srcDuration: number): THREE.KeyframeTrack {
  const stride = track.getValueSize();
  const times: number[] = [];
  const values: number[] = [];
  for (let k = 0; k * srcDuration < duration + 1e-6; k++) {
    for (let i = 0; i < track.times.length; i++) {
      const t = track.times[i]! + k * srcDuration;
      if (t > duration + 1e-6) break;
      if (times.length && t <= times[times.length - 1]! + 1e-6) continue;
      times.push(t);
      for (let j = 0; j < stride; j++) values.push(track.values[i * stride + j]!);
    }
  }
  const Ctor = track.constructor as new (n: string, t: number[], v: number[]) => THREE.KeyframeTrack;
  return new Ctor(track.name, times, values);
}

/** Upper body from `gesture`, lower body from `base` (mocap idle). */
export function composeUpperLower(gesture: THREE.AnimationClip, base: THREE.AnimationClip): THREE.AnimationClip {
  const upper = gesture.tracks.filter((t) => !LOWER.test(t.name));
  const lower = base.tracks.filter((t) => LOWER.test(t.name)).map((t) => extendTrack(t, gesture.duration, base.duration));
  return new THREE.AnimationClip(gesture.name, gesture.duration, [...upper, ...lower]);
}

export const GESTURE_CLIPS = ['Idle_FoldArms_Loop', 'Idle_TalkingPhone_Loop', 'Idle_Talking_Loop', 'Yes', 'Idle_No_Loop'];

/** Clean clip names (exporter suffixes) and rebuild gesture clips with mocap legs. */
export function prepareClips(clips: THREE.AnimationClip[]): THREE.AnimationClip[] {
  const byName = new Map<string, THREE.AnimationClip>();
  for (const c of clips) {
    c.name = c.name.replace(/\.\d+$/, '');
    byName.set(c.name, c);
  }
  const idle = byName.get('Idle_Loop');
  if (idle) {
    for (const g of GESTURE_CLIPS) {
      const c = byName.get(g);
      if (c) byName.set(g, composeUpperLower(c, idle));
    }
  }
  return [...byName.values()];
}
