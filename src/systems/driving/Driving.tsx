import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { CuboidCollider, RigidBody, useBeforePhysicsStep, useRapier, type RapierRigidBody } from '@react-three/rapier';
import type { DynamicRayCastVehicleController } from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { type Kit, type KitDoor, type KitPart } from '../../world/kit/useKit';
import { KitInstances } from '../../world/kit/KitInstances';
import { register } from '../../game/interactables';
import { useEconomy } from '../../game/economy';
import { emit } from '../../game/events';
import { input, inputLock, onKeyPress } from '../input';
import { ride } from '../vehicles/state';
import { useVehicleKit } from '../vehicles/vehicleKit';
import { doorLocal, wheelLayout, wheelLocal } from '../vehicles/wheels';
import { beginApproach, beginExit, busy, occ, setFrame, type Key, type Ride } from '../vehicles/occupancy';
import { standSpot } from '../vehicles/exitCheck';
import { audioContext } from '../audio/music';
import { bus } from '../audio/mixer';
import { EngineVoice } from '../audio/engine';
import { horn, impact } from '../audio/sfx';
import { radio } from '../audio/radio';
import { FOOT_Y, CAR_DIMS, SURFACE_GRIP, carKind, drive, enterRequest, handlingOf, useParking, useService } from './state';
import { FUEL_PRICE, TANK, nearestStation, serviceAt } from '../../game/stations';
import { useNav } from '../../game/navigation';
import { playSfx } from '../audio/sfx';
import { surfaceKind, type Surface } from '../../world/roadSurface';
import { tyreContact } from './tyreMarks';
import { TyreVoice } from '../audio/tyres';
import { Bodas } from './Bike';
import { wetGrip } from '../../world/weather';
import { SEA_Y, coastWeight } from '../../config/coast';

const click = () => playSfx('click');

// GTA-style driving: parked cars on the road shoulders (instanced, solid). F near a car: Abel walks
// to the driver's door (the passenger door if the driver's side is against a wall), opens it, gets
// in and closes it; only then do the controls go live. The driven car is a Rapier raycast vehicle
// whose four wheels are the model's own wheels (tools/split-wheels.mjs): same centres and radii as
// the mesh, so the tyres sit on the road, spin with the road speed, steer, and ride the suspension.
// W/S throttle and brake/reverse, A/D steer, Space handbrake, H horn, F get out.

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _up = new THREE.Vector3();
const _wm = new THREE.Matrix4();
const _box = new THREE.Box3();
const _imp = new THREE.Vector3();
const _qi = new THREE.Quaternion();
const _mi = new THREE.Matrix4();
const _d = new THREE.Vector3();
const _bb = new THREE.Box3();
const _p = new THREE.Vector3();
const _r = new THREE.Vector3();
const _w = new THREE.Vector3();
const _f = new THREE.Vector3();
const _n = new THREE.Vector3();
const _yAxis = new THREE.Vector3(0, 1, 0);

type Car = { piece: string; x: number; y: number; z: number; rotY: number; health?: number; fuel?: number };

/** Body extents of a kit piece from its LOD0 mesh (wheels excluded): the real model, not a guess. */
export function bodyBox(parts: KitPart[]): THREE.Box3 {
  _box.makeEmpty();
  for (const p of parts) {
    if (p.wheel) continue;
    const g = p.geometry;
    if (!g.boundingBox) g.computeBoundingBox();
    _bb.copy(g.boundingBox!).applyMatrix4(p.local);
    _box.union(_bb);
  }
  return _box.clone();
}

/** World matrix of a parked placement (ground at the origin). */
function placementMatrix(out: THREE.Matrix4, c: Car) {
  _q.setFromAxisAngle(_v.set(0, 1, 0), c.rotY);
  return out.compose(_v.set(c.x, c.y, c.z), _q, new THREE.Vector3(1, 1, 1));
}

/**
 * The boarding and exit paths for a car (vehicle-local). Kenya is right-hand drive: the driver's
 * door is on the right (local -X). `side` is the door used; from the passenger door Abel slides
 * across the seats to the wheel, the way you do when someone has parked against your door.
 */
