import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { CuboidCollider, RigidBody, useBeforePhysicsStep, useRapier, type RapierRigidBody } from '@react-three/rapier';
import type { DynamicRayCastVehicleController } from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { useKit, type Kit } from '../../world/kit/useKit';
import { KitInstances } from '../../world/kit/KitInstances';
import { register } from '../../game/interactables';
import { useEconomy } from '../../game/economy';
import { emit } from '../../game/events';
import { input, onKeyPress } from '../input';
import { playerAnim } from '../player/AbelModel';
import { ride } from '../vehicles/state';
import { VEHICLES_KIT_URL } from '../vehicles/Vehicles';
import { CAR_DIMS, carKind, drive, useParking } from './state';

// GTA-style driving: parked cars on the road shoulders (instanced, solid), F at the driver's door
// to get in. The driven car is a Rapier raycast vehicle (suspension, grip, rear-wheel drive):
// W/S throttle and brake/reverse, A/D steer, Space handbrake, H horn, F get out.

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _up = new THREE.Vector3();

/** World position of a local point (x, z) on a car at (cx, cz) with heading h. */
function local(cx: number, cz: number, h: number, lx: number, lz: number): [number, number] {
  const c = Math.cos(h);
  const s = Math.sin(h);
  return [cx + lx * c + lz * s, cz - lx * s + lz * c];
}

export function Driving() {
  const kit = useKit(VEHICLES_KIT_URL);
  const cars = useParking((s) => s.cars);
  const [driving, setDriving] = useState<{ piece: string; x: number; y: number; z: number; rotY: number } | null>(null);

  // F at the driver's door (right side) of any parked car
  useEffect(() => {
    const offs = cars.map((c) => {
      const d = CAR_DIMS[carKind(c.piece)]!;
      const [x, z] = local(c.x, c.z, c.rotY, -(d.W / 2 + 0.7), d.seat[2]);
      return register({
        id: `car-${c.id}`, x, z, radius: 2.0, key: 'KeyF', label: 'Get in and drive',
        use: () => {
          if (drive.active || ride.vehicle >= 0) return;
          const taken = useParking.getState().take(c.id);
          if (!taken) return;
          drive.active = true;
          drive.piece = taken.piece;
          drive.enteredAt = performance.now();
          emit({ type: 'drive', piece: taken.piece });
          playerAnim.riding = true;
          playerAnim.rideClip = 'Driving_Loop';
          setDriving({ piece: taken.piece, x: taken.x, y: taken.y ?? 0, z: taken.z, rotY: taken.rotY });
          useEconomy.getState().toast('W/S drive and brake · A/D steer · Space handbrake · H horn · F get out');
        },
      });
    });
    return () => offs.forEach((f) => f());
  }, [cars]);

  return (
    <>
      <KitInstances kit={kit} placements={cars} />
      {driving && <DrivenCar key={`${driving.x},${driving.z}`} car={driving} kit={kit} onExit={() => setDriving(null)} />}
    </>
  );
}

