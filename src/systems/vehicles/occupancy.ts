import * as THREE from 'three';
import type { Sfx } from '../audio/sfx';

// One state machine for getting into and out of anything with a seat (GTA style):
//
//   walking -> approaching -> boarding -> seated -> exiting -> walking
//
// approaching : Abel walks (collision-aware, character controller) to the standing spot beside the
//               door, then turns to face it. Moving the stick cancels, like GTA.
// boarding    : a short keyed path in VEHICLE-LOCAL space (reach for the door, step in / up, sit),
//               each key with its own clip. Driving input stays off.
// seated      : Abel is attached to the vehicle's rendered transform (pitch and roll included).
// exiting     : the reverse path to a ground spot that was checked for walls and traffic first.
//
// The vehicle system that owns the ride writes `frame` (its world matrix as it will be rendered this
// frame) every frame BEFORE the player runs (useFrame priorities: physics -100, vehicles -50/-40,
// player 0), so the seated character can never lag a physics step behind the car or float outside it.

export type SeatKind = 'car' | 'transit' | 'bike';
export type Phase = 'walking' | 'approaching' | 'boarding' | 'seated' | 'exiting';

export interface Key {
  p: THREE.Vector3; // vehicle-local feet position
  yaw: number; // vehicle-local facing (0 = facing the vehicle's forward, +Z)
  clip: string; // clip while moving towards this key
  ms: number; // time to reach this key from the previous one
  sound?: Sfx;
  /** how open the door is when this key is reached (0..1); unset = unchanged */
  door?: number;
  /**
   * Where each foot is (vehicle-local: left, right) when this key is reached; null = the animation
   * places it. A foot that moves between two keys travels in a lifted arc (a step); a foot handed
   * from the animation to a target (or back) blends over the key. Getting into a car: one leg in,
   * sit, the other leg in.
   */
  feet?: [THREE.Vector3 | null, THREE.Vector3 | null];
}

export interface Ride {
  kind: SeatKind;
  /** Standing spot beside the door (vehicle-local, feet) and the facing to take there. */
  stand: THREE.Vector3;
  standYaw: number;
  /** stand -> seat. The last key is the seat. */
  board: Key[];
  /** Seated clip (Driving_Loop, Sitting_Idle_Loop, Idle_Rail_Loop, Riding_Loop). */
  seatClip: string;
  /** seat -> outside. The last key is the outside standing spot (its y is replaced by the ground). */
  exit: Key[];
  /** The door this ride uses (the vehicle animates it from occ.door). */
  door?: { kind: 'swing' | 'slide'; side: 1 | -1; front: boolean };
  /** Chase camera: pivot height above the vehicle origin, distance, pitch; seated eye height. */
  cam: { height: number; dist: number; pitch: number; eye: number };
  /** Boarding starts (Abel is at the door): take the fare, open up, spawn the physics car... */
  onBoard?: () => boolean | void;
  onSeated?: () => void;
  onExited?: () => void;
  onAbort?: () => void;
}

export const occ = {
  phase: 'walking' as Phase,
  ride: null as Ride | null,
  since: 0, // performance.now() when the phase began (key debouncing)
  /** Simulated ms in the current phase (frame dt, so a slow or hitching frame rate can't make the
   *  path skip ahead or a walk look 'stuck'). The player advances it. */
  elapsed: 0,
  /** Frames since the owner last wrote `frame` (stale = the vehicle is gone). */
  frameAge: 99,
  /** The vehicle's rendered world matrix this frame (written by its owner before the player runs). */
  frame: new THREE.Matrix4(),
  frameAt: 0, // performance.now() of the last write (stale frame = the vehicle is gone)
  /** Exit spot in world space (ground), resolved when the exit starts. */
  exitWorld: new THREE.Vector3(),
  /** Set while exiting: how far along the path (0..1), for the camera and doors. */
  progress: 0,
  /** Why the last approach was cancelled (diagnostics and tests). */
  lastAbort: '',
  /** How open the ride's door is right now (0..1), written by the player from the path. */
  door: 0,
};

/** Start walking to a vehicle. Returns false if already busy. */
export function beginApproach(ride: Ride): boolean {
  if (occ.phase !== 'walking') return false;
  occ.ride = ride;
  occ.phase = 'approaching';
  occ.since = performance.now();
  occ.elapsed = 0;
  return true;
}

