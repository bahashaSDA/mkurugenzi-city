import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { CuboidCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { useGame } from '../../app/store';
import { useKit } from '../../world/kit/useKit';
import { getKTX2Loader } from '../../world/ktx2';
import { register, type Interactable } from '../../game/interactables';
import { useEconomy } from '../../game/economy';
import { onKeyPress } from '../input';
import { playerPosition } from '../player/playerState';
import { playerAnim } from '../player/AbelModel';
import { prepareCharacter, prepareClips } from '../characters';
import { audioContext, SoundSystem } from '../audio/music';
import { nearestOnRoute, routeSamples, type RouteSample } from './routes';
import { SPECS, type VehicleKind, type VehicleSpec } from './specs';
import { ride, vehicleColliders, vehicles, type VehicleState } from './state';
import { Stages } from './Stages';
import { emit } from '../../game/events';
import { drive } from '../driving/state';

export const VEHICLES_KIT_URL = '/models/vehicles_kit.glb';
const NPC_URLS = ['mama_mboga', 'hustler', 'office', 'student', 'elder', 'young_woman', 'worker', 'auntie'].map((v) => `/models/npc_${v}.glb`);

// Who drives where (per quality tier). Kenya: left-hand traffic (routes.ts offsets lanes left).
const FLEET: Record<'low' | 'mid' | 'high', [string, VehicleKind, number][]> = {
  low: [['A', 'matatu', 2], ['A', 'nganya', 1], ['B', 'nganya', 1], ['B', 'bus', 1], ['C', 'matatu', 2], ['D', 'matatu', 1], ['E', 'matatu', 1], ['F', 'nganya', 1], ['X', 'car', 4]],
  mid: [['A', 'matatu', 3], ['A', 'nganya', 1], ['A', 'car', 2], ['B', 'nganya', 2], ['B', 'bus', 1], ['B', 'car', 2], ['C', 'matatu', 2], ['C', 'nganya', 1], ['C', 'car', 3],
    ['D', 'matatu', 2], ['D', 'car', 2], ['E', 'matatu', 2], ['E', 'nganya', 1], ['F', 'nganya', 2], ['F', 'bus', 1], ['F', 'car', 2], ['X', 'car', 8]],
  high: [['A', 'matatu', 4], ['A', 'nganya', 2], ['A', 'car', 3], ['B', 'nganya', 2], ['B', 'bus', 1], ['B', 'matatu', 1], ['B', 'car', 3], ['C', 'matatu', 3], ['C', 'nganya', 2],
    ['C', 'car', 5], ['D', 'matatu', 2], ['D', 'bus', 1], ['D', 'car', 3], ['E', 'matatu', 2], ['E', 'nganya', 1], ['E', 'car', 2], ['F', 'nganya', 2], ['F', 'bus', 1],
    ['F', 'matatu', 1], ['F', 'car', 3], ['X', 'car', 12]],
};
const HIGHWAY_SPEED = 18;
const SAFE_GAP = 9;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
const _up = new THREE.Vector3(0, 1, 0);
const _world = new THREE.Matrix4();

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function sampleAt(r: RouteSample, s: number, out: { x: number; y: number; z: number; h: number; hw: boolean }) {
  const n = r.x.length;
  const f = (((s % r.length) + r.length) % r.length) / r.step;
  const i = Math.floor(f) % n;
  const j = (i + 1) % n;
  const t = f - Math.floor(f);
  out.x = r.x[i]! + (r.x[j]! - r.x[i]!) * t;
  out.z = r.z[i]! + (r.z[j]! - r.z[i]!) * t;
  out.y = r.y[i]! + (r.y[j]! - r.y[i]!) * t;
  let dh = r.heading[j]! - r.heading[i]!;
  dh = Math.atan2(Math.sin(dh), Math.cos(dh));
  out.h = r.heading[i]! + dh * t;
  out.hw = r.highway[i] === 1;
}

const _a = { x: 0, y: 0, z: 0, h: 0, hw: false };

export function Vehicles() {
  const tier = useGame((s) => s.tier);
  const kit = useKit(VEHICLES_KIT_URL);
  const routes = useMemo(() => routeSamples(), []);
  const group = useRef<THREE.Group>(null);
  const bodies = useRef<(RapierRigidBody | null)[]>([]);

  // --- fleet: spread each route's vehicles evenly along the loop ---
  const fleet = useMemo<VehicleState[]>(() => {
    const r = rng(46);
    const list: VehicleState[] = [];
    const perRoute: Record<string, number> = {};
    for (const [route, , n] of FLEET[tier]) perRoute[route] = (perRoute[route] ?? 0) + n;
    const placed: Record<string, number> = {};
    for (const [route, kind, n] of FLEET[tier]) {
      for (let i = 0; i < n; i++) {
        const k = placed[route] ?? 0;
        placed[route] = k + 1;
        const spec = SPECS[kind];
        const rs = routes[route]!;
        list.push({
          id: list.length, kind, route, piece: spec.pieces[Math.floor(r() * spec.pieces.length)]!,
          s: (rs.length * k) / perRoute[route]! + r() * 8, v: 0, x: 0, y: 0, z: 0, heading: 0,
          dwell: 0, lastStop: -1, nextStopName: '', occupied: Math.floor(spec.seats.length * (0.4 + r() * 0.6)),
          stopped: false, sound: null, hail: -1, waited: 0,
        });
      }
    }
    vehicles.length = 0;
    vehicles.push(...list);
    return list;
  }, [tier, routes]);

  // --- instanced rendering per (piece, LOD, primitive) ---
  const batches = useMemo(() => {
    const out: { piece: string; lod: number; mesh: THREE.InstancedMesh; local: THREE.Matrix4 }[] = [];
    const counts = new Map<string, number>();
    for (const v of fleet) counts.set(v.piece, (counts.get(v.piece) ?? 0) + 1);
    for (const [piece, n] of counts) {
      const def = kit.get(piece);
      if (!def) continue;
      def.lods.forEach((parts, lod) => {
        for (const part of parts) {
          const mesh = new THREE.InstancedMesh(part.geometry, part.material, n);
          mesh.count = 0;
          mesh.castShadow = lod < 2;
          mesh.receiveShadow = true;
          mesh.frustumCulled = false;
          out.push({ piece, lod, mesh, local: part.local });
        }
      });
    }
    return out;
  }, [fleet, kit]);

  useEffect(() => {
    const g = group.current;
    if (!g) return;
    for (const b of batches) g.add(b.mesh);
    return () => {
      for (const b of batches) {
        g.remove(b.mesh);
        b.mesh.dispose();
      }
    };
  }, [batches]);

  // --- boarding interactables (one per vehicle with passengers; position updated every frame) ---
  const doors = useMemo(() => {
    return fleet.map((v) => {
      const spec = SPECS[v.kind];
      const it: Interactable = {
        id: `veh-${v.id}`, x: 1e9, z: 1e9, radius: spec.fare ? 3.2 : 0, key: 'KeyF',
        label: `Board ${v.kind === 'nganya' ? 'the nganya' : v.kind === 'bus' ? 'the bus' : 'the matatu'} (KSh ${spec.fare})`,
        use: () => board(v),
      };
      return it;
    });
  }, [fleet]);
  useEffect(() => {
    const offs = doors.map(register);
    return () => offs.forEach((f) => f());
  }, [doors]);

  // F also gets you off at a stop
  useEffect(
    () =>
      onKeyPress('KeyF', () => {
        if (ride.vehicle < 0 || performance.now() - ride.boardedAt < 800) return; // same press that boarded
        const v = vehicles[ride.vehicle];
        if (!v) return;
        if (!v.stopped) {
          useEconomy.getState().toast('Conductor: "Ngoja stage ifike, boss!" (wait for the next stop)');
          return;
        }
        alight(v);
      }),
    [],
  );

  // --- sound: nganyas blast music, matatus/buses play quieter radio; nearest few only ---
  const listener = useRef<{ panners: Map<number, PannerNode> }>({ panners: new Map() });
  useEffect(() => () => {
    for (const v of vehicles) {
      v.sound?.dispose();
      v.sound = null;
    }
  }, [fleet]);

  const camera = useThree((s) => s.camera);
  const st = useRef({ lod: 0, sound: 0 });

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const st0 = st.current;
    // ---------- driving ----------
    for (const v of fleet) {
      const spec = SPECS[v.kind];
      const rs = routes[v.route]!;
      sampleAt(rs, v.s, _a);
      let target = _a.hw ? HIGHWAY_SPEED : spec.townSpeed;
      // stops: slow down, dwell, pick the stage name for the conductor
      let nextStop = Infinity;
      if (spec.fare) {
        for (const [i, st] of rs.stops.entries()) {
          let d = st.s - v.s;
          if (d < 0) d += rs.length;
          if (d < nextStop && i !== v.lastStop) {
            nextStop = d;
            v.nextStopName = st.stop.name;
          }
          if (d < 1.0 && i !== v.lastStop) {
            v.dwell = st.stop.dwell;
            v.lastStop = i;
            if (ride.vehicle === v.id) {
              useEconomy.getState().toast(`Conductor: "${st.stop.name}! ${st.stop.name}! Shukisha!" (F to get off)`);
            }
          }
        }
        if (nextStop < 25) target = Math.min(target, 2 + nextStop * 0.5);
        // waved down at the roadside: pull over beside Abel
        if (v.hail >= 0) {
          let d = v.hail - v.s;
          if (d < 0) d += rs.length;
          if (d > 400) v.hail = -1; // passed it
          else if (d < 1.2) {
            v.dwell = 8;
            v.hail = -1;
            useEconomy.getState().toast(`Conductor: "Mkurugenzi! Panda, ${v.nextStopName}!" (F to board)`);
          } else target = Math.min(target, 1.5 + d * 0.45);
        }
      }
      // gap keeping behind any vehicle ahead in the same lane, and stop for Abel on the road
      // any vehicle ahead in the same lane, whatever its route (routes share the avenue and expressway)
      const fx = Math.sin(_a.h);
      const fz = Math.cos(_a.h);
      for (const o of fleet) {
        if (o === v) continue;
        const ox = o.x - _a.x;
        const oz = o.z - _a.z;
        const ahead = ox * fx + oz * fz;
        if (ahead <= 0 || ahead > 40 || Math.abs(ox * fz - oz * fx) > 1.6 || Math.cos(o.heading - _a.h) < 0.5) continue;
        target = Math.min(target, Math.max(0, (ahead - SAFE_GAP) * 0.8));
      }
      const px = playerPosition.x - _a.x;
      const pz = playerPosition.z - _a.z;
      const ahead = px * fx + pz * fz;
      const side = Math.abs(px * fz - pz * fx);
      if (ride.vehicle !== v.id && ahead > 0 && ahead < spec.length / 2 + 7 && side < spec.width / 2 + 0.8) target = 0;
      if (v.dwell > 0) {
        v.dwell -= dt;
        target = 0;
        // the conductor waits while Abel walks up to the door (up to ~25 s)
        const [ddx, ddz] = spec.door;
        const dcx = v.x + ddx * Math.cos(v.heading) + ddz * Math.sin(v.heading);
        const dcz = v.z - ddx * Math.sin(v.heading) + ddz * Math.cos(v.heading);
        if (spec.fare && ride.vehicle < 0 && v.dwell < 0.6 && v.waited < 25 && Math.hypot(playerPosition.x - dcx, playerPosition.z - dcz) < 10) {
          v.dwell = 0.6;
          v.waited += dt;
        }
        if (v.dwell <= 0) v.waited = 0;
        if (ride.vehicle === v.id && v.dwell <= 0) useEconomy.getState().toast('Conductor: "Twende! Twende!"');
      }
      v.v += THREE.MathUtils.clamp(target - v.v, -6 * dt, 2.5 * dt);
      v.s = (v.s + v.v * dt) % rs.length;
      v.stopped = v.v < 0.3;
      sampleAt(rs, v.s, _a);
      v.x = _a.x;
      v.y = _a.y;
      v.z = _a.z;
      v.heading = _a.h;
      // physics body
      const b = bodies.current[v.id];
      if (b) {
        b.setNextKinematicTranslation({ x: v.x, y: v.y + spec.height / 2, z: v.z });
        _q.setFromAxisAngle(_up, v.heading);
        b.setNextKinematicRotation(_q);
      }
      // door interactable: only while stopped and not already riding
      const it = doors[v.id]!;
      const [dx, dz] = spec.door;
      const c = Math.cos(v.heading);
      const sn = Math.sin(v.heading);
      it.x = v.x + dx * c + dz * sn;
      it.z = v.z - dx * sn + dz * c;
      it.radius = spec.fare && v.stopped && ride.vehicle < 0 ? 3.2 : 0;
    }

    // ---------- rendering (LOD by camera distance) ----------
    for (const b of batches) b.mesh.count = 0;
    for (const v of fleet) {
      const d = Math.hypot(v.x - camera.position.x, v.z - camera.position.z);
      const lod = ride.vehicle === v.id || d < 25 ? 0 : d < 90 ? 1 : d < 420 ? 2 : -1;
      if (lod < 0) continue;
      _q.setFromAxisAngle(_up, v.heading);
      _p.set(v.x, v.y, v.z);
      const world = _world.compose(_p, _q, _s);
      for (const b of batches) {
        if (b.piece !== v.piece || b.lod !== lod) continue;
        _m.multiplyMatrices(world, b.local);
        b.mesh.setMatrixAt(b.mesh.count++, _m);
      }
    }
    for (const b of batches) {
      b.mesh.visible = b.mesh.count > 0;
      if (b.mesh.visible) b.mesh.instanceMatrix.needsUpdate = true;
    }

    // ---------- sound (4 Hz): nearest nganyas/matatus get a sound system ----------
    st0.sound += dt;
    if (st0.sound > 0.25) {
      st0.sound = 0;
      const ac = audioContext();
      if (ac && ac.state === 'running') {
        const ranked = fleet
          .filter((v) => SPECS[v.kind].music !== 'none')
          .map((v) => ({ v, d: Math.hypot(v.x - playerPosition.x, v.z - playerPosition.z) }))
          .sort((a, b) => a.d - b.d);
        ranked.forEach(({ v, d }, i) => {
          const inside = ride.vehicle === v.id;
          const want = inside || (i < 3 && d < 70);
          if (want && !v.sound) {
            v.sound = new SoundSystem(ac, v.id);
            const pan = ac.createPanner();
            pan.panningModel = 'HRTF';
            pan.distanceModel = 'inverse';
            pan.refDistance = 4;
            pan.rolloffFactor = 1.3;
            v.sound.output.connect(pan).connect(ac.destination);
            listener.current.panners.set(v.id, pan);
          } else if (!want && v.sound) {
            v.sound.dispose();
            v.sound = null;
            listener.current.panners.delete(v.id);
          }
          if (v.sound) {
            const pan = listener.current.panners.get(v.id)!;
            const loud = SPECS[v.kind].music === 'nganya';
            pan.positionX.value = v.x;
            pan.positionY.value = v.y + 1.5;
            pan.positionZ.value = v.z;
            v.sound.setVolume(inside ? (loud ? 1.0 : 0.35) : loud ? 0.9 : 0.25);
          }
        });
        const l = ac.listener;
        if (l.positionX) {
          l.positionX.value = camera.position.x;
          l.positionY.value = camera.position.y;
          l.positionZ.value = camera.position.z;
          const f = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
          l.forwardX.value = f.x;
          l.forwardY.value = f.y;
          l.forwardZ.value = f.z;
        }
      }
    }
  });

  return (
    <>
      <group ref={group} />
      {fleet.map((v) => {
        const spec = SPECS[v.kind];
        return (
          <RigidBody key={`${tier}-${v.id}`} ref={(b) => { bodies.current[v.id] = b; }} type="kinematicPosition" colliders={false}>
            <CuboidCollider
              args={[spec.width / 2, spec.height / 2, spec.length / 2]}
              ref={(c) => {
                if (c) vehicleColliders.add(c.handle);
              }}
            />
          </RigidBody>
        );
      })}
      <Crew fleet={fleet} />
      <Stages />
    </>
  );
}