function carRide(piece: string, half: number, side: 'driver' | 'passenger', hooks: Partial<Ride>, door?: KitDoor, open = 1): Ride {
  const d = CAR_DIMS[carKind(piece)]!;
  const [sx, sy, sz] = d.seat;
  const sgn = side === 'driver' ? -1 : 1; // which side of the car the door is on
  const outX = sgn * (half + (door ? 0.45 : 0.5));
  // with a real door: stand just behind its rear edge (by the handle), clear of its swing
  const standZ = door ? door.hinge.z - door.size.z - 0.12 : sz + 0.25;
  const doorYaw = -sgn * (Math.PI / 2); // facing the car from that side
  const seat = new THREE.Vector3(sx, sy, sz);
  // Getting in like a person does (driver's side shown; the passenger side is its mirror):
  //   1. at the door, hand on the handle, swing it open
  //   2. turn to face forward beside the sill and put the NEAR leg into the footwell
  //   3. lower the hips onto the seat, the far foot still on the road
  //   4. swing the far leg in, settle, hands to the wheel, pull the door shut
  // Feet are IK targets (vehicle-local): just over the sill, then the footwell; the road beside the sill.
  const cx = side === 'passenger' ? -sx : sx; // the seat this side's door opens onto
  const inner = sgn < 0 ? 0 : 1; // the foot nearer the car: left foot on the right-hand side
  const both = (a: THREE.Vector3, b: THREE.Vector3) => (inner === 0 ? [a, b] : [b, a]) as [THREE.Vector3, THREE.Vector3];
  const well = (dx: number) => new THREE.Vector3(cx + dx, sy + 0.18, sz + 0.5); // the footwell, by the pedals
  const road = new THREE.Vector3(sgn * (half + 0.06), 0, sz + 0.22); // the far foot, on the road just below the sill
  const besideSill = new THREE.Vector3(sgn * (half + 0.04), 0, sz + 0.02); // shoulder at the door opening
  const overSill = new THREE.Vector3(sgn * (half - 0.22), sy + 0.3, sz + 0.32); // first foot just over the sill
  const perch = new THREE.Vector3(cx + sgn * 0.16, sy, sz - 0.02); // hips on the outer edge of the seat
  const inSeat = new THREE.Vector3(cx, sy, sz);
  const board: Key[] = [
    // 1. reach for the handle and swing the door open
    { p: new THREE.Vector3(outX, 0, standZ), yaw: doorYaw, clip: 'Interact', ms: 560, sound: 'doorOpen', door: open },
    // 2. face forward beside the sill; the near leg steps over it into the footwell
    { p: besideSill, yaw: 0, clip: 'Idle_Loop', ms: 620, feet: both(overSill, road) },
    // 3. sit: the hips lower onto the edge of the seat, the far foot still outside
    { p: perch, yaw: sgn * 0.55, clip: 'Sitting_Idle_Loop', ms: 700, feet: both(well(-sgn * 0.08), road) },
    // 4. swing the far leg in and turn to face the wheel
    { p: inSeat, yaw: 0, clip: 'Sitting_Idle_Loop', ms: 560, feet: both(well(-sgn * 0.08), well(sgn * 0.12)) },
  ];
  if (side === 'passenger') board.push({ p: seat, yaw: 0, clip: 'Sitting_Idle_Loop', ms: 650, feet: [null, null] }); // slide across
  board.push(
    { p: seat, yaw: 0, clip: 'Sitting_Idle_Loop', ms: 300, feet: [null, null] }, // settle, hands to the wheel
    { p: seat, yaw: 0, clip: 'Driving_Loop', ms: 320, sound: 'doorClose', door: 0 },
  );
  const exit: Key[] = [
    { p: seat, yaw: 0, clip: 'Driving_Loop', ms: 260, sound: 'doorOpen', door: open },
  ];
  if (side === 'passenger') exit.push({ p: inSeat, yaw: 0, clip: 'Sitting_Idle_Loop', ms: 600 });
  exit.push(
    // turn towards the door and put the outside leg out onto the road
    { p: perch, yaw: sgn * 0.55, clip: 'Sitting_Idle_Loop', ms: 560, feet: both(well(-sgn * 0.08), road) },
    // stand up out of the seat, hand on the door frame
    { p: besideSill, yaw: 0, clip: 'Idle_Loop', ms: 700, feet: both(overSill, road) },
    // the other leg comes out and Abel steps clear of the door
    { p: new THREE.Vector3(outX, 0, standZ), yaw: -doorYaw, clip: 'Walk_Loop', ms: 480, feet: [null, null] },
    { p: new THREE.Vector3(outX, 0, standZ), yaw: -doorYaw + sgn * 0.6, clip: 'Interact', ms: 380, sound: 'doorClose', door: 0 },
  );
  return {
    kind: 'car',
    stand: board[0]!.p.clone(),
    standYaw: doorYaw,
    halfLength: d.L / 2,
    board,
    seatClip: 'Driving_Loop',
    exit,
    door: { kind: 'swing', side: sgn as 1 | -1, front: true },
    cam: { height: 1.9, dist: 6.8, pitch: 0.18, eye: 1.12 },
    ...hooks,
  };
}

/**
 * How far a door can open before it hits something (0..1): the door's rear edge is tested where it
 * would be at 100%, 60% and 35% open. Below ~a third the door is unusable. Without a real door, the
 * standing spot alone decides (1 or 0).
 */
function doorClearance(
  world: ReturnType<typeof useRapier>['world'],
  rapier: ReturnType<typeof useRapier>['rapier'],
  frame: THREE.Matrix4,
  half: number,
  sgn: number,
  door: KitDoor | undefined,
  standZ: number,
  refY: number,
  ignore: (h: number) => boolean,
): number {
  const at = (lx: number, lz: number) => {
    _v.set(lx, 0, lz).applyMatrix4(frame);
    return standSpot(world, rapier, _v.x, _v.z, refY, ignore, false).ok;
  };
  if (!at(sgn * (half + 0.45), standZ)) return 0;
  if (!door) return 1;
  const L = door.size.z;
  for (const open of [1, 0.6, 0.35]) {
    const a = 1.18 * open; // the swing angle doorLocal uses
    const ex = door.hinge.x + sgn * Math.sin(a) * L;
    const ez = door.hinge.z - Math.cos(a) * L;
    if (at(ex + sgn * 0.15, ez)) return open;
  }
  return 0;
}

/** The model's front door on a side (+1 left / -1 right), if it has real doors. */
function frontDoor(parts: KitPart[], sgn: number): KitDoor | undefined {
  return parts.find((p) => p.door && p.door.front && p.door.side === sgn && p.door.kind === 'swing')?.door;
}

