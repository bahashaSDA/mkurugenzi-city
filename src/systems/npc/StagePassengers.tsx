import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { prepareCharacter, prepareClips } from '../characters';
import { stageSpots } from '../vehicles/Stages';
import { vehicles, type VehicleState } from '../vehicles/state';
import { doorOf, seatsOf, takesPassengers } from '../vehicles/Vehicles';
import { useCharacterModels } from '../characterModels';

// Commuters at the stages (Part 7.2): two to four people wait at each shelter near Abel. When a
// matatu, nganya or bus with a real door stops there, they walk to its door one at a time (the
// vehicle waits for them), step up into it and take a seat (its passenger count). Now and then
// someone gets off at the stop and walks away. Only the nearest stages have people (a fixed pool).

const MODELS = ['worker', 'young_woman', 'student', 'elder', 'office', 'mama_mboga'] as const;
const POOL = 14;
const RANGE = 70;
const WALK = 1.25; // m/s

type State = 'wait' | 'walk' | 'board' | 'off' | 'gone';
interface Person {
  obj: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  walk: THREE.AnimationAction;
  idle: THREE.AnimationAction;
  stage: number;
  state: State;
  x: number;
  z: number;
  y: number;
  yaw: number;
  v: VehicleState | null;
  t: number; // time in the current step
  tx: number;
  tz: number;
}

const _m = new THREE.Vector3();
/** ?debug: what the commuters have done (tools/passenger-test.mjs) */
export const passengerStats = { waiting: 0, walking: 0, boarded: 0, alighted: 0 };

function doorWorld(v: VehicleState) {
  const [dx, dz] = doorOf(v);
  const c = Math.cos(v.heading);
  const s = Math.sin(v.heading);
  // the outside edge of the door, and a spot on the kerb just outside it
  return {
    x: v.x + dx * c + dz * s,
    z: v.z - dx * s + dz * c,
    ox: v.x + (dx + 0.8) * c + dz * s,
    oz: v.z - (dx + 0.8) * s + dz * c,
  };
}