// ------------------------------------------------------------------- hailing
/** Abel waves at the roadside: the nearest matatu/bus coming along a road beside him pulls over. */
export function hail() {
  if (ride.vehicle >= 0 || drive.active) return; // H is the horn while driving
  playerAnim.action = 'Interact';
  playerAnim.actionUntil = performance.now() + 1400;
  const routes = routeSamples();
  let best: VehicleState | null = null;
  let bestS = 0;
  let bestD = Infinity;
  for (const v of vehicles) {
    if (!SPECS[v.kind].fare) continue;
    const rs = routes[v.route]!;
    const n = nearestOnRoute(rs, playerPosition.x, playerPosition.z);
    if (n.d > 9) continue; // this route doesn't pass here
    let ahead = n.s - v.s; // how far the vehicle still has to drive to reach Abel
    if (ahead < 0) ahead += rs.length;
    if (ahead < 12 || ahead > 600) continue;
    if (ahead < bestD) {
      best = v;
      bestD = ahead;
      bestS = n.s;
    }
  }
  const eco = useEconomy.getState();
  if (!best) {
    eco.toast('No matatu route passes here. Walk to a stage or a main road.');
    return;
  }
  // stop so the passenger door (left side, slightly behind centre) lines up with Abel
  const rs = routes[best.route]!;
  best.hail = (bestS - SPECS[best.kind].door[1] + rs.length) % rs.length;
  eco.toast(`You wave... a ${best.kind === 'nganya' ? 'nganya' : best.kind === 'bus' ? 'bus' : 'matatu'} is coming (${Math.round(bestD)} m away)`);
}

