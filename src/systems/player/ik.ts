import * as THREE from 'three';

// Hands and feet on the controls (two-bone IK over the animation): on the steering wheel rim in a
// car, on the grips and the footpegs of a boda. Targets are given in Abel's OWN frame (his model
// root: feet at the origin, facing +Z), which the player computes from the vehicle and the seat:
// a vehicle moving at speed can't make the hands lag a frame behind the wheel.

export const playerIK = {
  w: 0, // blend weight 0..1 (eased by the player)
  hands: null as [THREE.Vector3, THREE.Vector3] | null, // left, right
  feet: null as [THREE.Vector3, THREE.Vector3] | null,
  /** per-foot weight (getting in/out: one foot on a target, the other still animated) */
  footW: [1, 1] as [number, number],
};

const _A = new THREE.Vector3();
const _B = new THREE.Vector3();
const _C = new THREE.Vector3();
const _T = new THREE.Vector3();
const _P = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _bend = new THREE.Vector3();
const _E = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qt = new THREE.Quaternion();
const _qw = new THREE.Quaternion();
const _qp = new THREE.Quaternion();
const _id = new THREE.Quaternion();
const _f = new THREE.Vector3();
const _t = new THREE.Vector3();

/** Turn `bone` (in world space) so the direction `from` becomes `to`, by weight w. */
function aim(bone: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3, w: number) {
  if (from.lengthSq() < 1e-8 || to.lengthSq() < 1e-8) return;
  // (slerp into a separate quaternion: q.slerpQuaternions(id, q, w) copies `id` into q first and
  // then slerps towards the overwritten q, i.e. towards nothing: the IK used to do nothing at all)
  _qt.setFromUnitVectors(_f.copy(from).normalize(), _t.copy(to).normalize());
  _q.slerpQuaternions(_id, _qt, w);
  bone.getWorldQuaternion(_qw);
  _qw.premultiply(_q);
  bone.parent!.getWorldQuaternion(_qp);
  bone.quaternion.copy(_qp.invert().multiply(_qw));
  bone.updateMatrixWorld(true);
}

/**
 * Analytic two-bone IK: root (shoulder / hip) -> mid (elbow / knee) -> end (wrist / ankle) to reach
 * `target` (world), bending towards `pole` (world). Bone lengths come from the current pose.
 */
export function solveTwoBone(a: THREE.Object3D, b: THREE.Object3D, c: THREE.Object3D, target: THREE.Vector3, pole: THREE.Vector3, w: number) {
  a.getWorldPosition(_A);
  b.getWorldPosition(_B);
  c.getWorldPosition(_C);
  const l1 = _A.distanceTo(_B);
  const l2 = _B.distanceTo(_C);
  _T.copy(target);
  _dir.subVectors(_T, _A);
  const dist = THREE.MathUtils.clamp(_dir.length(), Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3);
  _dir.normalize();
  // the plane the joint bends in: towards the pole
  _P.subVectors(pole, _A);
  _bend.copy(_P).addScaledVector(_dir, -_P.dot(_dir));
  if (_bend.lengthSq() < 1e-8) _bend.set(0, -1, 0);
  _bend.normalize();
  const cosA = THREE.MathUtils.clamp((l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist), -1, 1);
  const sinA = Math.sqrt(1 - cosA * cosA);
  _E.copy(_A).addScaledVector(_dir, l1 * cosA).addScaledVector(_bend, l1 * sinA);
  aim(a, _B.sub(_A), _E.clone().sub(_A), w);
  b.getWorldPosition(_B);
  c.getWorldPosition(_C);
  _T.copy(_A).addScaledVector(_dir, dist);
  aim(b, _C.sub(_B), _T.sub(_B), w);
}

const _tw = new THREE.Vector3();
const _pw = new THREE.Vector3();
const _m = new THREE.Matrix4();

export interface Limbs {
  root: THREE.Object3D; // Abel's model root (targets are in its parent's... own frame)
  arms: [THREE.Object3D, THREE.Object3D, THREE.Object3D][]; // [upper, lower, hand] left, right
  legs: [THREE.Object3D, THREE.Object3D, THREE.Object3D][]; // [thigh, calf, foot]
}

/** Apply playerIK to the posed skeleton (after the animation mixer). */
export function applyPlayerIK(l: Limbs) {
  if (playerIK.w < 0.01) return;
  l.root.updateMatrixWorld(true);
  _m.copy(l.root.matrixWorld);
  const w = playerIK.w;
  const sides = [1, -1]; // left (+X), right
  if (playerIK.hands) {
    l.arms.forEach(([u, lo, h], i) => {
      _tw.copy(playerIK.hands![i]!).applyMatrix4(_m);
      // elbows: down and out
      lo.getWorldPosition(_pw);
      _pw.add(_E.set(sides[i]! * 0.25, -0.35, -0.1).transformDirection(_m).multiplyScalar(0.35));
      solveTwoBone(u, lo, h, _tw, _pw, w);
    });
  }
  if (playerIK.feet) {
    l.legs.forEach(([th, ca, ft], i) => {
      _tw.copy(playerIK.feet![i]!).applyMatrix4(_m);
      // knees: forward and slightly out
      ca.getWorldPosition(_pw);
      _pw.add(_E.set(sides[i]! * 0.15, 0.1, 0.4).transformDirection(_m).multiplyScalar(0.4));
      const fw = w * playerIK.footW[i]!;
      if (fw > 0.001) solveTwoBone(th, ca, ft, _tw, _pw, fw);
    });
  }
}