/** Skip the walk (already standing at the door, e.g. after pulling a driver out). */
export function beginBoarding(ride: Ride): boolean {
  if (occ.phase !== 'walking' && occ.phase !== 'approaching') return false;
  occ.ride = ride;
  // the owner can refuse at the last moment (no money for the fare, the car was taken)
  if (ride.onBoard?.() === false) {
    abort('refused');
    return false;
  }
  occ.phase = 'boarding';
  occ.since = performance.now();
  occ.elapsed = 0;
  return true;
}

export function beginExit(world: THREE.Vector3): boolean {
  if (occ.phase !== 'seated' || !occ.ride) return false;
  occ.exitWorld.copy(world);
  occ.phase = 'exiting';
  occ.since = performance.now();
  occ.elapsed = 0;
  return true;
}

/** The owner writes the vehicle's world transform (as rendered) every frame. */
export function setFrame(m: THREE.Matrix4) {
  occ.frame.copy(m);
  occ.frameAt = performance.now();
  occ.frameAge = 0;
}

/** Cancel an approach (player moved away, door unreachable, vehicle left). */
export function abort(reason = '') {
  occ.lastAbort = reason;
  const r = occ.ride;
  occ.phase = 'walking';
  occ.ride = null;
  r?.onAbort?.();
}

export const seatedIn = (kind?: SeatKind) => occ.phase === 'seated' && (!kind || occ.ride?.kind === kind);
export const busy = () => occ.phase !== 'walking';

/** Total duration of a key path. */
export const pathMs = (keys: Key[]) => keys.reduce((a, k) => a + k.ms, 0);

const _a = new THREE.Vector3();

/**
 * Pose along a key path at elapsed ms: local position, yaw and clip. `from` is the pose before the
 * first key (the standing spot for boarding, the seat for exiting).
 */
export function samplePath(
  keys: Key[],
  from: { p: THREE.Vector3; yaw: number; door?: number },
  ms: number,
  out: THREE.Vector3,
): { yaw: number; clip: string; key: number; done: boolean; door: number; e: number } {
  let t = ms;
  let prevP = from.p;
  let prevYaw = from.yaw;
  let prevDoor = from.door ?? 0;
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i]!;
    const kd = k.door ?? prevDoor;
    if (t <= k.ms) {
      const f = k.ms > 0 ? t / k.ms : 1;
      const e = f * f * (3 - 2 * f); // ease in/out: weight shifts, no robotic sliding
      out.copy(prevP).lerp(_a.copy(k.p), e);
      let dy = k.yaw - prevYaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      return { yaw: prevYaw + dy * e, clip: k.clip, key: i, done: false, door: prevDoor + (kd - prevDoor) * e, e };
    }
    t -= k.ms;
    prevP = k.p;
    prevYaw = k.yaw;
    prevDoor = kd;
  }
  out.copy(prevP);
  return { yaw: prevYaw, clip: keys[keys.length - 1]?.clip ?? '', key: keys.length, done: true, door: prevDoor, e: 1 };
}

const _fa = new THREE.Vector3();
/**
 * The feet of a boarding / exiting path at (key, e): vehicle-local targets and a weight per foot
 * (0 = the animation's foot). `prevFeet` are the feet before the first key (usually none).
 */
export function sampleFeet(
  keys: Key[],
  key: number,
  e: number,
  out: [THREE.Vector3, THREE.Vector3],
  w: [number, number],
  prevFeet: Key['feet'] = undefined,
): boolean {
  if (key >= keys.length) key = keys.length - 1;
  const k = keys[key];
  const prev = key > 0 ? keys[key - 1]!.feet : prevFeet;
  const cur = k?.feet;
  let any = false;
  for (let i = 0; i < 2; i++) {
    const a = prev?.[i] ?? null;
    const b = cur === undefined ? a : (cur[i] ?? null);
    if (a && b) {
      // stepping from a to b: along the line, lifted in the middle (no lift if it stays put)
      out[i]!.copy(a).lerp(b, e);
      const d = _fa.subVectors(b, a).length();
      if (d > 0.05) out[i]!.y += Math.sin(Math.PI * e) * Math.min(0.32, 0.12 + d * 0.4);
      w[i] = 1;
    } else if (b) {
      out[i]!.copy(b);
      w[i] = e;
    } else if (a) {
      out[i]!.copy(a);
      w[i] = 1 - e;
    } else w[i] = 0;
    any ||= w[i]! > 0.001;
  }
  return any;
}