export function StagePassengers() {
  const gltfs = useCharacterModels(MODELS.map((m) => `/models/npc_${m}.glb`));
  const root = useRef<THREE.Group>(null);
  const people = useRef<Person[]>([]);
  const tick = useRef(0);
  const stages = useMemo(() => stageSpots(), []);
  const clips = useMemo(() => gltfs.map((g) => prepareClips(g.animations.map((c) => c.clone()))), [gltfs]);

  const make = (stage: number, k: number): Person => {
    const mi = (stage * 3 + k) % MODELS.length;
    const obj = cloneSkinned(gltfs[mi]!.scene);
    prepareCharacter(obj, true);
    const mixer = new THREE.AnimationMixer(obj);
    const cl = clips[mi]!;
    const walk = mixer.clipAction(cl.find((c) => c.name === 'Walk_Loop') ?? cl[0]!);
    const idle = mixer.clipAction(cl.find((c) => c.name === 'Idle_Loop') ?? cl[0]!);
    idle.time = Math.random() * idle.getClip().duration;
    idle.play();
    const st = stages[stage]!;
    // stand along the shelter, a little apart, facing the road
    const c = Math.cos(st.rotY);
    const s = Math.sin(st.rotY);
    const lx = -1.3 + k * 0.9 + (Math.random() - 0.5) * 0.3;
    const lz = 0.15 + Math.random() * 0.4;
    const x = st.x + lx * c + lz * s;
    const z = st.z - lx * s + lz * c;
    return { obj, mixer, walk, idle, stage, state: 'wait', x, z, y: st.y, yaw: st.rotY + (Math.random() - 0.5) * 0.6, v: null, t: 0, tx: 0, tz: 0 };
  };

  const setClip = (p: Person, walking: boolean) => {
    const on = walking ? p.walk : p.idle;
    const off = walking ? p.idle : p.walk;
    if (on.isRunning() && on.getEffectiveWeight() > 0.5) return;
    on.reset().fadeIn(0.25).play();
    off.fadeOut(0.25);
  };

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const g = root.current;
    if (!g) return;
    const cam = state.camera.position;
    const list = people.current;
    // twice a second: people only at the stages near the camera (and refill the queues)
    tick.current -= dt;
    if (tick.current <= 0) {
      tick.current = 0.5;
      const near = stages.map((st, i) => ({ i, d: Math.hypot(st.x - cam.x, st.z - cam.z) })).filter((e) => e.d < RANGE).sort((a, b) => a.d - b.d).slice(0, 4);
      const keep = new Set(near.map((e) => e.i));
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i]!;
        if (p.state === 'gone' || (!keep.has(p.stage) && p.state === 'wait')) {
          g.remove(p.obj);
          p.mixer.stopAllAction();
          list.splice(i, 1);
        }
      }
      for (const { i } of near) {
        const waiting = list.filter((p) => p.stage === i && p.state === 'wait').length;
        // the queue comes back slowly after a matatu has taken everyone (one new person a while)
        if (list.length < POOL && waiting < 2 + (i % 3) && Math.random() < (waiting === 0 ? 0.5 : 0.08)) {
          const p = make(i, waiting);
          list.push(p);
          g.add(p.obj);
        }
      }
    }
    for (const p of list) {
      p.t += dt;
      if (p.state === 'wait') {
        // a vehicle taking passengers, stopped at this stage with seats free: walk to its door
        const st = stages[p.stage]!;
        for (const v of vehicles) {
          if (!v.stopped || v.dwell <= 0.3 || !takesPassengers(v) || v.occupied >= seatsOf(v)) continue;
          const d = doorWorld(v);
          if (Math.hypot(d.x - st.x, d.z - st.z) > 14) continue;
          // one at a time per vehicle: the others wait their turn
          if (list.some((q) => q.v === v && (q.state === 'walk' || q.state === 'board'))) continue;
          p.state = 'walk';
          p.v = v;
          p.t = 0;
          break;
        }
        setClip(p, false);
      } else if (p.state === 'walk' && p.v) {
        const v = p.v;
        v.dwell = Math.max(v.dwell, 1.5); // the conductor waits for them
        const d = doorWorld(v);
        _m.set(d.ox - p.x, 0, d.oz - p.z);
        const dist = _m.length();
        if (dist < 0.15 || p.t > 15) {
          p.state = 'board';
          p.t = 0;
          p.tx = d.x;
          p.tz = d.z;
        } else {
          const step = Math.min(dist, WALK * dt);
          p.x += (_m.x / dist) * step;
          p.z += (_m.z / dist) * step;
          p.yaw = Math.atan2(_m.x, _m.z);
          setClip(p, true);
        }
      } else if (p.state === 'board' && p.v) {
        // up the step and in through the doorway, then they're a seated passenger
        const v = p.v;
        v.dwell = Math.max(v.dwell, 1.0);
        const k = Math.min(1, p.t / 0.9);
        const d = doorWorld(v);
        p.x += (d.x - p.x) * Math.min(1, dt * 4);
        p.z += (d.z - p.z) * Math.min(1, dt * 4);
        p.yaw = Math.atan2(d.x - d.ox, d.z - d.oz);
        p.y = stages[p.stage]!.y + 0.35 * k;
        if (k >= 1) {
          v.occupied = Math.min(seatsOf(v), v.occupied + 1);
          p.state = 'gone';
          passengerStats.boarded++;
        }
      } else if (p.state === 'off') {
        // got off: walk away along the pavement, then go about their day
        _m.set(p.tx - p.x, 0, p.tz - p.z);
        const dist = _m.length();
        if (dist < 0.3) p.state = 'gone';
        else {
          p.x += (_m.x / dist) * WALK * dt;
          p.z += (_m.z / dist) * WALK * dt;
          p.yaw = Math.atan2(_m.x, _m.z);
          setClip(p, true);
        }
      }
      p.obj.position.set(p.x, p.y, p.z);
      p.obj.rotation.y = p.yaw;
      p.mixer.update(dt);
    }
    passengerStats.waiting = list.filter((p) => p.state === 'wait').length;
    passengerStats.walking = list.filter((p) => p.state === 'walk' || p.state === 'board').length;
    // someone gets off: when a vehicle arrives at a stage near the camera (once per stop)
    for (const v of vehicles) {
      if (!v.stopped || v.dwell < 2 || !takesPassengers(v) || v.occupied < 3) continue;
      const tag = v as VehicleState & { alightedAt?: number };
      if (tag.alightedAt === v.lastStop) continue;
      tag.alightedAt = v.lastStop;
      if (Math.random() > 0.45 || list.length >= POOL) continue;
      const d = doorWorld(v);
      if (Math.hypot(d.x - cam.x, d.z - cam.z) > RANGE) continue;
      const si = stages.findIndex((st) => Math.hypot(st.x - d.x, st.z - d.z) < 14);
      if (si < 0) continue;
      const p = make(si, 0);
      p.x = d.ox;
      p.z = d.oz;
      p.state = 'off';
      const st = stages[si]!;
      const away = Math.random() < 0.5 ? 1 : -1;
      p.tx = st.x + Math.cos(st.rotY) * 9 * away + Math.sin(st.rotY) * 2;
      p.tz = st.z - Math.sin(st.rotY) * 9 * away + Math.cos(st.rotY) * 2;
      v.occupied = Math.max(0, v.occupied - 1);
      passengerStats.alighted++;
      list.push(p);
      g.add(p.obj);
    }
  });

  return <group ref={root} />;
}
