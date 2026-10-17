import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { prepareCharacter, prepareClips } from '../characters';
import { playerPosition } from '../player/playerState';
import { useEconomy } from '../../game/economy';
import { listen } from '../../game/events';
import { say, stopVoice, type Speaker } from '../audio/voice';
import { useCharacterModels } from '../characterModels';

const clipCache = new WeakMap<object, THREE.AnimationClip[]>();

// Shop attendants: every place that sells to Abel has someone behind the counter (kiosks, the
// chips booth, market stalls, beach kiosks, the duka and hoteli interiors). They stand (or sit on
// their bench) at a real working spot behind the counter, idle naturally, turn to look at Abel when
// he comes close and greet him, talk while he orders, nod and thank him when he pays, and tell him
// when he can't afford something. The shop menu only opens through them.
//
// Spots are registered by the districts that own the counters; only the nearest few are given a
// body (cloned, animated), so a street full of kiosks costs a handful of characters.

export interface ServiceSpot {
  id: string;
  x: number;
  y: number; // feet height
  z: number;
  facing: number; // towards the customer
  model: 'auntie' | 'mama_mboga' | 'worker' | 'young_woman' | 'hustler' | 'elder' | 'office' | 'student';
  pose?: 'stand' | 'sit';
  name: string; // subtitle name
  who: Speaker;
  shop: string; // catalog SHOPS id ('' = not selling: a teacher, a student)
  /** what they say when Abel walks up (default: a shop greeting) */
  greet?: string[];
}

const spots = new Map<string, ServiceSpot>();
export function registerSpot(s: ServiceSpot) {
  spots.set(s.id, s);
  return () => {
    spots.delete(s.id);
  };
}

/** Which attendant is serving Abel right now (the shop menu is open through them). */
export const session = { spot: '' };

const GREET = ['Karibu!', 'Karibu, Mkurugenzi!', 'Niaje boss, karibu.', 'Sasa! Ungependa nini?'];
const THANKS = ['Asante sana!', 'Furahia!', 'Asante, karibu tena.', 'Poa sana, asante!'];
const BROKE = ['Pole, pesa haitoshi.', 'Hiyo ni zaidi ya ulicho nacho, boss.'];
const BYE = ['Karibu tena!', 'Siku njema!', 'Tutaonana!'];
const pick = (a: string[]) => a[Math.floor(Math.random() * a.length)]!;

/** Ask the attendant at `spotId` to serve: they greet you and the menu opens. */
export function serve(spotId: string) {
  const s = spots.get(spotId);
  if (!s) return;
  if (Math.hypot(playerPosition.x - s.x, playerPosition.z - s.z) > 3.6) return; // talk to them from the counter, not across the street
  session.spot = spotId;
  const eco = useEconomy.getState();
  eco.openShop(s.shop);
  say({ who: s.who, name: s.name, text: shopGreeting(s.shop), pos: { x: s.x, y: s.y + 1.6, z: s.z } });
  react(spotId, 'talk');
}

let greetings: Record<string, string> = {};
export function setGreetings(g: Record<string, string>) {
  greetings = g;
}
const shopGreeting = (shop: string) => greetings[shop] ?? pick(GREET);

// reactions requested from outside (purchase results), consumed by the animator
const reactions = new Map<string, { kind: 'nod' | 'talk' | 'no'; at: number }>();
function react(id: string, kind: 'nod' | 'talk' | 'no') {
  reactions.set(id, { kind, at: performance.now() });
}
/** Ask the attendant serving Abel to do something (the barber working: 'talk' gestures). */
export function attendantReact(kind: 'nod' | 'talk' | 'no') {
  if (session.spot) react(session.spot, kind);
}
/** Where the attendant serving Abel stands (for their voice), or null. */
export function servingSpot(): ServiceSpot | null {
  return spots.get(session.spot) ?? null;
}

const URLS = ['auntie', 'mama_mboga', 'worker', 'young_woman', 'hustler', 'elder', 'office', 'student'] as const;
const MAX_ALIVE = 12; // a classroom: teacher + students
const RANGE = 55;

interface Body {
  spot: string;
  obj: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  acts: Map<string, THREE.AnimationAction>;
  cur: string;
  yaw: number;
  greeted: boolean;
  until: number; // a one-shot (nod / talk) plays until then
  kind: 'nod' | 'talk' | 'no' | '';
}