function DrivenCar({ car, kit, onExit }: { car: { piece: string; x: number; y: number; z: number; rotY: number }; kit: Kit; onExit: () => void }) {
  const { world } = useRapier();
  const body = useRef<RapierRigidBody>(null);
  const ctrl = useRef<DynamicRayCastVehicleController | null>(null);
  const d = CAR_DIMS[carKind(car.piece)]!;
  const parts = useMemo(() => kit.get(car.piece)?.lods[0] ?? [], [kit, car.piece]);
  const st = useRef({ steer: 0, upsideDown: 0, horn: 0 });
  // spawn transform frozen: a new position array on re-render would teleport the moving car back
  const [spawn] = useState(() => ({ position: [car.x, car.y + 0.3, car.z] as [number, number, number], rotation: [0, car.rotY, 0] as [number, number, number] }));

  useEffect(() => {
    const b = body.current;
    if (!b) return;
    const vc = world.createVehicleController(b);
    vc.indexUpAxis = 1;
    vc.setIndexForwardAxis = 2;
    const y = d.r + 0.25;
    for (const [x, z] of [[d.track, d.wb / 2], [-d.track, d.wb / 2], [d.track, -d.wb / 2], [-d.track, -d.wb / 2]] as const) {
      vc.addWheel({ x, y, z }, { x: 0, y: -1, z: 0 }, { x: -1, y: 0, z: 0 }, 0.3, d.r);
    }
    for (let i = 0; i < 4; i++) {
      vc.setWheelSuspensionStiffness(i, 32);
      vc.setWheelSuspensionCompression(i, 4.0);
      vc.setWheelSuspensionRelaxation(i, 3.0);
      vc.setWheelFrictionSlip(i, 2.4);
      vc.setWheelSideFrictionStiffness(i, 1.1);
    }
    ctrl.current = vc;
    drive.bodyHandle = b.handle;
    const mk = (window as unknown as { __mk?: Record<string, unknown> }).__mk;
    if (mk) Object.assign(mk, { world, vc, carBody: b }); // ?debug: physics handles for tests
    return () => {
      world.removeVehicleController(vc);
      ctrl.current = null;
    };
  }, [world, d]);

  useBeforePhysicsStep((w) => {
    const vc = ctrl.current;
    if (!vc || !drive.active) return;
    const speed = vc.currentVehicleSpeed();
    const throttle = input.moveY;
    let engine = 0;
    let brake = 0.6; // engine braking
    if (throttle > 0.1) {
      brake = 0;
      if (speed < -0.5) brake = 30; // pressing W while rolling back: brake first
      else if (speed < d.maxSpeed) engine = throttle * d.power;
    } else if (throttle < -0.1) {
      brake = 0;
      if (speed > 0.8) brake = 30;
      else if (speed > -9) engine = throttle * d.power * 0.6; // reverse
    }
    // steering: full lock at walking pace, much less at speed (stable like GTA)
    const maxSteer = 0.6 / (1 + Math.abs(speed) / 14);
    const target = -input.moveX * maxSteer;
    const s = st.current;
    s.steer += (target - s.steer) * Math.min(1, w.timestep * 6);
    for (const i of [0, 1]) {
      vc.setWheelSteering(i, s.steer);
      vc.setWheelBrake(i, brake);
      vc.setWheelEngineForce(i, 0);
    }
    for (const i of [2, 3]) {
      vc.setWheelEngineForce(i, engine);
      vc.setWheelBrake(i, input.jump ? 45 : brake);
    }
    const own = body.current?.handle;
    vc.updateVehicle(w.timestep, undefined, undefined, (c) => c.parent()?.handle !== own); // wheel rays ignore the car itself
  });

  // horn
  useEffect(() => onKeyPress('KeyH', () => drive.active && honk()), []);

  // F: get out on the driver's side, the car stays parked where it is
  useEffect(
    () =>
      onKeyPress('KeyF', () => {
        if (!drive.active || performance.now() - drive.enteredAt < 800) return;
        if (Math.abs(drive.speed) > 4) {
          useEconomy.getState().toast('Slow down first to get out');
          return;
        }
        const [x, z] = local(drive.x, drive.z, drive.heading, -(d.W / 2 + 0.8), d.seat[2]);
        drive.exit.set(x, drive.y + 1.0, z);
        drive.active = false;
        drive.justExited = true;
        playerAnim.riding = false;
        useParking.getState().park({ piece: car.piece, x: drive.x, z: drive.z, y: drive.y, rotY: drive.heading });
        onExit();
      }),
    [car.piece, d, onExit],
  );

  useFrame((_, dt) => {
    const b = body.current;
    const vc = ctrl.current;
    if (!b || !vc) return;
    const t = b.translation();
    const r = b.rotation();
    _q.set(r.x, r.y, r.z, r.w);
    _e.setFromQuaternion(_q, 'YXZ');
    drive.x = t.x;
    drive.y = t.y;
    drive.z = t.z;
    drive.heading = _e.y;
    drive.speed = vc.currentVehicleSpeed();
    _v.set(d.seat[0], d.seat[1], d.seat[2]).applyQuaternion(_q);
    drive.seat.set(t.x + _v.x, t.y + _v.y, t.z + _v.z);
    // flipped over and stuck: put it back on its wheels (GTA does the same after a moment)
    _up.set(0, 1, 0).applyQuaternion(_q);
    const s = st.current;
    s.upsideDown = _up.y < 0.3 && Math.abs(drive.speed) < 2 ? s.upsideDown + dt : 0;
    if (s.upsideDown > 2) {
      b.setTranslation({ x: t.x, y: t.y + 1.2, z: t.z }, true);
      b.setRotation(_q.setFromAxisAngle(_v.set(0, 1, 0), _e.y), true);
      b.setLinvel({ x: 0, y: 0, z: 0 }, true);
      b.setAngvel({ x: 0, y: 0, z: 0 }, true);
      s.upsideDown = 0;
    }
  });

  return (
    <RigidBody
      ref={body}
      type="dynamic"
      colliders={false}
      position={spawn.position}
      rotation={spawn.rotation}
      canSleep={false}
      ccd
      angularDamping={0.6}
      linearDamping={0.05}
    >
      {/* low, heavy chassis: centre of mass near the axles so it corners without rolling over */}
      <CuboidCollider args={[d.W / 2, (d.H - 0.45) / 2, d.L / 2]} position={[0, 0.45 + (d.H - 0.45) / 2, 0]} mass={300} />
      <CuboidCollider args={[d.track - 0.3, 0.1, d.wb / 2 - 0.45]} position={[0, 0.35, 0]} mass={1000} />
      {parts.map((p, i) => (
        <mesh key={i} geometry={p.geometry} material={p.material} matrix={p.local} matrixAutoUpdate={false} castShadow receiveShadow />
      ))}
    </RigidBody>
  );
}

let hornCtx: AudioContext | null = null;
function honk() {
  try {
    hornCtx ??= new AudioContext();
    const ac = hornCtx;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.25, ac.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.45);
    g.connect(ac.destination);
    for (const f of [415, 494]) {
      const o = ac.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.connect(g);
      o.start();
      o.stop(ac.currentTime + 0.5);
    }
  } catch {
    /* audio unavailable */
  }
}
