import { junctions, lightAt } from '../../world/junctions';
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { CuboidCollider, RigidBody, useRapier, type RapierRigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { useGame } from '../../app/store';
import { useVehicleKit } from './vehicleKit';
import { register, type Interactable } from '../../game/interactables';
import { useEconomy } from '../../game/economy';
import { onKeyPress } from '../input';
import { playerPosition } from '../player/playerState';
import { playerAnim } from '../player/AbelModel';
import { prepareCharacter, prepareClips } from '../characters';
import { audioContext, SoundSystem } from '../audio/music';
import { TrackPlayer } from '../audio/tracks';
import { bus, panner, setPos } from '../audio/mixer';
import { EngineVoice, engineKindOf } from '../audio/engine';
import { say } from '../audio/voice';
import { horn } from '../audio/sfx';
import { conductorLine, type ConductorContext } from '../../game/conductorLines';
import { PASSENGER_TALK, pickTalk } from '../../game/streetTalk';
import { nearestOnRoute, routeSamples, type RouteSample } from './routes';
import { SPECS, type VehicleKind, type VehicleSpec } from './specs';
import { ride, vehicleColliders, vehicles, type VehicleState } from './state';
import { beginApproach, beginExit, occ, setFrame, type Key, type Ride } from './occupancy';
import { standSpot } from './exitCheck';
import { doorLocal, sharedWheelLocal, wheelLayout } from './wheels';
import type { KitPart, KitWheel } from '../../world/kit/useKit';
import { transitLayout, type TransitLayout } from './layout';
import { Stages } from './Stages';
import { emit } from '../../game/events';
import { drive, enterRequest, useParking } from '../driving/state';
import { useStreetSpawns } from '../combat/combat';
import { useCharacterModels, useModel } from '../characterModels';

const JACK_LINES = ['Driver: "Wewe! Hiyo ni gari yangu!"', 'Driver: "Mkurugenzi?! Ata wewe?!"', 'Driver: "Polepole! Nitashuka mwenyewe!"'];

// passengers: the same mostly-merch crowd (shares the GLBs the pedestrians already loaded)
const NPC_URLS = ['fan_hoodie_black', 'fan_lady_black', 'fan_tee_burgundy', 'fan_hoodie_sand', 'mama_mboga', 'student'].map((v) => `/models/npc_${v}.glb`);

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
// Render LODs by distance, with hysteresis so a vehicle on the boundary doesn't flicker between
// two models. Near: full model with spinning wheels; mid: textured simplified model (wheels still
// spin where the model has them); far: one merged untextured mesh; beyond: not drawn.
const LOD_IN = [55, 230, 900];
const LOD_OUT = [62, 250, 940];
// audio
const ENGINE_VOICES = 5;
const ENGINE_RANGE = 75;
const MUSIC_RANGE = 48;

const _m = new THREE.Matrix4();
const _wl = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
const _up = new THREE.Vector3(0, 1, 0);
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _world = new THREE.Matrix4();
const _f = new THREE.Vector3();

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

/** Each transit vehicle's passenger layout, measured from its model (systems/vehicles/layout). */
const layouts = new Map<string, TransitLayout>();
function L(v: VehicleState): TransitLayout {
  const l = layouts.get(v.piece);
  if (l) return l;
  const spec = SPECS[v.kind];
  return { seats: spec.seats, stand: spec.stand, door: spec.door, aisleX: v.kind === 'matatu' ? 0.72 : 0.15, length: spec.length, front: spec.length / 2, rear: -spec.length / 2, halfW: spec.width / 2 };
}

/**
 * Vehicles whose model has no passenger door on the kerb side (the Ma3's doors are paint on a
 * hollow shell, the graffiti matatu is a scan): they run full ("express"), never stop for
 * passengers, so nobody ever boards through solid bodywork. See KNOWN_ISSUES (Ma3 door + interior).
 */
const doorless = new Set<string>();
/** Vehicles Abel asked to get off at the next stage; alightNow is set by the component (needs physics). */
const alightAsk = new Set<number>();
const alightNow: { fn: ((v: VehicleState) => void) | null } = { fn: null };
/** This vehicle takes passengers: a fare, and a real door to get in by. */
const carries = (v: VehicleState) => !!SPECS[v.kind].fare && !doorless.has(v.piece);

const _a = { x: 0, y: 0, z: 0, h: 0, hw: false };
const _b = { x: 0, y: 0, z: 0, h: 0, hw: false };

/** Vehicle-local -> world for a traffic vehicle (yaw + pitch). */
export function vehicleMatrix(v: VehicleState, out: THREE.Matrix4) {
  _e.set(v.pitch, v.heading, 0, 'YXZ');
  _q.setFromEuler(_e);
  return out.compose(_p.set(v.x, v.y, v.z), _q, _s);
}

function conductorSays(v: VehicleState, ctx: ConductorContext, inside = false) {
  const spec = SPECS[v.kind];
  const l = conductorLine(ctx, { stop: v.nextStopName || 'Tao', fare: spec.fare });
  // he stands at the door: the voice comes from there (in your ear when you're aboard)
  const [dx, dz] = L(v).door;
  const c = Math.cos(v.heading);
  const sn = Math.sin(v.heading);
  const pos = inside ? undefined : { x: v.x + dx * c + dz * sn, y: v.y + 1.6, z: v.z - dx * sn + dz * c };
  say({ who: v.id % 3 === 0 ? 'conductor2' : 'conductor', name: 'Conductor', text: l.text, en: l.en, pos });
}

export function Vehicles() {
  const tier = useGame((s) => s.tier);
  const kit = useVehicleKit();
  const routes = useMemo(() => routeSamples(), []);
  const group = useRef<THREE.Group>(null);
  const bodies = useRef<(RapierRigidBody | null)[]>([]);
  const { world, rapier } = useRapier();

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
          s: (rs.length * k) / perRoute[route]! + r() * 8, v: 0, accel: 0, x: 0, y: 0, z: 0, heading: 0, pitch: 0, wheelSpin: r() * 6, steer: 0,
          dwell: 0, lastStop: -1, nextStopName: '', occupied: Math.floor(spec.seats.length * (0.4 + r() * 0.6)),
          stopped: false, sound: null, hail: -1, waited: 0, callAt: 0, invited: false, lod: 1, doorOpen: 0,
        });
      }
    }
    return list;
  }, [tier, routes]);
  // the shared list (hailing, the map, tests) is the fleet this component actually drives
  // (set in an effect: a render-time side effect could publish a different copy of the fleet)
  useEffect(() => {
    vehicles.length = 0;
    vehicles.push(...fleet);
  }, [fleet]);

  // --- wheelbase of each piece (from its real wheels) for slope pitch and steering ---
  const geom = useMemo(() => {
    const out = new Map<string, { wb: number; front: number; rear: number }>();
    for (const v of fleet) {
      if (out.has(v.piece)) continue;
      const ws = (kit.get(v.piece)?.lods[0] ?? []).filter((p) => p.wheel).map((p) => p.wheel!.center.z);
      const spec = SPECS[v.kind];
      const front = ws.length ? Math.max(...ws) : spec.length * 0.32;
      const rear = ws.length ? Math.min(...ws) : -spec.length * 0.32;
      out.set(v.piece, { wb: front - rear, front, rear });
    }
    return out;
  }, [fleet, kit]);

  // --- passenger layouts from the models; occupancy can't exceed the seats a model really has ---
  useMemo(() => {
    for (const v of fleet) {
      if (!SPECS[v.kind].fare) continue;
      const parts = kit.get(v.piece)?.lods[0];
      if (!parts) continue;
      const lay = transitLayout(v.piece, v.kind, parts);
      // board through the model's REAL passenger door (kerb side, +X): a sliding door if it has one,
      // else its hinged door. Its opening (vehicle-local): the door's outer face, halfway along it
      // from the hinge (doors hinge on their front edge and reach back by their length)
      const kerb = parts.filter((p) => p.door && p.door.side > 0).map((p) => p.door!);
      const pd = kerb.find((d) => d.kind === 'slide') ?? kerb.filter((d) => d.kind === 'swing').sort((a, b) => a.hinge.z - b.hinge.z)[0];
      if (pd) lay.door = [pd.hinge.x, pd.hinge.z - pd.size.z / 2];
      layouts.set(v.piece, lay);
      if (!pd) doorless.add(v.piece);
      v.occupied = Math.min(v.occupied, Math.max(0, lay.seats.length - 2));
    }
  }, [fleet, kit]);

  // --- instanced rendering per (piece, LOD, primitive); wheels are their own batches ---
  const batches = useMemo(() => {
    // wheels: one batch per (piece, LOD, material) drawing ALL the wheels with wheel 0's mesh
    const out: { piece: string; lod: number; mesh: THREE.InstancedMesh; part: KitPart; targets?: KitWheel[] }[] = [];
    const counts = new Map<string, number>();
    for (const v of fleet) counts.set(v.piece, (counts.get(v.piece) ?? 0) + 1);
    for (const [piece, n] of counts) {
      const def = kit.get(piece);
      if (!def) continue;
      def.lods.forEach((parts, lod) => {
        const targets = wheelLayout(parts);
        for (const part of parts) {
          if (part.wheel && part.wheel.index !== 0) continue;
          const mesh = new THREE.InstancedMesh(part.geometry, part.material, part.wheel ? n * targets.length : n);
          mesh.count = 0;
          mesh.castShadow = lod < 2;
          mesh.receiveShadow = true;
          mesh.frustumCulled = false;
          out.push({ piece, lod, mesh, part, targets: part.wheel ? targets : undefined });
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
        id: `veh-${v.id}`, x: 1e9, z: 1e9, radius: spec.fare ? 4.5 : 0, key: 'KeyF', priority: 1, // boarding beats "wave one down"

        label: `Board ${v.kind === 'nganya' ? 'the nganya' : v.kind === 'bus' ? 'the bus' : 'the matatu'} (KSh ${spec.fare})`,
        use: () => board(v, world, rapier),
      };
      return it;
    });
  }, [fleet, world, rapier]);
  useEffect(() => {
    const offs = doors.map(register);
    return () => offs.forEach((f) => f());
  }, [doors]);

  // --- carjacking (GTA style, no weapons): F at the driver's door of a slow or stopped car ---
  const jacks = useMemo(
    () =>
      fleet.map((v) => {
        const it: Interactable = {
          id: `jack-${v.id}`, x: 1e9, z: 1e9, radius: 0, key: 'KeyF', label: 'Pull the driver out',
          use: () => {
            if (drive.active || ride.vehicle >= 0 || occ.phase !== 'walking' || v.v > 6) return;
            const spec = SPECS[v.kind];
            const id = useParking.getState().park({ piece: v.piece, x: v.x, z: v.z, y: v.y, rotY: v.heading });
            v.jackedUntil = performance.now() + 90000;
            // the driver lands on the road beside the door: most run, some want a fight
            const c = Math.cos(v.heading);
            const sn = Math.sin(v.heading);
            const ox = -(spec.width / 2 + 1.6);
            useStreetSpawns.getState().add(v.x + ox * c, v.z - ox * sn, Math.random() < 0.3 ? 'fight' : 'flee');
            useEconomy.getState().toast(JACK_LINES[Math.floor(Math.random() * JACK_LINES.length)]!);
            enterRequest.id = id;
          },
        };
        return it;
      }),
    [fleet],
  );
  useEffect(() => {
    const offs = jacks.map(register);
    return () => offs.forEach((f) => f());
  }, [jacks]);

  useEffect(() => {
    alightNow.fn = (v) => {
      if (ride.vehicle === v.id && occ.phase === 'seated' && v.stopped) alight(v, world, rapier);
      else if (ride.vehicle === v.id && occ.phase === 'seated') alightAsk.add(v.id); // not stopped yet: next stage
    };
    return () => {
      alightNow.fn = null;
    };
  }, [world, rapier]);
  // F gets you off: at once when stopped, else at the next stage
  useEffect(
    () =>
      onKeyPress('KeyF', () => {
        if (ride.vehicle < 0 || occ.phase !== 'seated' || occ.ride?.kind !== 'transit' || performance.now() - occ.since < 500) return;
        const v = vehicles[ride.vehicle];
        if (!v) return;
        if (!v.stopped) {
          // asked to get off: the conductor bangs the roof, the driver stops at the next stage and
          // Abel steps off there (no need to press again)
          if (!alightAsk.has(v.id)) {
            alightAsk.add(v.id);
            conductorSays(v, 'wait', true);
            useEconomy.getState().toast('Next stage: you get off there', 'info');
          }
          return;
        }
        alightAsk.delete(v.id);
        alight(v, world, rapier);
      }),
    [world, rapier],
  );

  // --- sound: engines (pooled, positional) and the nganya sound systems ---
  const audio = useRef({ voices: new Map<number, { eng: EngineVoice; pan: PannerNode }>(), music: new Map<number, { lp: BiquadFilterNode; pan: PannerNode }>(), t: 0 });
  useEffect(
    () => () => {
      const a = audio.current;
      for (const { eng } of a.voices.values()) eng.dispose(0.2);
      a.voices.clear();
      for (const v of vehicles) {
        v.sound?.dispose();
        v.sound = null;
      }
      a.music.clear();
    },
    [fleet],
  );

  const camera = useThree((s) => s.camera);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    // ---------- driving ----------
    const nowMs = performance.now();
    for (const v of fleet) {
      const spec = SPECS[v.kind];
      const rs = routes[v.route]!;
      if (v.jackedUntil) {
        if (nowMs < v.jackedUntil) {
          bodies.current[v.id]?.setNextKinematicTranslation({ x: v.x, y: -200, z: v.z });
          jacks[v.id]!.radius = 0;
          doors[v.id]!.radius = 0;
          continue;
        }
        v.jackedUntil = 0;
        v.s = (v.s + rs.length / 2) % rs.length; // back in traffic, somewhere else
      }
      sampleAt(rs, v.s, _a);
      let target = _a.hw ? HIGHWAY_SPEED : spec.townSpeed;
      const aboard = ride.vehicle === v.id;
      if (aboard && occ.phase === 'seated' && spec.fare) {
        if (v.v > 3 && nowMs > rideTalk.next) {
          rideTalk.next = nowMs + 13000 + Math.random() * 9000;
          if (rideTalk.turn++ % 2 === 0) conductorSays(v, 'ride', true);
          else {
            const l = pickTalk(PASSENGER_TALK);
            say({ who: rideTalk.turn % 4 === 1 ? 'passenger' : 'man2', name: 'Passenger', text: l.sw, en: l.en });
          }
        }
      } else if (aboard) rideTalk.next = nowMs + 9000;
      // Abel is walking to the door, climbing in or getting out: the vehicle waits
      const holding = aboard && occ.phase !== 'seated';
      // stops: slow down, dwell, pick the stage name for the conductor
      let nextStop = Infinity;
      if (carries(v)) {
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
            v.invited = false;
            // Abel asked to get off: he steps down at this stage
            if (aboard && occ.phase === 'seated' && alightAsk.has(v.id)) {
              alightAsk.delete(v.id);
              v.dwell = Math.max(v.dwell, 3);
              setTimeout(() => alightNow.fn?.(v), 600);
            }
            if (aboard && occ.phase === 'seated') {
              v.nextStopName = st.stop.name;
              conductorSays(v, 'arrive', true);
              useEconomy.getState().toast('F to get off here', 'info');
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
            v.invited = true;
            conductorSays(v, 'hail');
          } else target = Math.min(target, 1.5 + d * 0.45);
        }
      }
      // gap keeping behind any vehicle ahead in the same lane, whatever its route
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
      // traffic lights (world/junctions): stop at the line on red, and on amber if there's room to
      // stop; already over the line, clear the junction
      {
        const tNow = nowMs / 1000;
        for (const j of junctions()) {
          const rx = j.x - _a.x;
          const rz = j.z - _a.z;
          const ahead = rx * fx + rz * fz;
          if (ahead < 2 || ahead > 50 || Math.abs(rx * fz - rz * fx) > 14) continue;
          const c0 = Math.abs(fx * j.axes[0].dx + fz * j.axes[0].dz);
          const c1 = Math.abs(fx * j.axes[1].dx + fz * j.axes[1].dz);
          const axis = c0 >= c1 ? 0 : 1;
          if (Math.max(c0, c1) < 0.7) continue; // turning through it
          const toLine = ahead - j.stop[axis];
          if (toLine < -0.5) continue; // over the line
          const l = lightAt(j, axis, tNow);
          if (l === 'red' || (l === 'amber' && toLine > (v.v * v.v) / 8 + 2)) target = Math.min(target, Math.max(0, toLine * 0.5));
        }
      }
      // crossing traffic at junctions and roundabouts: yield to a vehicle across our path just
      // ahead (the lower id has right of way, so two can never wait for each other forever)
      for (const o of fleet) {
        if (o === v || o.jackedUntil || o.id > v.id) continue;
        const ox = o.x - _a.x;
        const oz = o.z - _a.z;
        const ahead = ox * fx + oz * fz;
        if (ahead <= 1 || ahead > 13) continue;
        const lat = Math.abs(ox * fz - oz * fx);
        if (lat > 2.4) continue;
        const c = Math.cos(o.heading - _a.h);
        if (c > 0.5) continue; // same direction: the gap keeping above
        if (c < -0.8 && lat > 1.1) continue; // oncoming, in its own lane
        target = Math.min(target, Math.max(0, (ahead - 6) * 0.6));
      }
      // ... and behind the car Abel drives (no ramming him from behind at the lights)
      if (drive.active) {
        const ox = drive.x - _a.x;
        const oz = drive.z - _a.z;
        const ahead = ox * fx + oz * fz;
        if (ahead > 0 && ahead < 40 && Math.abs(ox * fz - oz * fx) < 1.8) target = Math.min(target, Math.max(0, (ahead - SAFE_GAP + 2) * 0.8));
      }
      const px = playerPosition.x - _a.x;
      const pz = playerPosition.z - _a.z;
      const ahead = px * fx + pz * fz;
      const side = Math.abs(px * fz - pz * fx);
      if (!aboard && ahead > 0 && ahead < spec.length / 2 + 7 && side < spec.width / 2 + 0.8) {
        if (target > 0 && v.v > 3 && !v.stopped && Math.random() < dt * 1.5) horn(v.kind === 'car' ? 'car' : 'heavy', { x: v.x, y: v.y + 1, z: v.z }, 350);
        target = 0;
      }
      if (holding) {
        target = 0;
        v.dwell = Math.max(v.dwell, 0.6);
      }
      if (v.dwell > 0) {
        v.dwell -= dt;
        target = 0;
        // the conductor waits while Abel walks up to the door (up to ~25 s)
        const [ddx, ddz] = L(v).door;
        const dcx = v.x + ddx * Math.cos(v.heading) + ddz * Math.sin(v.heading);
        const dcz = v.z - ddx * Math.sin(v.heading) + ddz * Math.cos(v.heading);
        const near = Math.hypot(playerPosition.x - dcx, playerPosition.z - dcz);
        if (spec.fare && ride.vehicle < 0 && v.dwell < 0.6 && v.waited < 25 && near < 10) {
          v.dwell = 0.6;
          v.waited += dt;
        }
        // the conductor calls the stage, and invites Abel when he walks up
        if (spec.fare && !aboard && ride.vehicle < 0) {
          if (near < 7 && !v.invited) {
            v.invited = true;
            v.callAt = nowMs;
            conductorSays(v, 'invite');
          } else if (near < 32 && nowMs - v.callAt > 7000 + (v.id % 5) * 900 && nowMs - lastCall.at > 3200) {
            v.callAt = nowMs;
            lastCall.at = nowMs;
            conductorSays(v, 'call');
          }
        }
        if (v.dwell <= 0) {
          v.waited = 0;
          if (aboard && occ.phase === 'seated') conductorSays(v, 'depart', true);
        }
      }
      // speed like a driver's foot: the wanted acceleration eases in and out (no instant flips
      // between full throttle and full brake: that read as a jerky, "lagging" stop-start)
      const want = THREE.MathUtils.clamp((target - v.v) * 1.1, -6.5, spec.kind === 'car' ? 2.6 : 1.8);
      v.accel = THREE.MathUtils.damp(v.accel, want, want < v.accel ? 7 : 2.5, dt);
      v.v = Math.max(0, v.v + v.accel * dt);
      if (target < 0.05 && v.v < 0.15) {
        v.v = 0;
        v.accel = Math.min(v.accel, 0);
      }
      v.s = (v.s + v.v * dt) % rs.length;
      v.stopped = v.v < 0.3;
      // the sliding door: rolled open at a stage (the conductor works the door), shut before moving
      const wantDoor = aboard && occ.phase !== 'seated' ? Math.max(occ.door, 1) : v.stopped && (v.dwell > 0.8 || holding) ? 1 : 0;
      v.doorOpen = THREE.MathUtils.clamp(v.doorOpen + Math.sign(wantDoor - v.doorOpen) * dt * 1.6, 0, 1);
      if (v.v > 0.5 && v.doorOpen > 0) v.doorOpen = Math.max(0, v.doorOpen - dt * 3);
      sampleAt(rs, v.s, _a);
      // stand on both axles: height and pitch from the road under the front and rear wheels
      const gm = geom.get(v.piece)!;
      sampleAt(rs, v.s + gm.front, _b);
      const yf = _b.y;
      const hf = _b.h;
      sampleAt(rs, v.s + gm.rear, _b);
      const yr = _b.y;
      const slope = -Math.atan2(yf - yr, gm.wb);
      // a little dive under braking and squat when pulling away (springs, not a rigid box)
      const dive = THREE.MathUtils.clamp(-v.accel * 0.006, -0.025, 0.03);
      v.pitch = THREE.MathUtils.damp(v.pitch, slope + dive, 8, dt);
      v.x = _a.x;
      v.z = _a.z;
      // origin on the line between the two contact points (no floating on a crest, no sinking in a dip)
      v.y = yr + ((yf - yr) * -gm.rear) / gm.wb;
      v.heading = _a.h;
      // wheels: roll with the road, front pair turned by the curve the vehicle is taking
      v.wheelSpin += v.v * dt;
      let dh = hf - _a.h;
      dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      v.steer = THREE.MathUtils.damp(v.steer, THREE.MathUtils.clamp(dh * 1.6, -0.5, 0.5), 6, dt);
      // physics body
      const b = bodies.current[v.id];
      if (b) {
        b.setNextKinematicTranslation({ x: v.x, y: v.y + spec.height / 2, z: v.z });
        _q.setFromAxisAngle(_up, v.heading);
        b.setNextKinematicRotation(_q);
      }
      // the ride frame for Abel (as rendered this frame)
      if (aboard && occ.ride?.kind === 'transit') setFrame(vehicleMatrix(v, _world));
      // door interactable: only while stopped and not already riding
      const it = doors[v.id]!;
      const [dx, dz] = L(v).door;
      const c = Math.cos(v.heading);
      const sn = Math.sin(v.heading);
      it.x = v.x + dx * c + dz * sn;
      it.z = v.z - dx * sn + dz * c;
      it.radius = carries(v) && v.stopped && ride.vehicle < 0 && occ.phase === 'walking' ? 4.5 : 0;
      // driver's door (Kenya: right-hand drive, local -X) for carjacking private cars
      const jk = jacks[v.id]!;
      const jx = -(spec.width / 2 + 0.6);
      jk.x = v.x + jx * c + 0.4 * sn;
      jk.z = v.z - jx * sn + 0.4 * c;
      jk.radius = v.kind === 'car' && v.v < 6 && !drive.active && ride.vehicle < 0 && occ.phase === 'walking' ? 2.2 : 0;
    }

    // ---------- rendering (LOD by camera distance, hysteresis) ----------
    for (const b of batches) b.mesh.count = 0;
    for (const v of fleet) {
      if (v.jackedUntil) continue;
      const d = Math.hypot(v.x - camera.position.x, v.z - camera.position.z);
      let lod = v.lod;
      while (lod > 0 && d < LOD_IN[lod - 1]!) lod--;
      while (lod < 3 && d > LOD_OUT[lod]!) lod++;
      if (ride.vehicle === v.id) lod = 0;
      v.lod = lod;
      if (lod > 2) continue;
      const world = vehicleMatrix(v, _world);
      for (const b of batches) {
        if (b.piece !== v.piece || b.lod !== lod) continue;
        if (b.targets) {
          for (const w of b.targets) {
            sharedWheelLocal(_wl, b.part, w, v.wheelSpin / w.radius, w.front ? v.steer : 0);
            _m.multiplyMatrices(world, _wl);
            b.mesh.setMatrixAt(b.mesh.count++, _m);
          }
          continue;
        }
        if (b.part.door) {
          // only the kerb-side passenger door moves (a matatu's sliding door)
          const dd = b.part.door;
          doorLocal(_wl, b.part, dd.kind === 'slide' || (dd.side > 0 && dd.front && SPECS[v.kind].fare > 0 && v.kind !== 'matatu') ? v.doorOpen : 0);
          _m.multiplyMatrices(world, _wl);
        } else _m.multiplyMatrices(world, b.part.local);
        b.mesh.setMatrixAt(b.mesh.count++, _m);
      }
    }
    for (const b of batches) {
      b.mesh.visible = b.mesh.count > 0;
      if (b.mesh.visible) b.mesh.instanceMatrix.needsUpdate = true;
    }

    // ---------- sound ----------
    const ac = audioContext();
    if (!ac || ac.state !== 'running') return;
    const a = audio.current;
    a.t += dt;
    // positions every frame (smoothed by the panners), assignment 4x a second
    for (const [id, vo] of a.voices) {
      const v = fleet[id];
      if (!v) continue;
      setPos(vo.pan, v.x, v.y + 0.8, v.z);
      const throttle = THREE.MathUtils.clamp(v.accel / 1.5, 0, 1) + (v.v > 0.5 && v.accel > -0.5 ? 0.2 : 0);
      vo.eng.update(v.v, throttle, true, ride.vehicle === id ? 0.55 : 1);
    }
    for (const [id, mu] of a.music) {
      const v = fleet[id];
      if (v) setPos(mu.pan, v.x, v.y + 1.5, v.z);
    }
    if (a.t < 0.25) return;
    a.t = 0;
    const lx = camera.position.x;
    const lz = camera.position.z;
    const ranked = fleet
      .filter((v) => !v.jackedUntil)
      .map((v) => ({ v, d: Math.hypot(v.x - lx, v.z - lz) - (ride.vehicle === v.id ? 1e4 : 0) }))
      .sort((x, y) => x.d - y.d);
    // engines: the nearest few get a voice; voices fade out, never cut
    const want = new Set(ranked.filter((r) => r.d < ENGINE_RANGE).slice(0, ENGINE_VOICES).map((r) => r.v.id));
    for (const [id, vo] of a.voices) {
      if (!want.has(id)) {
        vo.eng.dispose(0.8);
        a.voices.delete(id);
      }
    }
    const eb = bus('engines');
    for (const id of want) {
      if (a.voices.has(id) || !eb) continue;
      const v = fleet[id]!;
      const pan = panner(ac, 6, 1.1);
      setPos(pan, v.x, v.y + 0.8, v.z);
      pan.connect(eb);
      const eng = new EngineVoice(ac, engineKindOf(v.kind), pan);
      a.voices.set(id, { eng, pan });
    }
    // music: the real nganya mixes (systems/audio/tracks) from the vehicles' speakers. Nganyas
    // blast it and are heard furthest; matatus play it too, quieter; buses only inside. From
    // outside it's muffled through the body (low-pass) with a boomy bass; inside it's the full mix.
    // At most three vehicles play at once (the nearest), and the one you ride always does.
    const wb = bus('world');
    const range = (k: VehicleKind) => (k === 'nganya' ? MUSIC_RANGE : k === 'matatu' ? 30 : 0);
    const wantMusic = new Set(
      ranked.filter((r) => r.d < range(r.v.kind) || ride.vehicle === r.v.id).slice(0, 3).map((r) => r.v.id),
    );
    for (const v of fleet) {
      const on = wantMusic.has(v.id) && SPECS[v.kind].music !== 'none';
      if (on && !v.sound && wb) {
        const lp = ac.createBiquadFilter();
        lp.type = 'lowpass';
        const boom = ac.createBiquadFilter(); // big bass bins in the back of a nganya
        boom.type = 'lowshelf';
        boom.frequency.value = 110;
        boom.gain.value = v.kind === 'nganya' ? 7 : 3;
        const pan = panner(ac, 5, 1.4);
        setPos(pan, v.x, v.y + 1.5, v.z);
        boom.connect(lp).connect(pan).connect(wb);
        const player = new TrackPlayer(ac, v.id * 7919 + 13);
        player.output.connect(boom);
        // can't stream (old browser, offline): the original synth set takes over
        player.onError = () => {
          if (v.sound !== player) return;
          player.dispose();
          const synth = new SoundSystem(ac, v.id);
          synth.output.connect(boom);
          v.sound = synth;
        };
        v.sound = player;
        a.music.set(v.id, { lp, pan });
      } else if (!on && v.sound) {
        v.sound.dispose();
        v.sound = null;
        a.music.delete(v.id);
      }
      if (v.sound) {
        const inside = ride.vehicle === v.id && occ.phase !== 'approaching';
        const mu = a.music.get(v.id)!;
        mu.lp.frequency.setTargetAtTime(inside ? 16000 : v.kind === 'nganya' ? 1100 : 800, ac.currentTime, 0.3);
        const vol = inside ? (v.kind === 'nganya' ? 0.85 : v.kind === 'matatu' ? 0.55 : 0.3) : v.kind === 'nganya' ? 0.8 : 0.45;
        v.sound.setVolume(vol);
      }
    }
  }, -50);

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