// ------------------------------------------------------------------- boarding / alighting
function board(v: VehicleState) {
  const spec = SPECS[v.kind];
  if (ride.vehicle >= 0 || !v.stopped) return;
  if (!useEconomy.getState().spend(spec.fare, `${v.kind} fare`)) return;
  const full = v.occupied >= spec.seats.length;
  if (full) {
    const spot = spec.stand[Math.floor(Math.random() * spec.stand.length)]!;
    ride.local.set(spot[0], spec.floorY, spot[1]);
    ride.standing = true;
    playerAnim.rideClip = 'Idle_Rail_Loop';
    useEconomy.getState().toast('Conductor: "Imejaa! Simama hapo, shika rail." (full: you stand)');
  } else {
    const seat = spec.seats[v.occupied]!;
    ride.local.set(seat[0], spec.floorY, seat[1]);
    ride.standing = false;
    playerAnim.rideClip = 'Sitting_Idle_Loop';
    v.occupied++;
    useEconomy.getState().toast(`Conductor: "Panda panda! Fare ni ${spec.fare}, Mkurugenzi!"`);
  }
  ride.vehicle = v.id;
  ride.boardedAt = performance.now();
  emit({ type: 'board', vehicle: v.id });
  playerAnim.riding = true;
}

function alight(v: VehicleState) {
  const spec = SPECS[v.kind];
  if (!ride.standing) v.occupied = Math.max(0, v.occupied - 1);
  const [dx, dz] = spec.door;
  const c = Math.cos(v.heading);
  const sn = Math.sin(v.heading);
  const out = dx + 1.4; // step out of the left door onto the roadside
  ride.exit.set(v.x + out * c + dz * sn, v.y + 0.9, v.z - out * sn + dz * c);
  ride.vehicle = -1;
  playerAnim.riding = false;
  ride.justAlighted = true;
  emit({ type: 'alight', x: ride.exit.x, z: ride.exit.z });
  useEconomy.getState().toast('Conductor: "Shukisha! Asante boss."');
}