export function Driving() {
  const kit = useVehicleKit();
  const cars = useParking((s) => s.cars);
  const { world, rapier } = useRapier();
  const [driving, setDriving] = useState<Car | null>(null);
  const pending = useRef<{ car: Car; id: number; frame: THREE.Matrix4 } | null>(null);
  const live = useRef(false); // DrivenCar is writing the frame

  const request = (id: number) => {
    if (busy() || drive.active || ride.vehicle >= 0) return;
    const c = useParking.getState().cars.find((p) => p.id === id);
    if (!c) return;
    const car: Car = { piece: c.piece, x: c.x, y: c.y ?? 0, z: c.z, rotY: c.rotY, health: c.health };
    const bb = bodyBox(kit.get(c.piece)?.lods[0] ?? []);
    const half = Math.max(0.7, -bb.min.x, bb.max.x);
    const frame = placementMatrix(new THREE.Matrix4(), car);
    // which door? the driver's if there is room to stand and swing it open, else the passenger's
    const d = CAR_DIMS[carKind(c.piece)]!;
    const parts = kit.get(c.piece)?.lods[0] ?? [];
    // the floor of the footwell: just above the body's underside, never above the seat
    FOOT_Y.set(c.piece, THREE.MathUtils.clamp(bb.min.y + 0.16, d.seat[1] + 0.18, d.seat[1] + 0.36));
    const clear = (sgn: number) => {
      const door = frontDoor(parts, sgn);
      const standZ = door ? door.hinge.z - door.size.z - 0.12 : d.seat[2] + 0.25;
      return { door, open: doorClearance(world, rapier, frame, half, sgn, door, standZ, car.y, () => false) };
    };
    const right = clear(-1);
    const left = right.open > 0 ? right : clear(1);
    const side = right.open > 0 ? 'driver' : left.open > 0 ? 'passenger' : null;
    if (!side) {
      useEconomy.getState().toast('No room to open a door', 'info');
      return;
    }
    if (left.open < 1) useEconomy.getState().toast('Tight squeeze: the door only opens part way', 'info');
    pending.current = { car, id, frame };
    live.current = false;
    beginApproach(
      carRide(c.piece, half, side, {
        onBoard: () => {
          // the car becomes a physics car the moment the door opens
          const taken = useParking.getState().take(id);
          if (!taken) return false;
          drive.active = true;
          drive.piece = taken.piece;
          drive.enteredAt = performance.now();
          drive.x = car.x;
          drive.y = car.y;
          drive.z = car.z;
          drive.heading = car.rotY;
          drive.speed = 0;
          drive.health = car.health ?? 1000;
          // a parked car has what its owner left in it (a quarter to a full tank)
          drive.fuel = car.fuel ?? TANK * (0.25 + (((Math.abs(car.x * 7.3 + car.z * 3.1) % 1) + 1) % 1) * 0.75);
          setDriving(car);
          return true;
        },
        onSeated: () => {
          emit({ type: 'drive', piece: car.piece });
          radio.enterVehicle();
          useEconomy.getState().toast('W/S drive · A/D steer · Space handbrake · H horn · , . radio · F get out');
        },
        onAbort: () => {
          pending.current = null;
        },
      }, left.door, left.open),
    );
  };

  // F near any parked car (GTA: from a few metres away, Abel walks to the door himself)
  useEffect(() => {
    const offs = cars.map((c) =>
      register({ id: `car-${c.id}`, x: c.x, z: c.z, radius: 4.2, key: 'KeyF', label: 'Get in and drive', use: () => request(c.id) }),
    );
    return () => offs.forEach((f) => f());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cars]);

  // carjacking: the traffic system parked the car where it stopped; Abel is already at the door
  useFrame(() => {
    if (enterRequest.id < 0) return;
    const id = enterRequest.id;
    enterRequest.id = -1;
    request(id);
  });

  // until the physics car exists, the parked placement is the vehicle frame
  useFrame(() => {
    const p = pending.current;
    if (!p || occ.ride?.kind !== 'car') return;
    if (occ.phase === 'approaching' || (occ.phase === 'boarding' && !live.current)) setFrame(p.frame);
  }, -45);

  return (
    <>
      <KitInstances kit={kit} placements={cars} reach={0.5} />
      <Bodas kit={kit} />
      {driving && (
        <DrivenCar
          key={`${driving.x},${driving.z}`}
          car={driving}
          kit={kit}
          onLive={() => (live.current = true)}
          onExit={() => {
            pending.current = null;
            live.current = false;
            setDriving(null);
          }}
        />
      )}
    </>
  );
}