export function Attendants() {
  const gltfs = useCharacterModels(URLS.map((u) => `/models/npc_${u}.glb`));
  const root = useRef<THREE.Group>(null);
  const bodies = useRef(new Map<string, Body>());
  const t = useRef(0);

  // purchase results -> the attendant serving reacts (and says so)
  useEffect(
    () =>
      listen((e) => {
        const s = spots.get(session.spot);
        if (!s || !useEconomy.getState().shop) return;
        const pos = { x: s.x, y: s.y + 1.6, z: s.z };
        if (e.type === 'buy') {
          react(s.id, 'nod');
          say({ who: s.who, name: s.name, text: pick(THANKS), pos });
        } else if (e.type === 'buyFailed') {
          react(s.id, 'no');
          say({ who: s.who, name: s.name, text: pick(BROKE), pos });
        }
      }),
    [],
  );
  // menu closed: goodbye
  useEffect(
    () =>
      useEconomy.subscribe((st, prev) => {
        if (prev.shop && !st.shop && session.spot) {
          const s = spots.get(session.spot);
          session.spot = '';
          if (s && Math.hypot(playerPosition.x - s.x, playerPosition.z - s.z) < 6) {
            stopVoice(s.who);
            say({ who: s.who, name: s.name, text: pick(BYE), pos: { x: s.x, y: s.y + 1.6, z: s.z } });
          }
        }
      }),
    [],
  );

  const make = (s: ServiceSpot): Body => {
    const src = gltfs[URLS.indexOf(s.model)]!;
    const obj = cloneSkinned(src.scene);
    prepareCharacter(obj, true);
    const mixer = new THREE.AnimationMixer(obj);
    // clips are shared by every mixer: prepare them once per model, not on every spawn (a hitch)
    let clips = clipCache.get(src);
    if (!clips) clipCache.set(src, (clips = prepareClips(src.animations.map((c) => c.clone()))));
    const acts = new Map<string, THREE.AnimationAction>();
    for (const name of ['Idle_Loop', 'Idle_FoldArms_Loop', 'Idle_Talking_Loop', 'Yes', 'Sitting_Idle_Loop', 'Sitting_Talking_Loop']) {
      const c = clips.find((k) => k.name === name);
      if (!c) continue;
      const a = mixer.clipAction(c);
      if (name === 'Yes') {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
      }
      acts.set(name, a);
    }
    const first = s.pose === 'sit' ? 'Sitting_Idle_Loop' : Math.random() < 0.4 ? 'Idle_FoldArms_Loop' : 'Idle_Loop';
    const a = acts.get(first) ?? acts.get('Idle_Loop');
    if (a) {
      a.time = Math.random() * a.getClip().duration;
      a.play();
    }
    obj.position.set(s.x, s.y, s.z);
    obj.rotation.y = s.facing;
    return { spot: s.id, obj, mixer, acts, cur: a ? first : '', yaw: s.facing, greeted: false, until: 0, kind: '' };
  };

  const play = (b: Body, clip: string) => {
    if (b.cur === clip) return;
    const next = b.acts.get(clip);
    if (!next) return;
    next.reset().fadeIn(0.3).play();
    b.acts.get(b.cur)?.fadeOut(0.3);
    b.cur = clip;
  };

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const g = root.current;
    if (!g) return;
    const live = bodies.current;
    // every ~0.5 s: give bodies to the nearest spots, take them from far ones
    t.current += dt;
    if (t.current > 0.5) {
      t.current = 0;
      const cam = state.camera.position;
      const want = [...spots.values()]
        .map((s) => ({ s, d: Math.hypot(s.x - cam.x, s.z - cam.z) + Math.abs(s.y - cam.y) }))
        .filter((e) => e.d < RANGE)
        .sort((a, b) => a.d - b.d)
        .slice(0, MAX_ALIVE);
      const keep = new Set(want.map((e) => e.s.id));
      for (const [id, b] of live)
        if (!keep.has(id)) {
          g.remove(b.obj);
          b.mixer.stopAllAction();
          live.delete(id);
        }
      for (const { s } of want)
        if (!live.has(s.id)) {
          const b = make(s);
          live.set(s.id, b);
          g.add(b.obj);
        }
    }
    const now = performance.now();
    for (const b of live.values()) {
      const s = spots.get(b.spot);
      if (!s) continue;
      const dx = playerPosition.x - s.x;
      const dz = playerPosition.z - s.z;
      const d = Math.hypot(dx, dz);
      const near = d < 5 && Math.abs(playerPosition.y - 0.85 - s.y) < 2.5;
      // look at Abel when he's at the counter (within a natural turn of their working position)
      let target = s.facing;
      if (near) {
        let rel = Math.atan2(dx, dz) - s.facing;
        rel = Math.atan2(Math.sin(rel), Math.cos(rel));
        target = s.facing + THREE.MathUtils.clamp(rel, -1.1, 1.1);
      }
      let dy = target - b.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      b.yaw += dy * Math.min(1, dt * 4);
      b.obj.rotation.y = b.yaw;
      // a greeting the first time he walks up (and again on his next visit)
      if (near && d < 3.4 && !b.greeted && !useEconomy.getState().shop) {
        b.greeted = true;
        say({ who: s.who, name: s.name, text: pick(s.greet ?? GREET), pos: { x: s.x, y: s.y + 1.6, z: s.z } });
        react(s.id, 'talk');
      } else if (d > 9) b.greeted = false;
      // clip: serving > a one-shot reaction > idle
      const r = reactions.get(s.id);
      if (r) {
        reactions.delete(s.id);
        b.until = now + (r.kind === 'nod' ? 1500 : r.kind === 'no' ? 1800 : 2200);
        b.kind = r.kind;
        if (r.kind === 'nod' && b.cur === 'Yes') b.acts.get('Yes')?.reset().play();
      }
      const serving = session.spot === s.id && !!useEconomy.getState().shop;
      const sit = s.pose === 'sit';
      if (now < b.until && b.kind === 'nod' && !sit) play(b, 'Yes');
      else if (serving || now < b.until) play(b, sit ? 'Sitting_Talking_Loop' : 'Idle_Talking_Loop');
      else play(b, sit ? 'Sitting_Idle_Loop' : near ? 'Idle_Loop' : b.cur === 'Idle_FoldArms_Loop' ? 'Idle_FoldArms_Loop' : 'Idle_Loop');
      b.mixer.update(dt);
    }
  });

  useEffect(
    () => () => {
      for (const b of bodies.current.values()) b.mixer.stopAllAction();
      bodies.current.clear();
    },
    [],
  );
  return <group ref={root} />;
}
