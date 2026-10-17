import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { CapsuleCollider, RigidBody, useRapier, type RapierRigidBody } from '@react-three/rapier';
import type { Collider, KinematicCharacterController } from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { create } from 'zustand';
import { type Kit } from '../../world/kit/useKit';
import { KitInstances, type Placement } from '../../world/kit/KitInstances';
import { surfaceAt, surfaceKind } from '../../world/roadSurface';
import { tyreContact } from './tyreMarks';
import { register } from '../../game/interactables';
import { useEconomy } from '../../game/economy';
import { emit } from '../../game/events';
import { input, inputLock, onKeyPress, pad } from '../input';
import { ROUTES } from '../vehicles/routes';
import { ride, vehicleColliders } from '../vehicles/state';
import { beginApproach, beginExit, busy, occ, setFrame, type Key, type Ride } from '../vehicles/occupancy';
import { standSpot } from '../vehicles/exitCheck';
import { wheelLayout, wheelLocal } from '../vehicles/wheels';
import { audioContext } from '../audio/music';
import { bus } from '../audio/mixer';
import { EngineVoice } from '../audio/engine';
import { horn, impact } from '../audio/sfx';
import { radio } from '../audio/radio';
import { useHealth } from '../../game/health';
import { bike, drive } from './state';
import { SEA_Y, coastWeight } from '../../config/coast';

const _tp = new THREE.Vector3();
const _tn = new THREE.Vector3(0, 1, 0);

export { bike };

// Boda boda: a rideable motorbike (the real Sketchfab boda, its own two wheels split out by
// tools/split-wheels.mjs). Several wait at every matatu stage; F walks Abel to the left side,
// he grabs the bars, swings a leg over and kicks the stand up.
//
// Physics (kinematic, our own model; a bike is not a four-wheel raycast car):
//   - throttle / brake / slow reverse (walking it backwards), engine braking and drag
//   - bicycle steering: yaw rate = v * tan(steer) / wheelbase, with the steering range shrinking at
//     speed (twitchy at a walk would be wrong, so would a parking-speed lock at 60 km/h)
//   - lean = atan(v^2 * curvature / g): it leans into turns like a real bike and stays upright when
//     slow (no wobble), never so far a peg would dig in
//   - each wheel finds the ground under it (ray cast onto roads, kerbs, terrain); the bike pitches
//     between them on slopes and a spring smooths bumps
//   - a Rapier character controller moves its collider: walls, poles and vehicles stop it, and a
//     hard hit is a crash (sound, health)
// W/S throttle and brake, A/D steer, Space rear brake, H horn, F get off.

const WB = 1.335; // wheelbase from the model's wheels
const MAX_V = 24; // the drive curve tops out ~67 km/h once drag is counted (a loaded 150 cc boda)
const ACCEL = 3.4; // 0-50 km/h in ~5.5 s
const BRAKE = 7.5;
const SUSP_K = 260; // suspension spring (per kg): ~2.6 Hz, a firm commuter bike
const SUSP_DAMP = 2 * Math.sqrt(SUSP_K) * 0.55;
const SADDLE_FEET = 0.46; // with the sitting pose the hips land on the saddle top (0.91 m, measured on the model)
const SADDLE_Z = -0.18;
const KICKSTAND_LEAN = 0.13; // while getting on/off, the bike rests on its stand, leaning left

interface Boda extends Placement {
  id: number;
}