function DrivenCar({ car, kit, onExit, onLive }: { car: Car; kit: Kit; onExit: () => void; onLive: () => void }) {
  const { world, rapier } = useRapier();
  const body = useRef<RapierRigidBody>(null);
  const frameRef = useRef<THREE.Group>(null);
  const ctrl = useRef<DynamicRayCastVehicleController | null>(null);
  const d = CAR_DIMS[carKind(car.piece)]!;
  const h = handlingOf(car.piece);
  const parts = useMemo(() => kit.get(car.piece)?.lods[0] ?? [], [kit, car.piece]);
  const bodyParts = useMemo(() => parts.filter((p) => !p.wheel && !p.door), [parts]);
  const doorParts = useMemo(() => parts.filter((p) => p.door), [parts]);
  const doorRefs = useRef<(THREE.Mesh | null)[]>([]);
  const wheelParts = useMemo(() => parts.filter((p) => p.wheel), [parts]);
  const wheelRefs = useRef<(THREE.Mesh | null)[]>([]);
  const box = useMemo(() => bodyBox(parts), [parts]);
  // the physics wheels ARE the model's wheels (fallback: the measured dimensions)
  const layout = useMemo(() => {
    const ws = wheelLayout(parts);
    if (ws.length >= 4) return ws.map((w) => ({ x: w.center.x, y: w.center.y, z: w.center.z, r: w.radius, front: w.front }));
    return ([[d.track, d.wb / 2, true], [-d.track, d.wb / 2, true], [d.track, -d.wb / 2, false], [-d.track, -d.wb / 2, false]] as const).map(
      ([x, z, front]) => ({ x, y: d.r, z, r: d.r, front }),
    );
  }, [parts, d]);
  const st = useRef({ steer: 0, upsideDown: 0, lastV: new THREE.Vector3(), prevV: new THREE.Vector3(), hitCool: 0, throttle: 0, handbrake: 0, tyreSqueal: 0, tyreGravel: 0, wade: 0 });
  // per wheel: the surface under it (for grip), last spin angle and slip (for marks, smoke, squeal)
  const tyre = useRef(layout.map(() => ({ surface: 'tarmac' as Surface, rot: 0, slip: 0 })));
  const tyreVoice = useRef<TyreVoice | null>(null);
  // this car's own copies of its body meshes, made on the first dent (the kit stays shared)
  const dented = useRef<Map<number, THREE.BufferGeometry>>(new Map());
  const bodyRefs = useRef<(THREE.Mesh | null)[]>([]);
  /** Push the body in around the point it was hit (car-local direction towards the obstacle). */
  const dent = (dir: THREE.Vector3, depth: number) => {
    if (depth <= 0.005 || dir.lengthSq() < 1e-6) return;
    dir.y = 0;
    dir.normalize();
    // where the impact lands: the body's surface in that direction, at bumper height
    const hit = new THREE.Vector3(dir.x > 0 ? box.max.x : box.min.x, 0.62, dir.z > 0 ? box.max.z : box.min.z);
    if (Math.abs(dir.x) < 0.5) hit.x = 0;
    if (Math.abs(dir.z) < 0.5) hit.z = 0;
    const R = 0.75;
    bodyParts.forEach((p, i) => {
      const mesh = bodyRefs.current[i];
      if (!mesh) return;
      let g = dented.current.get(i);
      if (!g) {
        // float copy of the (quantised) positions, in the mesh's own space
        g = p.geometry.clone();
        const src = p.geometry.getAttribute('position');
        const f = new Float32Array(src.count * 3);
        for (let k = 0; k < src.count; k++) f.set([src.getX(k), src.getY(k), src.getZ(k)], k * 3);
        g.setAttribute('position', new THREE.BufferAttribute(f, 3));
        dented.current.set(i, g);
        mesh.geometry = g;
      }
      const inv = _mi.copy(p.local).invert();
      const pos = g.getAttribute('position') as THREE.BufferAttribute;
      let changed = false;
      for (let k = 0; k < pos.count; k++) {
        _d.fromBufferAttribute(pos, k).applyMatrix4(p.local); // car-local
        const dist = _d.distanceTo(hit);
        if (dist > R) continue;
        const f = (1 - dist / R) ** 2 * depth;
        _d.addScaledVector(dir, -f);
        _d.applyMatrix4(inv);
        pos.setXYZ(k, _d.x, _d.y, _d.z);
        changed = true;
      }
      if (changed) {
        pos.needsUpdate = true;
        g.computeVertexNormals();
      }
    });
  };
  const engine = useRef<EngineVoice | null>(null);
  // suspension: rest length REST, stiffness K. Bullet/Rapier multiply the spring by the chassis
  // mass, so each wheel sags g / (4 K) under the car's weight: the hard point sits that much above
  // the wheel centre, and the tyre rests exactly on the ground the model was built on.
  const REST = h.rest;
  const K = h.spring;
  const SAG = REST - 9.81 / (4 * K);
  // spawn transform frozen: a new position array on re-render would teleport the moving car back
  const [spawn] = useState(() => ({ position: [car.x, car.y + 0.02, car.z] as [number, number, number], rotation: [0, car.rotY, 0] as [number, number, number] }));

  useEffect(() => {
    const b = body.current;
    if (!b) return;
    const vc = world.createVehicleController(b);
    vc.indexUpAxis = 1;
    vc.setIndexForwardAxis = 2;
    for (const w of layout) vc.addWheel({ x: w.x, y: w.y + SAG, z: w.z }, { x: 0, y: -1, z: 0 }, { x: -1, y: 0, z: 0 }, REST, w.r);
    layout.forEach((_, i) => {
      vc.setWheelSuspensionStiffness(i, K);
      vc.setWheelSuspensionCompression(i, h.compression);
      vc.setWheelSuspensionRelaxation(i, h.relaxation);
      vc.setWheelMaxSuspensionTravel(i, h.travel);
      vc.setWheelFrictionSlip(i, h.grip);
      vc.setWheelSideFrictionStiffness(i, h.side);
    });
    ctrl.current = vc;
    drive.bodyHandle = b.handle;
    const mk = (window as unknown as { __mk?: Record<string, unknown> }).__mk;
    if (mk) Object.assign(mk, { world, vc, carBody: b }); // ?debug: physics handles for tests
    return () => {
      world.removeVehicleController(vc);
      ctrl.current = null;
    };
  }, [world, layout, SAG, K, REST, h]);

  // your engine: starts when the door closes, stops when you get out
  useEffect(() => {
    const dents = dented.current;
    return () => {
      engine.current?.dispose(0.4);
      engine.current = null;
      tyreVoice.current?.dispose();
      tyreVoice.current = null;
      for (const g of dents.values()) g.dispose();
    };
  }, []);

  useBeforePhysicsStep((w) => {
    const vc = ctrl.current;
    if (!vc) return;
    const speed = vc.currentVehicleSpeed();
    // controls only once Abel is in the seat; while he gets in or out the car holds still
    // (inputLock: the map, a shop or the bag is open: the keys belong to the menu, the car coasts)
    const live = occ.phase === 'seated' && occ.ride?.kind === 'car';
    const controls = live && !inputLock.ui;
    const throttle = controls ? input.moveY : 0;
    let engineF = 0;
    let brake = live ? 0.6 : 90; // engine braking / parked (handbrake on)
    if (!live) {
      // getting in or out: the car stays put. It still settles onto its springs (vertical), but it
      // must not roll off or rock while Abel climbs in (it used to roll back and lift its nose)
      const b = body.current;
      if (b) {
        const v = b.linvel();
        const a = b.angvel();
        const k = 0.35;
        b.setLinvel({ x: v.x * k, y: v.y, z: v.z * k }, true);
        b.setAngvel({ x: a.x * k, y: a.y * k, z: a.z * k }, true);
      }
    }
    const BR = h.brake;
    if (throttle > 0.1) {
      brake = 0;
      if (speed < -0.5) brake = BR; // pressing W while rolling back: brake first
      else if (speed < d.maxSpeed) engineF = throttle * d.power;
    } else if (throttle < -0.1) {
      brake = 0;
      if (speed > 0.8) brake = BR;
      else if (speed > -9) engineF = throttle * d.power * 0.6; // reverse
    }
    // a wrecked engine coughs (power comes and goes) and finally dies
    const hp = drive.health;
    if (hp <= 0 || drive.fuel <= 0) engineF = 0; // dead engine / empty tank
    else if (hp < 250 && Math.random() < 0.35) engineF *= 0.15;
    st.current.throttle = Math.abs(engineF) > 0 ? Math.abs(throttle) : 0;
    // steering: full lock at walking pace, much less at speed (stable like GTA); per car
    const maxSteer = h.steerLock / (1 + Math.abs(speed) / h.steerFade);
    const target = controls ? -input.moveX * maxSteer : 0;
    const s = st.current;
    s.steer += (target - s.steer) * Math.min(1, w.timestep * 6);
    drive.steer = s.steer;
    // handbrake (Space): locks the rear wheels and lets the tail step out: the rear tyres' lateral
    // grip drops while it's held and comes back smoothly after (a controllable drift)
    const hb = controls && input.jump;
    s.handbrake += ((hb ? 1 : 0) - s.handbrake) * Math.min(1, w.timestep * (hb ? 6 : 2.5));
    const driven = (front: boolean) => (h.drive === 'awd' ? 0.5 : h.drive === 'fwd' ? (front ? 1 : 0) : front ? 0 : 1);
    layout.forEach((wh, i) => {
      vc.setWheelSteering(i, wh.front ? s.steer : 0);
      vc.setWheelEngineForce(i, engineF * driven(wh.front)); // power is per driven wheel; awd splits it
      vc.setWheelBrake(i, !wh.front && hb ? 45 : brake);
      // grip from the surface under the tyre (tarmac, murram, dirt, sand) and the handbrake
      const t = tyre.current[i]!;
      const sf = SURFACE_GRIP[t.surface] * wetGrip(t.surface); // rain: wet tarmac, muddy murram
      const g = t.surface === 'tarmac' ? 1 : sf + (1 - sf) * (h.offroad - 0.7) / 0.3 * 0.5;
      vc.setWheelFrictionSlip(i, h.grip * g * (!wh.front ? 1 - 0.45 * s.handbrake : 1));
      vc.setWheelSideFrictionStiffness(i, h.side * Math.min(1, g + 0.1) * (!wh.front ? 1 - 0.5 * s.handbrake : 1));
    });
    // the sea (Part 16.1): water over the sill drags and kills the power; over the bonnet line the
    // engine floods and dies, the car stops where it is (no driving along the seabed)
    {
      const wade = coastWeight(drive.x, drive.z) > 0.5 ? SEA_Y - drive.y : 0;
      const b = body.current;
      if (b) b.setLinearDamping(wade > 0.15 ? 0.6 + wade * 3.5 : 0.05);
      if (wade > 0.15) layout.forEach((_, i) => vc.setWheelEngineForce(i, (vc.wheelEngineForce(i) ?? 0) * (wade > 0.55 ? 0 : 0.5)));
      if (wade > 0.55 && drive.health > 0) {
        drive.health = Math.max(0, drive.health - w.timestep * 500);
        if (drive.health <= 0) useEconomy.getState().toast('Water in the engine: it has flooded and died', 'info');
      }
      st.current.wade = wade;
    }
    const own = body.current?.handle;
    vc.updateVehicle(w.timestep, undefined, undefined, (c) => c.parent()?.handle !== own); // wheel rays ignore the car itself
  });

  // petrol station: E fills the tank (as much as the wallet allows) or has the garage fix the car;
  // each is charged once, up front, after the in-car prompt showed the price
  const fuelTold = useRef({ low: false, empty: false });
  const serviceCost = () => {
    const sv = serviceAt(drive.x, drive.z);
    if (!sv || Math.abs(drive.speed) > 1.0) return null; // stopped (a car settling on its springs still counts)
    if (sv.kind === 'fuel') {
      const litres = Math.max(0, TANK - drive.fuel);
      return { sv, litres, cost: Math.ceil((litres * FUEL_PRICE) / 10) * 10 };
    }
    const dents = dented.current.size;
    return { sv, litres: 0, cost: Math.round(((1000 - drive.health) * 3 + dents * 600) / 50) * 50 };
  };
  useEffect(
    () =>
      onKeyPress('KeyE', () => {
        if (!drive.active || occ.phase !== 'seated' || occ.ride?.kind !== 'car' || useService.getState().busy) return;
        const c = serviceCost();
        if (!c) return;
        const eco = useEconomy.getState();
        if (c.sv.kind === 'fuel') {
          const can = Math.min(c.litres, Math.floor(eco.money / FUEL_PRICE));
          if (c.litres < 0.5) return eco.toast('The tank is already full', 'info');
          if (can < 1) return eco.toast(`Petrol is KSh ${FUEL_PRICE} a litre: not enough money`, 'info');
          const cost = can === c.litres ? c.cost : can * FUEL_PRICE;
          if (!eco.spend(cost, `Petrol, ${can.toFixed(0)} L at ${c.sv.station.name}`)) return;
          // the attendant fills it while you wait (the gauge climbs)
          useService.setState({ busy: true });
          const start = drive.fuel;
          const t0 = performance.now();
          click();
          const iv = setInterval(() => {
            const k = Math.min(1, (performance.now() - t0) / 2500);
            drive.fuel = start + can * k;
            if (k >= 1) {
              clearInterval(iv);
              click();
              useService.setState({ busy: false });
              fuelTold.current = { low: false, empty: false };
              eco.toast(can === c.litres ? 'Full tank. Safari njema!' : `${can.toFixed(0)} litres in: that's all the money covers`, 'info');
            }
          }, 100);
          return;
        }
        if (c.cost <= 0) return eco.toast('The mechanic says the car is fine', 'info');
        if (!eco.spend(c.cost, `Repairs at ${c.sv.station.name}`)) return eco.toast(`The repair is KSh ${c.cost.toLocaleString()}: not enough money`, 'info');
        useService.setState({ busy: true });
        impact(3, { x: drive.x, y: drive.y + 0.6, z: drive.z });
        setTimeout(() => {
          // engine fixed, panels beaten out: the dented copies go, the kit's own body comes back
          drive.health = 1000;
          bodyParts.forEach((p, i) => {
            const mesh = bodyRefs.current[i];
            const g = dented.current.get(i);
            if (mesh && g) {
              mesh.geometry = p.geometry;
              g.dispose();
            }
          });
          dented.current.clear();
          useService.setState({ busy: false });
          eco.toast('Fixed like new. Kazi safi!', 'info');
        }, 2500);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bodyParts],
  );
  useEffect(() => () => useService.setState({ label: '', busy: false }), []);

  // horn
  useEffect(() => onKeyPress('KeyH', () => drive.active && occ.phase === 'seated' && horn('car', { x: drive.x, y: drive.y + 1, z: drive.z })), []);

  // F: get out (driver's side, or the passenger side if the driver's is blocked)
  useEffect(
    () =>
      onKeyPress('KeyF', () => {
        if (occ.phase !== 'seated' || occ.ride?.kind !== 'car' || performance.now() - occ.since < 400) return;
        if (Math.abs(drive.speed) > 4) {
          useEconomy.getState().toast('Slow down first to get out');
          return;
        }
        const half = Math.max(0.7, -box.min.x, box.max.x);
        const own = new Set<number>();
        const b = body.current;
        if (b) for (let i = 0; i < b.numColliders(); i++) own.add(b.collider(i).handle);
        const tryDoor = (sgn: number) => {
          const door = frontDoor(parts, sgn);
          const lz = door ? door.hinge.z - door.size.z - 0.12 : d.seat[2] + 0.25;
          const open = doorClearance(world, rapier, occ.frame, half, sgn, door, lz, drive.y, (h) => own.has(h));
          _v.set(sgn * (half + (door ? 0.45 : 0.5)), 0, lz).applyMatrix4(occ.frame);
          const r = standSpot(world, rapier, _v.x, _v.z, drive.y, (h) => own.has(h));
          return { r: open > 0 ? r : { ...r, ok: false, why: r.why ?? ('blocked' as const) }, x: _v.x, z: _v.z, door, open };
        };
        const drv = tryDoor(-1);
        const pas = drv.r.ok ? drv : tryDoor(1);
        if (!pas.r.ok) {
          const why = drv.r.why === 'traffic' || pas.r.why === 'traffic' ? 'Traffic! Wait for it to pass' : 'No room to open a door here';
          useEconomy.getState().toast(why, 'info');
          return;
        }
        const side = pas === drv ? 'driver' : 'passenger';
        // the exit path for the door actually used
        const r = carRide(car.piece, half, side, {
          onExited: () => {
            drive.active = false;
            useParking.getState().park({ piece: car.piece, x: drive.x, z: drive.z, y: drive.y, rotY: drive.heading, health: drive.health, fuel: drive.fuel });
            onExit();
          },
        }, pas.door, pas.open);
        occ.ride = { ...r, onSeated: occ.ride.onSeated };
        radio.exitVehicle();
        engine.current?.dispose(1.2);
        engine.current = null;
        tyreVoice.current?.dispose();
        tyreVoice.current = null;
        beginExit(_v.set(pas.x, pas.r.ground, pas.z));
      }),
    [car.piece, d, onExit, box, world, rapier, parts],
  );

  useFrame((_, dt) => {
    const b = body.current;
    const vc = ctrl.current;
    const g = frameRef.current;
    if (!b || !vc || !g) return;
    const t = b.translation();
    const r = b.rotation();
    _q.set(r.x, r.y, r.z, r.w);
    _e.setFromQuaternion(_q, 'YXZ');
    drive.x = t.x;
    drive.y = t.y;
    drive.z = t.z;
    drive.heading = _e.y;
    drive.speed = vc.currentVehicleSpeed();
    // fuel: litres per km rise with the throttle (a full tank is ~30-90 km of driving)
    if (occ.phase === 'seated' && drive.fuel > 0) {
      drive.fuel = Math.max(0, drive.fuel - (Math.abs(drive.speed) * dt / 1000) * (0.35 + 1.1 * st.current.throttle));
      if (drive.fuel < 5 && !fuelTold.current.low) {
        fuelTold.current.low = true;
        // GPS to the nearest pump (unless a mission's route is already set)
        const ns = nearestStation(drive.x, drive.z);
        if (ns && !useNav.getState().target) useNav.setState({ target: { x: ns.station.x, z: ns.station.z, label: ns.station.name, kind: 'waypoint' } });
        useEconomy.getState().toast(ns ? `Low fuel: ${ns.station.name} is ${ns.d < 1000 ? `${Math.round(ns.d / 10) * 10} m` : `${(ns.d / 1000).toFixed(1)} km`} away (GPS set). Stop under the canopy and press E` : 'Low fuel: find a petrol station', 'info');
      }
      if (drive.fuel <= 0 && !fuelTold.current.empty) {
        fuelTold.current.empty = true;
        useEconomy.getState().toast('Out of petrol! Push on... or find another car.', 'info');
      }
    }
    // the in-car prompt at a petrol station
    if (occ.phase === 'seated') {
      const c = serviceCost();
      const busy = useService.getState().busy;
      const label = busy ? (c?.sv.kind === 'repair' ? 'The mechanic is working...' : 'Filling up...') : !c ? '' : c.sv.kind === 'fuel'
        ? c.litres < 0.5 ? 'Tank full' : `Fill up: ${c.litres.toFixed(0)} L, KSh ${c.cost.toLocaleString()}`
        : c.cost <= 0 ? 'The car is in good shape' : `Repair at the garage: KSh ${c.cost.toLocaleString()}`;
      if (label !== useService.getState().label) useService.setState({ label });
    }
    // the occupant follows the car as RENDERED (interpolated pose), never a physics step behind
    if (occ.ride?.kind === 'car' && occ.phase !== 'walking' && occ.phase !== 'approaching') {
      g.updateWorldMatrix(true, false);
      setFrame(g.matrixWorld);
      onLive();
    }
    // doors: the one Abel uses follows his hand (occ.door), the rest stay shut
    const rd = occ.ride?.kind === 'car' && occ.phase !== 'walking' && occ.phase !== 'approaching' ? occ.ride.door : undefined;
    for (let k = 0; k < doorParts.length; k++) {
      const part = doorParts[k]!;
      const mesh = doorRefs.current[k];
      if (!mesh) continue;
      const dd = part.door!;
      const open = rd && dd.side === rd.side && dd.front === rd.front && dd.kind !== 'slide' ? occ.door : 0;
      doorLocal(_wm, part, open);
      mesh.matrix.copy(_wm);
    }
    // wheels: the physics wheel's spin, steering and suspension travel
    for (let k = 0; k < wheelParts.length; k++) {
      const part = wheelParts[k]!;
      const mesh = wheelRefs.current[k];
      const i = part.wheel!.index;
      if (!mesh || i >= layout.length) continue;
      const susp = vc.wheelSuspensionLength(i) ?? SAG;
      const drop = SAG - susp; // + is the wheel pushed up into the arch
      wheelLocal(_wm, part, -(vc.wheelRotation(i) ?? 0), vc.wheelSteering(i) ?? 0, drop);
      mesh.matrix.copy(_wm);
    }
    // tyres: what each one is on, how much it slides (marks, dust, smoke, squeal)
    {
      const lv = b.linvel();
      const av = b.angvel();
      let squeal = 0;
      let gravel = 0;
      for (let i = 0; i < layout.length; i++) {
        const ty = tyre.current[i]!;
        const inC = vc.wheelIsInContact(i);
        const cp = vc.wheelContactPoint(i);
        const rot = vc.wheelRotation(i) ?? 0;
        const spin = (rot - ty.rot) / Math.max(dt, 1e-3); // rad/s
        ty.rot = rot;
        if (!inC || !cp) {
          tyreContact(`car${i}`, false, _p.set(0, 0, 0), _up, 0, 0, 0, 0, 0, ty.surface, dt);
          continue;
        }
        ty.surface = surfaceKind(cp.x, cp.z);
        // chassis velocity at the contact point: v + w x r
        _p.set(cp.x, cp.y, cp.z);
        _r.set(cp.x - t.x, cp.y - t.y, cp.z - t.z);
        _w.set(av.x, av.y, av.z).cross(_r).add(_v.set(lv.x, lv.y, lv.z));
        // the wheel's rolling direction (body forward, turned by the steering)
        _f.set(0, 0, 1).applyAxisAngle(_yAxis, vc.wheelSteering(i) ?? 0).applyQuaternion(_q);
        const fwd = _w.x * _f.x + _w.z * _f.z;
        const lat = Math.abs(_w.x * _f.z - _w.z * _f.x);
        const sp = Math.hypot(_w.x, _w.z);
        const roll = Math.abs(spin * layout[i]!.r);
        const latR = lat / Math.max(2.5, sp);
        const longR = Math.abs(roll - Math.abs(fwd)) / Math.max(3, Math.max(roll, Math.abs(fwd)));
        ty.slip += (Math.min(1, Math.max(latR * 1.25, longR)) - ty.slip) * Math.min(1, dt * 12);
        const n = vc.wheelContactNormal(i);
        _n.set(n?.x ?? 0, n?.y ?? 1, n?.z ?? 0);
        tyreContact(`car${i}`, true, _p, _n, _f.x, _f.z, Math.max(0.18, layout[i]!.r * 0.55), occ.phase === 'seated' ? ty.slip : 0, Math.max(sp, roll), ty.surface, dt); // no skid dust while the car is held for getting in/out
        if (ty.surface === 'tarmac') squeal = Math.max(squeal, ty.slip);
        else gravel = Math.max(gravel, Math.min(1, sp / 16));
      }
      st.current.tyreSqueal = squeal;
      st.current.tyreGravel = gravel;
    }
    // engine and road noise follow the drivetrain
    const ac = audioContext();
    const s = st.current;
    if (ac && ac.state === 'running') {
      if (!engine.current && occ.phase === 'seated' && occ.ride?.kind === 'car') {
        const out = bus('engines');
        if (out) engine.current = new EngineVoice(ac, h.engine, out);
      }
      engine.current?.update(drive.speed, s.throttle, drive.health > 0, 0.9);
      if (!tyreVoice.current && occ.phase === 'seated' && occ.ride?.kind === 'car') {
        const out = bus('sfx');
        if (out) tyreVoice.current = new TyreVoice(ac, out);
      }
      tyreVoice.current?.update(s.tyreSqueal, s.tyreGravel, Math.abs(drive.speed));
    }
    // collisions: a sudden change of velocity is an impact (walls, poles, matatus)
    const lv = b.linvel();
    _v.set(lv.x, lv.y, lv.z);
    const dv = _v.distanceTo(s.lastV);
    s.lastV.copy(_v);
    s.hitCool -= dt;
    if (dv > 2.6 && s.hitCool <= 0) {
      impact(dv * 1.2, { x: t.x, y: t.y + 0.6, z: t.z });
      s.hitCool = 0.35;
      const before = drive.health;
      drive.health = Math.max(0, drive.health - (dv - 2) * 38);
      // dent the side that hit: the change of velocity points away from the obstacle
      _imp.copy(s.prevV).sub(_v).applyQuaternion(_qi.copy(_q).invert());
      dent(_imp, Math.min(0.22, (dv - 2) * 0.02));
      if (dv > 9) useEconomy.getState().toast('Ouch! That will need a panel beater', 'info');
      if (before > 0 && drive.health <= 0) useEconomy.getState().toast('The engine is dead. Get out and find another car.', 'info');
    }
    s.prevV.copy(_v);
    // flipped over and stuck: put it back on its wheels (GTA does the same after a moment)
    _up.set(0, 1, 0).applyQuaternion(_q);
    s.upsideDown = _up.y < 0.3 && Math.abs(drive.speed) < 2 ? s.upsideDown + dt : 0;
    if (s.upsideDown > 2) {
      b.setTranslation({ x: t.x, y: t.y + 1.2, z: t.z }, true);
      b.setRotation(_q.setFromAxisAngle(_v.set(0, 1, 0), _e.y), true);
      b.setLinvel({ x: 0, y: 0, z: 0 }, true);
      b.setAngvel({ x: 0, y: 0, z: 0 }, true);
      s.upsideDown = 0;
    }
  }, -40);

  const H = box.max.y;
  const floor = 0.45;
  return (
    <RigidBody
      ref={body}
      type="dynamic"
      colliders={false}
      position={spawn.position}
      rotation={spawn.rotation}
      canSleep={false}
      ccd
      angularDamping={h.angularDamping}
      linearDamping={0.05}
    >
      {/* low, heavy chassis: centre of mass near the axles so it corners without rolling over */}
      <CuboidCollider args={[(box.max.x - box.min.x) / 2, (H - floor) / 2, (box.max.z - box.min.z) / 2]} position={[(box.max.x + box.min.x) / 2, floor + (H - floor) / 2, (box.max.z + box.min.z) / 2]} mass={h.mass * 0.23} />
      {/* the heavy part (engine, frame, axles): its height sets the centre of mass and the body roll */}
      <CuboidCollider args={[d.track - 0.3, 0.1, d.wb / 2 - 0.45]} position={[0, h.ballastY, 0]} mass={h.mass * 0.77} />
      <group ref={frameRef}>
        {bodyParts.map((p, i) => (
          <mesh
            key={i}
            ref={(m) => {
              bodyRefs.current[i] = m;
            }}
            geometry={p.geometry}
            material={p.material}
            matrix={p.local}
            matrixAutoUpdate={false}
            castShadow
            receiveShadow
          />
        ))}
        {doorParts.map((p, i) => (
          <mesh
            key={`d${i}`}
            ref={(m) => {
              doorRefs.current[i] = m;
            }}
            geometry={p.geometry}
            material={p.material}
            matrix={p.local}
            matrixAutoUpdate={false}
            castShadow
            receiveShadow
          />
        ))}
        <Smoke box={box} />
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
            receiveShadow
          />
        ))}
      </group>
    </RigidBody>
  );
}