// ------------------------------------------------------------------- conductors + passengers
/** Maroon-uniformed conductors at the door of the nearest matatus/buses, and seated passengers
 *  inside the vehicle Abel is riding (so a full matatu really looks full). */
function Crew({ fleet }: { fleet: VehicleState[] }) {
  const gl = useThree((s) => s.gl);
  const conductor = useGLTF('/models/npc_conductor.glb', false, true, (loader) => {
    loader.setKTX2Loader(getKTX2Loader(gl) as unknown as Parameters<typeof loader.setKTX2Loader>[0]);
  });
  const npcs = useGLTF(NPC_URLS, false, true, (loader) => {
    loader.setKTX2Loader(getKTX2Loader(gl) as unknown as Parameters<typeof loader.setKTX2Loader>[0]);
  });
  const CREW = 5;
  const PASS = 14;
  const pool = useMemo(() => {
    const make = (src: { scene: THREE.Object3D; animations: THREE.AnimationClip[] }, clip: string) => {
      const obj = cloneSkinned(src.scene);
      prepareCharacter(obj, false);
      const mixer = new THREE.AnimationMixer(obj);
      const clips = prepareClips(src.animations.map((c) => c.clone()));
      const a = clips.find((c) => c.name === clip) ?? clips.find((c) => c.name === 'Idle_Loop');
      if (a) {
        const act = mixer.clipAction(a);
        act.time = Math.random() * a.duration;
        act.play();
      }
      obj.visible = false;
      return { obj, mixer };
    };
    return {
      crew: Array.from({ length: CREW }, () => make(conductor, 'Idle_Rail_Loop')),
      pass: Array.from({ length: PASS }, (_, i) => make(npcs[i % npcs.length]!, 'Sitting_Idle_Loop')),
    };
  }, [conductor, npcs]);
  const root = useRef<THREE.Group>(null);
  useEffect(() => {
    const g = root.current;
    if (!g) return;
    for (const c of [...pool.crew, ...pool.pass]) g.add(c.obj);
    return () => {
      for (const c of [...pool.crew, ...pool.pass]) g.remove(c.obj);
    };
  }, [pool]);

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const cam = state.camera.position;
    const near = fleet
      .filter((v) => SPECS[v.kind].fare > 0)
      .map((v) => ({ v, d: Math.hypot(v.x - cam.x, v.z - cam.z) }))
      .filter((e) => e.d < 60)
      .sort((a, b) => a.d - b.d);
    pool.crew.forEach((c, i) => {
      const e = near[i];
      c.obj.visible = !!e;
      if (!e) return;
      const v = e.v;
      const spec = SPECS[v.kind];
      const [dx, dz] = spec.door;
      const cs = Math.cos(v.heading);
      const sn = Math.sin(v.heading);
      // conductor hangs out of the left door, facing out and slightly forward (owner photo 11)
      const lx = dx - 0.25;
      const lz = dz - 0.3;
      c.obj.position.set(v.x + lx * cs + lz * sn, v.y + spec.floorY - 0.1, v.z - lx * sn + lz * cs);
      c.obj.rotation.y = v.heading + Math.PI / 2 - 0.4;
      c.mixer.update(dt);
    });
    const rv = ride.vehicle >= 0 ? fleet[ride.vehicle] : undefined;
    pool.pass.forEach((p, i) => {
      if (!rv || i >= rv.occupied - (ride.standing ? 0 : 1)) {
        p.obj.visible = false;
        return;
      }
      const spec = SPECS[rv.kind];
      // fill seats from the back so Abel's seat (the last filled) stays free
      const seat = spec.seats[i];
      if (!seat) {
        p.obj.visible = false;
        return;
      }
      const cs = Math.cos(rv.heading);
      const sn = Math.sin(rv.heading);
      p.obj.visible = true;
      p.obj.position.set(rv.x + seat[0] * cs + seat[1] * sn, rv.y + spec.floorY, rv.z - seat[0] * sn + seat[1] * cs);
      p.obj.rotation.y = rv.heading;
      p.mixer.update(dt);
    });
  });
  return <group ref={root} />;
}

export type { VehicleSpec };