/** Bodas wait at every stage: two or three angled to the kerb. */
function planBodas(): Boda[] {
  const out: Boda[] = [];
  const seen = new Set<string>();
  for (const rt of ROUTES)
    for (const st of rt.stops) {
      const key = `${Math.round(st.x / 20)},${Math.round(st.z / 20)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      for (let i = 0; i < 2 + (st.x % 2 === 0 ? 1 : 0); i++) {
        const x = st.x - 9 - i * 1.3;
        const z = st.z + 7 + i * 0.4;
        out.push({ id: out.length, piece: 'rv_boda', x, z, rotY: 0.6 + i * 0.15, y: surfaceAt(x, z) });
      }
    }
  return out;
}

export const useBodas = create<{ bikes: Boda[]; take: (id: number) => Boda | undefined; park: (b: Omit<Boda, 'id'>) => void }>((set, get) => ({
  bikes: planBodas(),
  take: (id) => {
    const b = get().bikes.find((p) => p.id === id);
    if (b) set({ bikes: get().bikes.filter((p) => p.id !== id) });
    return b;
  },
  park: (b) => set({ bikes: [...get().bikes, { ...b, id: 5000 + Math.floor(Math.random() * 1e6) }] }),
}));


const _m = new THREE.Matrix4();
const _wm = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _p = new THREE.Vector3();
const _one = new THREE.Vector3(1, 1, 1);
const _v = new THREE.Vector3();

function bikeMatrix(out: THREE.Matrix4, x: number, y: number, z: number, heading: number, pitch: number, lean: number) {
  _e.set(pitch, heading, -lean, 'YXZ');
  _q.setFromEuler(_e);
  return out.compose(_p.set(x, y, z), _q, _one);
}

/** Mount from the left (+X, the kickstand side), or the right if the left is blocked. */
function bikeRide(side: 1 | -1, hooks: Partial<Ride>): Ride {
  const faceIn = side === 1 ? -Math.PI / 2 : Math.PI / 2;
  const stand = new THREE.Vector3(side * 0.72, 0, SADDLE_Z + 0.25);
  const seat = new THREE.Vector3(0, SADDLE_FEET, SADDLE_Z);
  const board: Key[] = [
    { p: stand, yaw: faceIn, clip: 'Interact', ms: 450 }, // hands on the bars
    { p: new THREE.Vector3(side * 0.32, 0.12, SADDLE_Z + 0.05), yaw: faceIn + side * 1.1, clip: 'Sitting_Enter', ms: 520 }, // leg over
    { p: seat, yaw: 0, clip: 'Riding_Loop', ms: 380, sound: 'kickstand' }, // onto the saddle, stand up
  ];
  const exit: Key[] = [
    { p: seat, yaw: 0, clip: 'Riding_Loop', ms: 260, sound: 'kickstand' }, // stand down
    { p: new THREE.Vector3(side * 0.32, 0.12, SADDLE_Z + 0.05), yaw: side * 0.9, clip: 'Sitting_Exit', ms: 520 }, // leg back over
    { p: new THREE.Vector3(side * 0.78, 0, SADDLE_Z + 0.2), yaw: side * (Math.PI / 2), clip: 'Idle_Loop', ms: 380 },
  ];
  return { kind: 'bike', stand, standYaw: faceIn, board, seatClip: 'Riding_Loop', exit, cam: { height: 1.55, dist: 4.8, pitch: 0.16, eye: 1.38 }, ...hooks };
}

export function Bodas({ kit }: { kit: Kit }) {
  const bikes = useBodas((s) => s.bikes);
  const riding = useRef<Boda | null>(null);
  const pending = useRef<{ b: Boda; frame: THREE.Matrix4 } | null>(null);
  const { world, rapier } = useRapier();
  const [, setTick] = useState(0);
  const forceRender = () => setTick((n) => n + 1);

  const request = (id: number) => {
    if (busy() || drive.active || ride.vehicle >= 0) return;
    const b = useBodas.getState().bikes.find((p) => p.id === id);
    if (!b) return;
    const frame = bikeMatrix(new THREE.Matrix4(), b.x, b.y ?? 0, b.z, b.rotY, 0, 0);
    const free = (side: number) => {
      _v.set(side * 0.72, 0, SADDLE_Z + 0.25).applyMatrix4(frame);
      return standSpot(world, rapier, _v.x, _v.z, b.y ?? 0, () => false, false).ok;
    };
    const side = free(1) ? 1 : free(-1) ? -1 : 0;
    if (!side) {
      useEconomy.getState().toast('No room to get on', 'info');
      return;
    }
    pending.current = { b, frame };
    beginApproach(
      bikeRide(side as 1 | -1, {
        onBoard: () => {
          const taken = useBodas.getState().take(id);
          if (!taken) return false;
          riding.current = taken;
          bike.active = true;
          bike.x = taken.x;
          bike.y = taken.y ?? 0;
          bike.z = taken.z;
          bike.heading = taken.rotY;
          bike.speed = 0;
          forceRender();
          return true;
        },
        onSeated: () => {
          emit({ type: 'drive', piece: 'rv_boda' });
          radio.enterVehicle();
          useEconomy.getState().toast('W/S ride · A/D steer · Space brake · H hoot · , . radio · F get off');
        },
        onAbort: () => {
          pending.current = null;
        },
      }),
    );
  };

  useEffect(() => {
    const offs = bikes.map((b) =>
      register({ id: `boda-${b.id}`, x: b.x, z: b.z, radius: 3.2, key: 'KeyF', label: 'Ride the boda boda', use: () => request(b.id) }),
    );
    return () => offs.forEach((f) => f());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bikes]);

  // the parked bike is the frame while Abel walks up
  useFrame(() => {
    const p = pending.current;
    if (p && occ.ride?.kind === 'bike' && (occ.phase === 'approaching' || (occ.phase === 'boarding' && !riding.current))) setFrame(p.frame);
  }, -45);

  return (
    <>
      <KitInstances kit={kit} placements={bikes} reach={0.4} />
      {riding.current && (
        <RiddenBoda
          key={riding.current.id}
          kit={kit}
          start={riding.current}
          onDone={() => {
            riding.current = null;
            pending.current = null;
            forceRender();
          }}
        />
      )}
    </>
  );
}

function RiddenBoda({ kit, start, onDone }: { kit: Kit; start: Boda; onDone: () => void }) {
  const { world, rapier } = useRapier();
  const body = useRef<RapierRigidBody>(null);
  const col = useRef<Collider>(null);
  const parts = useMemo(() => kit.get('rv_boda')?.lods[0] ?? [], [kit]);
  const bodyParts = useMemo(() => parts.filter((p) => !p.wheel), [parts]);
  const wheelParts = useMemo(() => parts.filter((p) => p.wheel), [parts]);
  const layout = useMemo(() => wheelLayout(parts), [parts]);
  const group = useRef<THREE.Group>(null);
  const wheelRefs = useRef<(THREE.Mesh | null)[]>([]);
  const st = useRef({
    x: start.x, y: start.y ?? surfaceAt(start.x, start.z), z: start.z, heading: start.rotY,
    v: 0, steer: 0, lean: 0, pitch: 0, vy: 0, spinF: 0, spinR: 0, hitCool: 0, throttle: 0,
    air: false, susp: 0, suspV: 0, dive: 0, accel: 0,
  });
  const engine = useRef<EngineVoice | null>(null);

  // created in the effect that removes it (React dev mounts effects twice: a controller made in
  // useMemo was freed by the first cleanup and the game crashed on a black screen)
  const ctrlRef = useRef<KinematicCharacterController | null>(null);
  useEffect(() => {
    const c = world.createCharacterController(0.03);
    c.setUp({ x: 0, y: 1, z: 0 });
    c.setMaxSlopeClimbAngle((35 * Math.PI) / 180);
    c.enableAutostep(0.18, 0.2, false); // kerbs: a boda bumps up a low kerb
    c.setApplyImpulsesToDynamicBodies(true);
    ctrlRef.current = c;
    return () => {
      ctrlRef.current = null;
      world.removeCharacterController(c);
    };
  }, [world]);
  useEffect(() => () => {
    engine.current?.dispose(0.6);
    engine.current = null;
    bike.active = false;
  }, []);

  useEffect(() => onKeyPress('KeyH', () => bike.active && occ.phase === 'seated' && occ.ride?.kind === 'bike' && horn('bike', { x: bike.x, y: bike.y + 1, z: bike.z }, 300)), []);

  // F: get off (left side; right if the left is blocked)
  useEffect(
    () =>
      onKeyPress('KeyF', () => {
        if (occ.phase !== 'seated' || occ.ride?.kind !== 'bike' || performance.now() - occ.since < 400) return;
        const s = st.current;
        if (Math.abs(s.v) > 3) {
          useEconomy.getState().toast('Stop the boda first');
          return;
        }
        const own = new Set<number>();
        if (col.current) own.add(col.current.handle);
        const tryside = (side: number) => {
          _v.set(side * 0.78, 0, SADDLE_Z + 0.2).applyMatrix4(occ.frame);
          return { r: standSpot(world, rapier, _v.x, _v.z, s.y, (h) => own.has(h)), x: _v.x, z: _v.z };
        };
        const l = tryside(1);
        const pick = l.r.ok ? { ...l, side: 1 as const } : { ...tryside(-1), side: -1 as const };
        if (!pick.r.ok) {
          useEconomy.getState().toast(pick.r.why === 'traffic' ? 'Traffic! Wait for it to pass' : 'No room to get off here', 'info');
          return;
        }
        const r = bikeRide(pick.side, {
          onExited: () => {
            useBodas.getState().park({ piece: 'rv_boda', x: s.x, z: s.z, y: s.y, rotY: s.heading });
            bike.active = false;
            onDone();
          },
        });
        occ.ride = r;
        radio.exitVehicle();
        engine.current?.dispose(1.0);
        engine.current = null;
        beginExit(new THREE.Vector3(pick.x, pick.r.ground, pick.z));
      }),
    [world, rapier, onDone],
  );

  // The surface under one tyre. The ray starts a kerb's height above the current contact, so a
  // tyre climbs kerbs and bumps but never "lands" on top of a bench, a parked bike or a matatu
  // (those are obstacles: the collider stops the bike instead).
  const STEP = 0.3;
  const ray = useMemo(() => new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 }), [rapier]);
  const ground = (x: number, z: number, refY: number) => {
    let g = -Infinity;
    ray.origin.x = x;
    ray.origin.y = refY + STEP;
    ray.origin.z = z;
    const hit = world.castRay(ray, STEP + 1.5, true, rapier.QueryFilterFlags.EXCLUDE_SENSORS | rapier.QueryFilterFlags.EXCLUDE_DYNAMIC, undefined,
      col.current ?? undefined, body.current ?? undefined, (c) => !vehicleColliders.has(c.handle) && c.collisionGroups() !== 0);
    // the solid surface itself (road collider or carved ground); the height field only if nothing is in reach
    g = hit ? refY + STEP - hit.timeOfImpact : surfaceAt(x, z);
    return Math.min(g, refY + STEP);
  };

  useFrame((_, rawDt) => {
    const ctrl = ctrlRef.current;
    if (!ctrl) return; // not created yet (first frame)
    // real elapsed time (capped like the physics world), integrated in 60 Hz substeps: the bike keeps
    // pace with the Rapier cars and traffic whatever the frame rate, and stays stable on a hitch
    const total = Math.min(rawDt, 0.25);
    const n = Math.max(1, Math.ceil(total * 60));
    const dt = total / n;
    const s = st.current;
    const b = body.current;
    const c = col.current;
    const g = group.current;
    if (!b || !c || !g) return;
    if (bike.place) {
      // ?debug: put the ridden bike somewhere (tests ride it on an open road)
      Object.assign(s, { x: bike.place.x, z: bike.place.z, heading: bike.place.heading, y: surfaceAt(bike.place.x, bike.place.z), v: 0, air: false, susp: 0, suspV: 0 });
      bike.place = null;
    }
    const live = occ.phase === 'seated' && occ.ride?.kind === 'bike';
    const controls = live && !inputLock.ui; // a menu or the map has the keys: the bike coasts
    const thr = controls ? THREE.MathUtils.clamp(input.moveY + input.touchMoveY + pad.y, -1, 1) : 0;
    const steerIn = controls ? THREE.MathUtils.clamp(input.moveX + input.touchMoveX + pad.x, -1, 1) : 0;
    s.throttle = Math.max(0, thr);
    let dx = 0;
    let dz = 0;
    let yawRate = 0;
    const v0 = s.v;
    for (let k = 0; k < n; k++) {
      // --- longitudinal: rolling resistance + air drag always; engine braking only off the throttle ---
      const sv = Math.abs(s.v) > 0.05 ? Math.sign(s.v) : 0;
      let a = -sv * Math.min(0.3, Math.abs(s.v) / dt) - 0.003 * s.v * Math.abs(s.v);
      if (thr > 0.05) a += s.v < -0.2 ? BRAKE : ACCEL * thr * Math.max(0, 1 - (Math.max(0, s.v) / MAX_V) ** 2);
      else if (thr < -0.05) a += s.v > 0.3 ? -BRAKE * -thr : -1.2 * -thr * (s.v > -1.5 ? 1 : 0); // brake, then walk it back
      else a -= sv * Math.min(0.8 + 0.03 * Math.abs(s.v), Math.abs(s.v) / dt); // engine braking
      if (controls && input.jump) a -= Math.sign(s.v) * Math.min(Math.abs(s.v) / dt, BRAKE * 0.8);
      if (!live) a = -Math.sign(s.v) * Math.min(Math.abs(s.v) / dt, BRAKE);
      // into the sea: the water drags the bike to a stop and the engine drowns past the axles
      const wade = coastWeight(s.x, s.z) > 0.5 ? SEA_Y - s.y : 0;
      if (wade > 0.1) a = (wade > 0.35 ? 0 : a * 0.4) - s.v * (1 + wade * 6);
      s.v += a * dt;
      if (Math.abs(s.v) < 0.03 && Math.abs(thr) < 0.05) s.v = 0;
      // --- steering: range shrinks with speed; bicycle model yaw ---
      const range = 0.62 / (1 + Math.abs(s.v) / 3.2);
      s.steer = THREE.MathUtils.damp(s.steer, -steerIn * range, 7, dt);
      bike.steer = s.steer;
      yawRate = (s.v * Math.tan(s.steer)) / WB;
      s.heading += yawRate * dt;
      dx += Math.sin(s.heading) * s.v * dt;
      dz += Math.cos(s.heading) * s.v * dt;
    }
    // lean into the turn (centripetal), upright when slow
    const want = live || occ.phase === 'exiting' || occ.phase === 'boarding'
      ? THREE.MathUtils.clamp(Math.atan2(s.v * yawRate, 9.81), -0.65, 0.65) * (Math.abs(s.v) > 1 ? 1 : Math.abs(s.v))
      : KICKSTAND_LEAN;
    s.lean = THREE.MathUtils.damp(s.lean, live && Math.abs(s.v) < 0.2 ? 0.02 : want, 5, total);
    const fx = Math.sin(s.heading);
    const fz = Math.cos(s.heading);
    // --- horizontal move with collisions (one swept move for the frame); the height comes from the
    // ground under the wheels below, so the controller never fights it ---
    // (colliders with collision groups 0 interact with nothing: that is Abel's own capsule while he
    // rides; the controller ignores groups unless told, and kept "crashing" into its rider)
    ctrl.computeColliderMovement(c, { x: dx, y: 0, z: dz }, rapier.QueryFilterFlags.EXCLUDE_SENSORS, 0xffffffff,
      (other) => other.handle !== c.handle && other.collisionGroups() !== 0);
    const mv = ctrl.computedMovement();
    const want2 = Math.hypot(dx, dz);
    const got = Math.hypot(mv.x, mv.z);
    // blocked: a wall / pole / vehicle took the speed away -> an impact
    s.hitCool -= total;
    if (want2 > 1e-4 && got < want2 * 0.6 && Math.abs(s.v) > 1.5) {
      const hit = Math.abs(s.v) * (1 - got / want2);
      // diagnostics: what stopped us (tools/bike-probe.mjs)
      for (let i = 0; i < ctrl.numComputedCollisions() && bike.hits.length < 20; i++) {
        const cc = ctrl.computedCollision(i)?.collider;
        if (!cc) continue;
        const t = cc.translation();
        const rb = cc.parent();
        bike.hits.push({ at: [+s.x.toFixed(1), +s.z.toFixed(1)], col: [+t.x.toFixed(1), +t.y.toFixed(1), +t.z.toFixed(1)], shape: cc.shape.type, body: rb ? (rb.isFixed() ? 'fixed' : rb.isKinematic() ? 'kinematic' : 'dynamic') : 'none', vehicle: vehicleColliders.has(cc.handle), v: +s.v.toFixed(1), groups: cc.collisionGroups() });
      }
      if (s.hitCool <= 0) {
        impact(hit * 1.3, { x: s.x, y: s.y + 0.6, z: s.z });
        if (hit > 7) {
          useHealth.getState().damage((hit - 7) * 4, 'You came off the boda');
          useEconomy.getState().toast('Pole sana! Ride carefully', 'info');
        }
        s.hitCool = 0.4;
      }
      s.v *= got / want2;
    }
    s.x += mv.x;
    s.z += mv.z;
    // --- ground contact: each tyre sits ON the surface under it (road, kerb, terrain) ---
    const gf = ground(s.x + fx * (WB / 2), s.z + fz * (WB / 2), s.y);
    const gr = ground(s.x - fx * (WB / 2), s.z - fz * (WB / 2), s.y);
    const gy = (gf + gr) / 2;
    if (!s.air && gy < s.y - 0.3 && Math.abs(s.v) > 3) {
      s.air = true; // rode off a ledge: fly, keeping the slope's vertical speed
      s.vy = 0;
    }
    if (s.air) {
      s.vy -= 9.81 * total;
      s.y += s.vy * total;
      if (s.y <= gy) {
        s.suspV += s.vy * 0.5; // landing: the forks and shock take it
        s.y = gy;
        s.vy = 0;
        s.air = false;
        if (Math.abs(s.suspV) > 1.2) impact(Math.abs(s.suspV) * 2, { x: s.x, y: s.y, z: s.z });
      }
    } else {
      // up a kerb or a bump: the wheels follow the ground at once, the body is carried up by the
      // suspension a moment later (that lag is what makes it read as a sprung vehicle)
      const dg = gy - s.y;
      if (Math.abs(dg) > 0.005) s.susp = THREE.MathUtils.clamp(s.susp - dg * 0.7, -0.12, 0.08);
      s.y = gy;
    }
    for (let i = 0; i < n; i++) {
      s.suspV += (-SUSP_K * s.susp - SUSP_DAMP * s.suspV) * dt;
      s.susp = THREE.MathUtils.clamp(s.susp + s.suspV * dt, -0.12, 0.08);
    }
    // pitch: exactly the line between the two tyre contacts, plus the forks diving under braking
    // and squatting a little under throttle
    s.accel = THREE.MathUtils.damp(s.accel, (s.v - v0) / Math.max(total, 1e-3), 8, total);
    s.dive = THREE.MathUtils.damp(s.dive, THREE.MathUtils.clamp(-s.accel * 0.007, -0.025, 0.05), 6, total);
    s.pitch = s.air ? THREE.MathUtils.damp(s.pitch, 0, 1.5, total) : -Math.atan2(gf - gr, WB) + s.dive;
    b.setNextKinematicTranslation({ x: s.x, y: s.y + 0.65, z: s.z });
    _q.setFromAxisAngle(_v.set(0, 1, 0), s.heading);
    b.setNextKinematicRotation(_q);
    // tyre tracks on murram / dirt / sand, a skid line and smoke when the rear locks under hard braking
    if (!s.air) {
      const sp = Math.abs(s.v);
      const skid = THREE.MathUtils.clamp((-s.accel * Math.sign(s.v || 1) - 5.5) / 4, 0, 1);
      const fxw = s.x + fx * (WB / 2), fzw = s.z + fz * (WB / 2), rxw = s.x - fx * (WB / 2), rzw = s.z - fz * (WB / 2);
      tyreContact('boda-f', true, _tp.set(fxw, gf, fzw), _tn, fx, fz, 0.11, skid * 0.3, sp, surfaceKind(fxw, fzw), total);
      tyreContact('boda-r', true, _tp.set(rxw, gr, rzw), _tn, fx, fz, 0.13, skid, sp, surfaceKind(rxw, rzw), total);
    }
    bike.x = s.x;
    bike.y = s.y;
    bike.z = s.z;
    bike.heading = s.heading;
    bike.speed = s.v;
    bike.groundF = gf;
    bike.groundR = gr;
    bike.pitch = s.pitch;
    bike.lean = s.lean;
    bike.susp = s.susp;
    bike.frame++;
    bike.t = performance.now();
    // --- render: the bike pitched between its wheels and leaning, wheels rolling ---
    bikeMatrix(_m, s.x, s.y + s.susp, s.z, s.heading, s.pitch, s.lean);
    g.matrix.copy(_m);
    g.matrixWorldNeedsUpdate = true;
    if (occ.ride?.kind === 'bike' && occ.phase !== 'walking' && occ.phase !== 'approaching') setFrame(_m);
    // both wheels roll the same distance; the front one turns with the bars
    // (at a low frame rate a wheel can turn nearly a whole spoke gap between frames and the spokes
    // look frozen or turning backwards; cap the drawn turn per frame so it always reads as rolling)
    const roll = (r: number) => THREE.MathUtils.clamp((got / r) * Math.sign(s.v || 1), -0.42, 0.42);
    s.spinF += roll(layout.find((w) => w.front)?.radius ?? 0.333);
    s.spinR += roll(layout.find((w) => !w.front)?.radius ?? 0.333);
    bike.spin = s.spinR;
    bike.wheels = wheelParts.length;
    for (let i = 0; i < wheelParts.length; i++) {
      const part = wheelParts[i]!;
      const mesh = wheelRefs.current[i];
      if (!mesh) continue;
      const front = part.wheel!.front;
      // the tyres stay on the ground while the body moves on its springs
      wheelLocal(_wm, part, front ? s.spinF : s.spinR, front ? s.steer : 0, -s.susp);
      mesh.matrix.copy(_wm);
    }
    // --- engine ---
    const ac = audioContext();
    if (ac && ac.state === 'running') {
      if (!engine.current && live) {
        const out = bus('engines');
        if (out) engine.current = new EngineVoice(ac, 'bike', out);
      }
      engine.current?.update(s.v, s.throttle, true, 0.85);
    }
  }, -40);

  return (
    <>
      <RigidBody ref={body} type="kinematicPosition" colliders={false} position={[start.x, (start.y ?? 0) + 0.65, start.z]} rotation={[0, start.rotY, 0]}>
        {/* the bike lying along its length: a capsule from wheel to wheel at axle height */}
        <CapsuleCollider ref={col} args={[0.62, 0.32]} rotation={[Math.PI / 2, 0, 0]} />
      </RigidBody>
      <group ref={group} matrixAutoUpdate={false}>
        {bodyParts.map((p, i) => (
          <mesh key={i} geometry={p.geometry} material={p.material} matrix={p.local} matrixAutoUpdate={false} castShadow receiveShadow />
        ))}
        {wheelParts.map((p, i) => (
          <mesh
            key={`w${i}`}
            ref={(m) => {
              wheelRefs.current[i] = m;
            }}
            geometry={p.geometry}
            material={p.material}
            matrix={p.local}
            matrixAutoUpdate={false}
            castShadow
          />
        ))}
      </group>
    </>
  );
}