const smokeTex = (() => {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();

const _sc = new THREE.Color();

/** Smoke from under the bonnet of a damaged car: grey wisps when hurt, thick and dark near death. */
function Smoke({ box }: { box: THREE.Box3 }) {
  const N = 26;
  const mesh = useRef<THREE.InstancedMesh>(null);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ map: smokeTex, transparent: true, depthWrite: false, color: '#9a9a9a', opacity: 0.55 }), []);
  const geo = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  const puffs = useRef(Array.from({ length: N }, () => ({ age: 99, life: 2, x: 0, y: 0, z: 0, vx: 0, vz: 0 })));
  const st = useRef({ next: 0, i: 0 });
  const m = useMemo(() => new THREE.Matrix4(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const p = useMemo(() => new THREE.Vector3(), []);
  const sc = useMemo(() => new THREE.Vector3(), []);
  const inv = useMemo(() => new THREE.Quaternion(), []);
  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const im = mesh.current;
    if (!im) return;
    const hp = drive.health;
    const rate = hp > 450 ? 0 : hp > 150 ? 6 : 16; // puffs per second
    const s = st.current;
    s.next -= dt;
    if (rate && s.next <= 0) {
      s.next = 1 / rate;
      const pf = puffs.current[s.i++ % N]!;
      pf.age = 0;
      pf.life = hp > 150 ? 1.8 : 2.6;
      pf.x = (Math.random() - 0.5) * 0.5;
      pf.y = box.max.y * 0.62;
      pf.z = box.max.z - 0.75;
      pf.vx = (Math.random() - 0.5) * 0.3;
      pf.vz = -Math.abs(drive.speed) * 0.08 - 0.2; // trails behind when moving
    }
    mat.color.set(hp > 150 ? '#a7a7a7' : '#3c3a38');
    // billboards in the car's local frame: undo the car's rotation, face the camera
    im.parent?.getWorldQuaternion(inv);
    inv.invert();
    q.copy(inv).multiply(state.camera.quaternion);
    let n = 0;
    for (const pf of puffs.current) {
      if (pf.age > pf.life) continue;
      pf.age += dt;
      const k = pf.age / pf.life;
      p.set(pf.x + pf.vx * pf.age, pf.y + pf.age * 0.9, pf.z + pf.vz * pf.age);
      m.compose(p, q, sc.setScalar(0.35 + k * 1.6));
      im.setMatrixAt(n, m);
      im.setColorAt(n, _sc.setScalar(1 - k * 0.6));
      n++;
    }
    im.count = n;
    im.visible = n > 0;
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
  });
  return <instancedMesh ref={mesh} args={[geo, mat, N]} frustumCulled={false} renderOrder={4} />;
}