const lastCall = { at: 0 };
/** Talk on the ride (Abel aboard): conductor and passengers take turns, every 13-22 s. */
const rideTalk = { next: 0, turn: 0 };

/** The passenger door (vehicle-local x, z) of a transit vehicle (tests, debug). */
export const doorOf = (v: VehicleState) => L(v).door;
/** This vehicle stops for passengers (a fare and a real door). */
export const takesPassengers = (v: VehicleState) => carries(v);
/** How many seats its model really has. */
export const seatsOf = (v: VehicleState) => L(v).seats.length;

// ------------------------------------------------------------------- hailing
/** Abel waves at the roadside: the nearest matatu/bus coming along a road beside him pulls over. */
export function hail() {
  if (ride.vehicle >= 0 || drive.active || occ.phase !== 'walking') return; // H is the horn while driving
  playerAnim.action = 'Interact';
  playerAnim.actionUntil = performance.now() + 1400;
  const routes = routeSamples();
  let best: VehicleState | null = null;
  let bestS = 0;
  let bestD = Infinity;
  for (const v of vehicles) {
    if (!carries(v)) continue; // an express (no passenger door) doesn't pull over
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
  // stop so the passenger door (left side) lines up with Abel
  const rs = routes[best.route]!;
  best.hail = (bestS - L(best).door[1] + rs.length) % rs.length;
  eco.toast(`You wave... a ${best.kind === 'nganya' ? 'nganya' : best.kind === 'bus' ? 'bus' : 'matatu'} is coming (${Math.round(bestD)} m away)`);
}

// ------------------------------------------------------------------- boarding / alighting

/**
 * Door -> step -> cabin -> aisle -> seat, all in the vehicle's own coordinates (from its spec:
 * the door, floor and seat positions measured on the model). A matatu's sliding door rolls open,
 * a bus/nganya has a folding door; Abel climbs the step, ducks in and walks to the seat.
 */
function transitRide(v: VehicleState, target: { x: number; z: number; standing: boolean }, hooks: Partial<Ride>): Ride {
  const spec = SPECS[v.kind];
  const lay = L(v);
  const [dx, dz] = lay.door;
  const fy = spec.floorY;
  const ax = lay.aisleX;
  const into = -Math.PI / 2; // facing -X: from the kerb into the vehicle
  const stand = new THREE.Vector3(dx + 0.8, 0, dz);
  const step = new THREE.Vector3(dx + 0.05, fy * 0.5, dz);
  const inside = new THREE.Vector3(dx - 0.4, fy, dz);
  const aisleIn = new THREE.Vector3(ax, fy, dz);
  const aisleSeat = new THREE.Vector3(ax, fy, target.z);
  const seat = new THREE.Vector3(target.x, fy, target.z);
  const along = Math.abs(target.z - dz);
  const walkYaw = target.z < dz ? Math.PI : 0;
  const door = spec.kind === 'matatu' ? 'slidingDoor' : 'doorOpen';
  const board: Key[] = [
    // at the door while it opens (it slides / swings fully open before he steps up)
    { p: stand, yaw: into, clip: 'Interact', ms: 900, sound: door },
    { p: step, yaw: into, clip: 'Walk_Slow_Loop', ms: 420, sound: 'step' },
    { p: inside, yaw: into, clip: 'Walk_Slow_Loop', ms: 420, sound: 'step' },
    { p: aisleIn, yaw: along > 0.3 ? walkYaw : into, clip: 'Walk_Slow_Loop', ms: 300 },
  ];
  if (along > 0.3) board.push({ p: aisleSeat, yaw: walkYaw, clip: 'Walk_Slow_Loop', ms: (along / 0.9) * 1000 });
  if (target.standing) board.push({ p: seat, yaw: 0, clip: 'Idle_Rail_Loop', ms: 500 });
  else board.push({ p: seat, yaw: 0, clip: 'Sitting_Enter', ms: 850 });
  const exit: Key[] = [];
  if (!target.standing) exit.push({ p: aisleSeat, yaw: along > 0.3 ? (walkYaw + Math.PI) % (Math.PI * 2) : -into, clip: 'Sitting_Exit', ms: 800 });
  else exit.push({ p: aisleSeat, yaw: (walkYaw + Math.PI) % (Math.PI * 2), clip: 'Walk_Slow_Loop', ms: 400 });
  if (along > 0.3) exit.push({ p: aisleIn, yaw: (walkYaw + Math.PI) % (Math.PI * 2), clip: 'Walk_Slow_Loop', ms: (along / 0.9) * 1000 });
  exit.push(
    { p: inside, yaw: -into, clip: 'Walk_Slow_Loop', ms: 350 },
    { p: step, yaw: -into, clip: 'Walk_Slow_Loop', ms: 380, sound: 'step' },
    { p: new THREE.Vector3(dx + 0.85, 0, dz), yaw: -into, clip: 'Walk_Loop', ms: 420, sound: 'step' },
  );
  return {
    kind: 'transit',
    stand,
    standYaw: into,
    board,
    seatClip: target.standing ? 'Idle_Rail_Loop' : 'Sitting_Idle_Loop',
    exit,
    cam: { height: spec.height + 0.6, dist: spec.length + 3.5, pitch: 0.22, eye: target.standing ? 1.6 : 1.15 },
    ...hooks,
  };
}

function board(v: VehicleState, world: ReturnType<typeof useRapier>['world'], rapier: ReturnType<typeof useRapier>['rapier']) {
  const spec = SPECS[v.kind];
  if (ride.vehicle >= 0 || !v.stopped || occ.phase !== 'walking' || drive.active || !carries(v)) return;
  // the door side has to be clear to stand at (a pole, a parked car)
  const lay = L(v);
  const [dx, dz] = lay.door;
  const c = Math.cos(v.heading);
  const sn = Math.sin(v.heading);
  const sx = v.x + (dx + 0.8) * c + dz * sn;
  const sz = v.z - (dx + 0.8) * sn + dz * c;
  const spot = standSpot(world, rapier, sx, sz, v.y, (h) => vehicleColliders.has(h), false);
  if (!spot.ok && spot.why !== 'drop') {
    useEconomy.getState().toast("Can't reach the door from here", 'info');
    return;
  }
  const full = v.occupied >= lay.seats.length;
  const target = full
    ? { x: lay.stand[0]![0], z: lay.stand[0]![1], standing: true }
    : { x: lay.seats[v.occupied]![0], z: lay.seats[v.occupied]![1], standing: false };
  ride.vehicle = v.id;
  ride.standing = full;
  v.dwell = Math.max(v.dwell, 1);
  setFrame(vehicleMatrix(v, _world));
  beginApproach(
    transitRide(v, target, {
      onBoard: () => {
        // pay the conductor at the door
        if (!useEconomy.getState().spend(spec.fare, `${v.kind} fare`)) {
          conductorSays(v, 'broke');
          ride.vehicle = -1;
          return false;
        }
        conductorSays(v, full ? 'full' : 'board', true);
        if (!full) {
          ride.seat = v.occupied;
          v.occupied++;
        }
        return true;
      },
      onSeated: () => {
        emit({ type: 'board', vehicle: v.id });
        useEconomy.getState().toast('F to get off at a stop');
      },
      onAbort: () => {
        ride.vehicle = -1;
      },
    }),
  );
}

function alight(v: VehicleState, world: ReturnType<typeof useRapier>['world'], rapier: ReturnType<typeof useRapier>['rapier']) {
  const [dx, dz] = L(v).door;
  vehicleMatrix(v, _world);
  // the kerb right outside the door; if a pole, a bench or a person is there, a step along or out
  let spot: ReturnType<typeof standSpot> = { ok: false, why: 'blocked', ground: v.y };
  for (const [ox, oz] of [[0.85, 0], [0.85, -0.7], [0.85, 0.7], [1.4, 0], [1.4, -0.9], [1.4, 0.9], [2.0, 0]] as const) {
    _f.set(dx + ox, 0, dz + oz).applyMatrix4(_world);
    spot = standSpot(world, rapier, _f.x, _f.z, v.y, (h) => vehicleColliders.has(h));
    if (spot.ok || spot.why === 'traffic') break;
  }
  if (!spot.ok) {
    useEconomy.getState().toast(spot.why === 'traffic' ? 'Conductor: "Ngoja! Gari inapita!" (wait, traffic)' : 'No room to step down here', 'info');
    return;
  }
  const exitAt = new THREE.Vector3(_f.x, spot.ground, _f.z);
  // swap in exit hooks, keep the boarding path (the seat it ends at)
  const r = occ.ride!;
  occ.ride = {
    ...r,
    onExited: () => {
      if (!ride.standing) v.occupied = Math.max(0, v.occupied - 1);
      ride.vehicle = -1;
      ride.seat = -1;
      emit({ type: 'alight', x: exitAt.x, z: exitAt.z });
    },
  };
  conductorSays(v, 'alight', true);
  beginExit(exitAt);
}

// ------------------------------------------------------------------- conductors + passengers
/** Maroon-uniformed conductors at the door of the nearest matatus/buses, and seated passengers
 *  inside the vehicle Abel is riding (so a full matatu really looks full). */
function Crew({ fleet }: { fleet: VehicleState[] }) {
  const conductor = useModel('/models/npc_conductor.glb');
  const npcs = useCharacterModels(NPC_URLS);
  const CREW = 5;
  const PASS = 14;
  const pool = useMemo(() => {
    const make = (src: { scene: THREE.Object3D; animations: THREE.AnimationClip[] }, clips: string[]) => {
      const obj = cloneSkinned(src.scene);
      prepareCharacter(obj, false);
      const mixer = new THREE.AnimationMixer(obj);
      const all = prepareClips(src.animations.map((c) => c.clone()));
      const acts = new Map<string, THREE.AnimationAction>();
      for (const name of clips) {
        const a = all.find((c) => c.name === name) ?? all.find((c) => c.name === 'Idle_Loop');
        if (a) acts.set(name, mixer.clipAction(a));
      }
      const first = acts.get(clips[0]!);
      if (first) {
        first.time = Math.random() * first.getClip().duration;
        first.play();
      }
      obj.visible = false;
      return { obj, mixer, acts, cur: clips[0]! };
    };
    return {
      crew: Array.from({ length: CREW }, () => make(conductor, ['Idle_Talking_Loop', 'Idle_Loop', 'Walk_Loop'])),
      pass: Array.from({ length: PASS }, (_, i) => make(npcs[i % npcs.length]!, ['Sitting_Idle_Loop'])),
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

  const play = (c: (typeof pool.crew)[number], clip: string) => {
    if (c.cur === clip) return;
    const next = c.acts.get(clip);
    if (!next) return;
    next.reset().fadeIn(0.3).play();
    c.acts.get(c.cur)?.fadeOut(0.3);
    c.cur = clip;
  };

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const cam = state.camera.position;
    const near = fleet
      .filter((v) => SPECS[v.kind].fare > 0 && !v.jackedUntil)
      .map((v) => ({ v, d: Math.hypot(v.x - cam.x, v.z - cam.z) }))
      .filter((e) => e.d < 60)
      .sort((a, b) => a.d - b.d);
    pool.crew.forEach((c, i) => {
      const e = near[i];
      c.obj.visible = !!e;
      if (!e) return;
      const v = e.v;
      const spec = SPECS[v.kind];
      const [dx, dz] = L(v).door;
      vehicleMatrix(v, _world);
      // while Abel gets in or out, the conductor steps down onto the kerb behind the door to make
      // room (and takes the fare); otherwise he hangs in the doorway, calling the stage
      const busyDoor = ride.vehicle === v.id && occ.phase !== 'seated';
      if (busyDoor || (v.stopped && v.dwell > 0)) {
        _f.set(dx + 0.7, 0, dz - 1.15).applyMatrix4(_world);
        c.obj.position.copy(_f);
        c.obj.rotation.y = v.heading + (busyDoor ? 0 : Math.PI / 2 - 0.5);
        play(c, busyDoor ? 'Idle_Loop' : 'Idle_Talking_Loop');
      } else {
        _f.set(dx - 0.25, spec.floorY - 0.1, dz - 0.3).applyMatrix4(_world);
        c.obj.position.copy(_f);
        c.obj.rotation.y = v.heading + Math.PI / 2 - 0.4;
        play(c, 'Idle_Loop');
      }
      c.mixer.update(dt);
    });
    const rv = ride.vehicle >= 0 && occ.phase !== 'approaching' ? fleet[ride.vehicle] : undefined;
    pool.pass.forEach((p, i) => {
      // every taken seat except Abel's
      const taken = rv ? rv.occupied : 0;
      if (!rv || i >= taken || i === ride.seat) {
        p.obj.visible = false;
        return;
      }
      const spec = SPECS[rv.kind];
      const seat = L(rv).seats[i];
      if (!seat) {
        p.obj.visible = false;
        return;
      }
      vehicleMatrix(rv, _world);
      _f.set(seat[0], spec.floorY, seat[1]).applyMatrix4(_world);
      p.obj.visible = true;
      p.obj.position.copy(_f);
      p.obj.rotation.set(rv.pitch, rv.heading, 0, 'YXZ');
      p.mixer.update(dt);
    });
  }, -45);
  return <group ref={root} />;
}

export type { VehicleSpec };
