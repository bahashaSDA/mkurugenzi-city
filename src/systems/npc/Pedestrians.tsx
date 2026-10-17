import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CapsuleCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { useGame } from '../../app/store';
import { NATIVE_SPEED, prepareCharacter, prepareClips } from '../characters';
import { playerPosition } from '../player/playerState';
import { getHubLayout, KERB_E, KERB_W, MARKET } from '../../districts/hub/layout';
import { KIBERA_ALLEYS, ROOM_D, ROOM_W } from '../../districts/kibera/layout';
import { ROADS } from '../../config/roads';
import { heightAt } from '../../world/heights';
import { register } from '../../game/interactables';
import { useEconomy } from '../../game/economy';
import { useMissions } from '../../game/missions';
import { emit } from '../../game/events';
import { say } from '../audio/voice';
import { pickTalk, STREET_BARKS, STREET_TALK, streetVoice } from '../../game/streetTalk';
import { addCombatant, fightBrain, keepCombatant, type Combatant } from '../combat/combat';
import { useCharacterModels } from '../characterModels';

/** One-shot clips (fights): play once and hold the last pose. */
export const ONE_SHOT = new Set(['Yes', 'Knockdown', 'GetUp', 'Punch_R', 'Punch_L', 'Punch_Cross', 'Kick']);

// Street life (VISUAL_OVERHAUL 19 / SPEC 8.6): MPFB2 pedestrians with retargeted CC0 clips.
// A GTA-style ambient crowd that follows Abel: a fixed pool of people, each one respawning out of
// sight near him when he leaves it behind, so the avenue, the market and Kibera are all busy.
//   walkers  - pavements, market aisles, Kibera alleys and murram lanes; step aside for Abel
//   standers - kiosk/shop customers, mama mboga and buyers at the stalls, neighbours at Kibera
//              doorways: talk, phone, fold arms; nod when the Mkurugenzi walks past
//   sitters  - on the plastic chairs by the kiosks
// Only people near the camera are drawn and animated (SPEC 8.6 LOD).

// ~90% of the crowd wears Abel's own Mkurugenzi range (owner request); the rest are the mtaa's
// regulars (mama mboga, boda riders, students...). Fewer variants load on lower tiers.
const FANS = ['fan_hoodie_black', 'fan_lady_black', 'fan_tee_burgundy', 'fan_hoodie_sand', 'fan_lady_burgundy', 'fan_tee_botanical',
  'fan_suit_coffee', 'fan_lady_grey', 'fan_hoodie_charcoal', 'fan_tee_navy', 'fan_lady_tee', 'fan_suit_ivory'];
const LOCALS = ['mama_mboga', 'hustler', 'student', 'elder', 'auntie', 'worker', 'office', 'young_woman'];
const VARIANT_COUNT = { low: [4, 2], mid: [8, 3], high: [12, 4] } as const;
export const variantsFor = (tier: 'low' | 'mid' | 'high') => [...FANS.slice(0, VARIANT_COUNT[tier][0]), ...LOCALS.slice(0, VARIANT_COUNT[tier][1])];
const POOL = { low: 10, mid: 22, high: 36 } as const;
const SHADOW_DIST = 20; // only people close to the camera cast shadows (each one is ~7 draw calls)
const DETAIL_DIST = 30; // eyes, brows and lashes are a few pixels beyond this
const ANIMATE_DIST = 70;
const RESPAWN_DIST = 85; // left this far behind -> reappear near Abel
const SPAWN_MIN = 8;
const SPAWN_MAX = 60;
const STAND_CLIPS = ['Idle_Talking_Loop', 'Idle_TalkingPhone_Loop', 'Idle_FoldArms_Loop', 'Idle_Loop'];

type Role = 'walk' | 'stand' | 'sit';
interface Agent {
  role: Role;
  variant: number;
  x: number;
  z: number;
  rotY: number;
  seg: number; // walkers: segment index, distance u along it, lateral offset
  u: number;
  lat: number;
  anchor: number; // standers/sitters: anchor index
  dir: 1 | -1;
  speed: number;
  clip: string;
  nodded: boolean;
}
interface Anchor {
  x: number;
  z: number;
  rotY: number;
  sit: boolean;
}
type Seg = [number, number, number, number];

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const rnd = rng(4242);

/** Where people can stand, sit and walk, built once from the world layout. */
function buildWorld() {
  const layout = getHubLayout(); // also fills KIBERA_ALLEYS
  const r = rng(91);
  const anchors: Anchor[] = [];
  const stand = (x: number, z: number, rotY: number) => anchors.push({ x, z, rotY, sit: false });
  for (const p of layout) {
    const fx = Math.sin(p.rotY);
    const fz = Math.cos(p.rotY);
    if (p.piece.startsWith('kiosk') || p.piece === 'chips_booth') {
      // customers ~2 m in front of the serving hatch, facing it
      stand(p.x + fx * 2.2 + (r() - 0.5), p.z + fz * 2.2 + (r() - 0.5), p.rotY + Math.PI);
    } else if (p.piece.startsWith('shop_')) {
      stand(p.x + fx * 6 + (r() - 0.5), p.z + fz * 6 + (r() - 0.5) * 1.5, p.rotY + Math.PI);
    } else if (p.piece === 'plastic_chair') {
      anchors.push({ x: p.x, z: p.z, rotY: p.rotY + Math.PI, sit: true });
    } else if (p.piece.startsWith('market_stall')) {
      stand(p.x - fx * 0.9, p.z - fz * 0.9, p.rotY); // mama mboga behind her stall
      if (r() < 0.6) stand(p.x + fx * 1.3 + (r() - 0.5) * 0.6, p.z + fz * 1.3, p.rotY + Math.PI); // a buyer
    } else if (p.piece.startsWith('kib_row')) {
      // neighbours outside their doors (rows run along local X, doors on local +Z)
      const n = Number(p.piece.slice(7));
      const c = Math.cos(p.rotY);
      const sn = Math.sin(p.rotY);
      for (let i = 0; i < n; i++) {
        if (r() > 0.3) continue;
        const lx = (i - (n - 1) / 2) * ROOM_W;
        const lz = ROOM_D / 2 + 0.45;
        stand(p.x + lx * c + lz * sn, p.z - lx * sn + lz * c, p.rotY + (r() - 0.5) * 1.6);
      }
    }
  }
  const segs: Seg[] = [];
  for (const lane of [KERB_W - 2.6, KERB_E + 2.6]) segs.push([lane, -145, lane, 95]);
  const [mx0, mz0, mx1, mz1] = MARKET;
  for (let az = mz0 + 6; az < mz1 - 3; az += 9) segs.push([mx0 + 2, az, mx1 - 2, az]);
  for (const [x, z0, z1] of KIBERA_ALLEYS) segs.push([x, z0, x, z1]);
  for (const rd of ROADS) {
    if (rd.kind !== 'murram') continue;
    for (let i = 0; i < rd.pts.length - 1; i++) segs.push([...rd.pts[i]!, ...rd.pts[i + 1]!] as Seg);
  }
  // spatial grid over anchors (32 m cells) for quick "near Abel" queries
  const grid = new Map<string, number[]>();
  anchors.forEach((a, i) => {
    const k = `${Math.floor(a.x / 32)},${Math.floor(a.z / 32)}`;
    let l = grid.get(k);
    if (!l) grid.set(k, (l = []));
    l.push(i);
  });
  return { anchors, segs, grid, used: new Set<number>() };
}
type World = ReturnType<typeof buildWorld>;

const _cam = new THREE.Vector3();
const _fwd = new THREE.Vector3();
/** Respawn spot check: not too close, not too far, and not popping in right in front of the camera. */
function goodSpot(x: number, z: number, camera: THREE.Camera | null) {
  const d = Math.hypot(x - playerPosition.x, z - playerPosition.z);
  if (d < SPAWN_MIN || d > SPAWN_MAX) return false;
  if (!camera) return true;
  camera.getWorldPosition(_cam);
  camera.getWorldDirection(_fwd);
  const vx = x - _cam.x;
  const vz = z - _cam.z;
  const vd = Math.hypot(vx, vz);
  return vd > 38 || (vx * _fwd.x + vz * _fwd.z) / vd < 0.35;
}

/** Move an agent to a fresh spot near Abel. Returns false if nothing suitable was found. */
function respawn(a: Agent, w: World, camera: THREE.Camera | null): boolean {
  if (a.role !== 'walk') {
    const cx = Math.floor(playerPosition.x / 32);
    const cz = Math.floor(playerPosition.z / 32);
    const near: number[] = [];
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) for (const k of w.grid.get(`${cx + i},${cz + j}`) ?? []) near.push(k);
    for (let t = 0; t < 24 && near.length; t++) {
      const k = near[Math.floor(rnd() * near.length)]!;
      const an = w.anchors[k]!;
      if (w.used.has(k) || an.sit !== (a.role === 'sit') || !goodSpot(an.x, an.z, camera)) continue;
      w.used.delete(a.anchor);
      w.used.add(k);
      a.anchor = k;
      a.x = an.x;
      a.z = an.z;
      a.rotY = an.rotY;
      a.nodded = false;
      return true;
    }
    if (a.role === 'stand') return false;
    a.role = 'stand'; // no free chairs here: stand instead
    return respawn(a, w, camera);
  }
  for (let t = 0; t < 24; t++) {
    const i = Math.floor(rnd() * w.segs.length);
    const [ax, az, bx, bz] = w.segs[i]!;
    const dx = bx - ax;
    const dz = bz - az;
    const L = Math.hypot(dx, dz);
    const tp = Math.max(0, Math.min(1, ((playerPosition.x - ax) * dx + (playerPosition.z - az) * dz) / (L * L)));
    const u = Math.max(0, Math.min(1, tp + ((rnd() - 0.5) * 80) / L));
    const lat = (rnd() - 0.5) * 1.2;
    const x = ax + dx * u - (dz / L) * lat;
    const z = az + dz * u + (dx / L) * lat;
    if (!goodSpot(x, z, camera)) continue;
    w.used.delete(a.anchor);
    a.anchor = -1;
    a.seg = i;
    a.u = u * L;
    a.lat = lat;
    a.x = x;
    a.z = z;
    a.dir = rnd() < 0.5 ? 1 : -1;
    return true;
  }
  return false;
}

function planAgents(count: number, w: World, nFans: number, nLocals: number): Agent[] {
  const r = rng(91);
  const out: Agent[] = [];
  for (let i = 0; i < count; i++) {
    const k = i % 10;
    const role: Role = k < 5 ? 'walk' : k < 9 ? 'stand' : 'sit';
    const speed = 0.9 + r() * 0.6; // real pedestrian pace: 0.9-1.5 m/s
    const clip = role === 'walk' ? (speed < 1.2 ? 'Walk_Slow_Loop' : 'Walk_Loop') : role === 'sit' ? 'Sitting_Idle_Loop' : STAND_CLIPS[Math.floor(r() * STAND_CLIPS.length)]!;
    const variant = r() < 0.9 ? Math.floor(r() * nFans) : nFans + Math.floor(r() * nLocals);
    const a: Agent = { role, variant, x: 0, z: 0, rotY: 0, seg: 0, u: 0, lat: 0, anchor: -1, dir: 1, speed, clip, nodded: false };
    respawn(a, w, null);
    out.push(a);
  }
  return out;
}

// at most two respawns per rendered frame (cheap, but avoids a burst after a long bus ride)
const budget = { frame: -1, n: 0 };

const _toPlayer = new THREE.Vector3();

// Talking to people (E) and passers-by: Nairobi Sheng (src/game/streetTalk), voiced. Names
// match the person's model (a woman gets a woman's name and voice).
const NAMES_F = ['Wanjiru', 'Akinyi', 'Shiko', 'Mama Atieno', 'Njeri', 'Wambui'];
const NAMES_M = ['Otieno', 'Kevo', 'Mzee Kamau', 'Brayo', 'Baraka', 'Juma'];
/** One passer-by remark at a time across the whole street, every 7-16 s at most. */
const bark = { next: performance.now() + 6000 };
const CASTING = ['Audition? Mimi? Sawa, nitakuja!', 'Wueh! Nitakuwa kwa movie ya Mkurugenzi? Niko ready!', 'Sema siku na saa, nitafika na rafiki yangu.'];

function Person({ agent, world, source }: { agent: Agent; world: World; source: { scene: THREE.Object3D; animations: THREE.AnimationClip[] } }) {
  const tier = useGame((s) => s.tier);
  const body = useRef<RapierRigidBody>(null);
  const holder = useRef<THREE.Group>(null);
  const { obj, mixer, actions } = useMemo(() => {
    const obj = cloneSkinned(source.scene);
    prepareCharacter(obj, tier !== 'low');
    const mixer = new THREE.AnimationMixer(obj);
    const actions = new Map<string, THREE.AnimationAction>();
    for (const clip of prepareClips(source.animations.map((c) => c.clone()))) {
      const name = clip.name;
      const a = mixer.clipAction(clip);
      if (ONE_SHOT.has(name)) {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = name !== 'Yes';
      }
      actions.set(name, a);
    }
    return { obj, mixer, actions };
  }, [source, tier]);

  const st = useRef({ cur: '', x: agent.x, z: agent.z, rotY: agent.rotY, pause: 0, nodUntil: 0, t: Math.random() * 10, talkUntil: 0, shadow: true, detail: true, fighting: false, clipUntil: 0 });
  const female = /lady|mama|auntie|woman/.test(variantsFor(tier)[agent.variant] ?? '');
  const name = useMemo(() => {
    const pool = female ? NAMES_F : NAMES_M;
    return pool[Math.floor(Math.random() * pool.length)]!;
  }, [female]);
  const voice = streetVoice(name, female);
  // fights: every pedestrian can be hit, fight back, run, fall and get up
  const fighter = useMemo<Combatant>(() => addCombatant({ x: agent.x, z: agent.z, tag: 'street', hp: 55 + Math.random() * 40, name }), [agent, name]);
  useEffect(() => keepCombatant(fighter), [fighter]);
  const talk = useMemo(
    () => ({
      id: `npc-${Math.random().toString(36).slice(2)}`, x: 1e9, z: 1e9, radius: 0, label: 'Talk', key: 'KeyE' as const, priority: 1,
      use: () => {
        const s = st.current;
        s.talkUntil = s.t + 5;
        const area = useEconomy.getState().area.toLowerCase();
        const casting = useMissions.getState().active === 'casting' && area.includes('market');
        const pos = { x: s.x, y: heightAt(s.x, s.z) + 1.6, z: s.z };
        if (casting) say({ who: voice, name, text: CASTING[Math.floor(Math.random() * CASTING.length)]!, pos });
        else {
          const l = pickTalk(STREET_TALK);
          say({ who: voice, name, text: l.sw, en: l.en, pos });
        }
        emit({ type: 'talk', npc: 0, area });
        talk.radius = 0; // one chat per person per encounter
        setTimeout(() => (talk.radius = 1.9), 20000);
      },
    }),
    [name],
  );
  useEffect(() => {
    talk.radius = agent.role === 'sit' ? 0 : 1.9;
    return register(talk);
  }, [talk, agent.role]);

  const play = (name: string, fade = 0.3, restart = false) => {
    const s = st.current;
    if ((s.cur === name && !restart) || !actions.has(name)) return;
    const next = actions.get(name)!;
    next.reset().fadeIn(fade).play();
    if (s.cur !== name) actions.get(s.cur)?.fadeOut(fade);
    s.cur = name;
  };

  useEffect(() => {
    const a = actions.get(agent.clip);
    if (a) {
      a.time = Math.random() * a.getClip().duration; // desync identical clips
      a.play();
      st.current.cur = agent.clip;
    }
    return () => {
      mixer.stopAllAction();
    };
  }, [actions, mixer, agent.clip]);

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const s = st.current;
    const g = holder.current;
    if (!g) return;
    if (Math.hypot(s.x - playerPosition.x, s.z - playerPosition.z) > RESPAWN_DIST) {
      const frame = state.gl.info.render.frame;
      if (budget.frame !== frame) {
        budget.frame = frame;
        budget.n = 0;
      }
      if (budget.n < 2 && fighter.state !== 'down' && respawn(agent, world, state.camera)) {
        budget.n++;
        Object.assign(fighter, { state: 'calm', hp: fighter.maxHp, knockedOut: false, clip: '', pendingHit: 0 });
        s.x = agent.x;
        s.z = agent.z;
        s.rotY = agent.rotY;
        if (agent.role === 'stand' && !STAND_CLIPS.includes(agent.clip)) agent.clip = 'Idle_Talking_Loop'; // ex-sitter
        play(agent.clip, 0.01);
      }
    }
    const cam = state.camera.position;
    const camD = Math.hypot(s.x - cam.x, s.z - cam.z);
    const far = camD > ANIMATE_DIST;
    // a passing remark, in Sheng, when Abel walks by (one voice on the street at a time)
    const now = performance.now();
    if (now > bark.next && !far && s.t > s.talkUntil && fighter.state === 'calm') {
      const dP = Math.hypot(s.x - playerPosition.x, s.z - playerPosition.z);
      if (dP > 2.5 && dP < 11) {
        bark.next = now + 7000 + Math.random() * 9000;
        const l = pickTalk(STREET_BARKS);
        say({ who: voice, name, text: l.sw, en: l.en, pos: { x: s.x, y: heightAt(s.x, s.z) + 1.6, z: s.z }, subtitle: false });
        s.talkUntil = s.t + 2.5;
      }
    }
    g.visible = !far;
    const wantShadow = camD < SHADOW_DIST && tier !== 'low';
    const wantDetail = camD < DETAIL_DIST;
    if (wantShadow !== s.shadow || wantDetail !== s.detail) {
      s.shadow = wantShadow;
      s.detail = wantDetail;
      obj.traverse((o) => {
        if (!(o as THREE.Mesh).isMesh) return;
        o.castShadow = wantShadow;
        if (/eye|brow|lash/i.test(o.name)) o.visible = wantDetail;
      });
    }
    if (far && agent.role !== 'walk' && fighter.state === 'calm') return;
    s.t += dt;
    // ---- fights: the fight brain drives this person while they fight, flee, lie hurt or get up
    fighter.x = s.x;
    fighter.z = s.z;
    fighter.rotY = s.rotY;
    const brain = fightBrain(fighter, dt);
    if (brain) {
      s.fighting = true;
      talk.radius = 0;
      s.x += brain.vx * dt;
      s.z += brain.vz * dt;
      fighter.x = s.x;
      fighter.z = s.z;
      if (brain.face !== null) {
        let d = brain.face - s.rotY;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        s.rotY += d * Math.min(1, dt * 8);
      }
      play(brain.clip, ONE_SHOT.has(brain.clip) ? 0.08 : 0.2, ONE_SHOT.has(brain.clip) && fighter.clipUntil !== s.clipUntil);
      s.clipUntil = fighter.clipUntil;
      const act = actions.get(brain.clip);
      if (act) act.timeScale = brain.rate;
      const y = heightAt(s.x, s.z);
      g.position.set(s.x, y, s.z);
      g.rotation.y = s.rotY;
      const since = performance.now() - fighter.hitAt;
      g.rotation.x = since < 300 ? -Math.sin((since / 300) * Math.PI) * 0.18 : 0; // flinch
      body.current?.setNextKinematicTranslation({ x: s.x, y: y + (fighter.state === 'down' ? -5 : 0.9), z: s.z });
      mixer.update(dt);
      return;
    }
    if (s.fighting) {
      // back to normal life where they ended up: stand there until they respawn out of sight
      s.fighting = false;
      g.rotation.x = 0;
      agent.role = 'stand';
      agent.anchor = -1;
      agent.rotY = s.rotY;
      agent.clip = 'Idle_Loop';
      play('Idle_Loop', 0.3);
      talk.radius = 1.9;
    }
    _toPlayer.set(playerPosition.x - s.x, 0, playerPosition.z - s.z);
    const pd = _toPlayer.length();
    talk.x = s.x;
    talk.z = s.z;
    (talk as { y?: number }).y = playerPosition.y > -20 + heightAt(s.x, s.z) ? undefined : -1e6; // not through an interior floor
    if (s.t < s.talkUntil) {
      // chatting with Abel: stop, face him, talk with the hands
      play('Idle_Talking_Loop', 0.25);
      let d = Math.atan2(_toPlayer.x, _toPlayer.z) - s.rotY;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      s.rotY += d * Math.min(1, dt * 4);
      const y = heightAt(s.x, s.z);
      g.position.set(s.x, y, s.z);
      g.rotation.y = s.rotY;
      body.current?.setNextKinematicTranslation({ x: s.x, y: y + 0.9, z: s.z });
      mixer.update(dt);
      return;
    }
    if (s.cur === 'Idle_Talking_Loop' && agent.clip !== 'Idle_Talking_Loop') play(agent.role === 'walk' ? agent.clip : agent.clip, 0.3);

    if (agent.role === 'walk') {
      const [ax, az, bx, bz] = world.segs[agent.seg]!;
      const L = Math.hypot(bx - ax, bz - az);
      const ux = (bx - ax) / L;
      const uz = (bz - az) / L;
      // step aside / pause when Abel is right in the path
      const ahead = (_toPlayer.x * ux + _toPlayer.z * uz) * agent.dir;
      if (pd < 1.6 && ahead > 0) {
        s.pause = 0.8;
        agent.lat += (agent.lat >= 0 ? 1 : -1) * dt * 0.8;
      }
      if (s.pause > 0) {
        s.pause -= dt;
        play('Idle_Loop', 0.2);
      } else {
        play(agent.clip, 0.25);
        agent.u += agent.dir * agent.speed * dt;
        if (agent.u > L || agent.u < 0) {
          agent.u = Math.max(0, Math.min(L, agent.u));
          agent.dir = (agent.dir * -1) as 1 | -1; // turn back at the end of the lane
        }
        agent.lat *= 1 - Math.min(1, dt * 0.3); // drift back towards the lane line
        s.x = ax + ux * agent.u - uz * agent.lat;
        s.z = az + uz * agent.u + ux * agent.lat;
        const want = Math.atan2(ux * agent.dir, uz * agent.dir);
        let d = want - s.rotY;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        s.rotY += d * Math.min(1, dt * 3);
      }
      const a = actions.get(agent.clip);
      if (a) a.timeScale = agent.speed / (NATIVE_SPEED[agent.clip] ?? 1.3);
    } else if (agent.role === 'stand') {
      // People recognise the Mkurugenzi (SPEC 8.1): turn to him and nod as he passes.
      if (pd < 4 && !agent.nodded) {
        agent.nodded = true;
        s.nodUntil = s.t + 2.4;
        play('Yes', 0.2);
      }
      if (pd > 8) agent.nodded = false;
      if (s.t > s.nodUntil && s.cur === 'Yes') play(agent.clip, 0.4);
      const want = pd < 6 ? Math.atan2(_toPlayer.x, _toPlayer.z) : agent.rotY;
      let d = want - s.rotY;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      s.rotY += d * Math.min(1, dt * 2);
    }
    const y = far ? 0 : heightAt(s.x, s.z); // Kibera is on a hillside
    g.position.set(s.x, y, s.z);
    g.rotation.y = s.rotY;
    body.current?.setNextKinematicTranslation({ x: s.x, y: y + 0.9, z: s.z });
    if (!far) mixer.update(dt);
  });

  return (
    <>
      <group ref={holder}>
        <primitive object={obj} />
      </group>
      <RigidBody ref={body} type="kinematicPosition" colliders={false} position={[agent.x, 0.9, agent.z]}>
        <CapsuleCollider args={[0.55, 0.28]} />
      </RigidBody>
    </>
  );
}

export function Pedestrians() {
  const tier = useGame((s) => s.tier);
  const urls = useMemo(() => variantsFor(tier).map((v) => `/models/npc_${v}.glb`), [tier]);
  const gltfs = useCharacterModels(urls);
  const world = useMemo(() => buildWorld(), []);
  const agents = useMemo(() => planAgents(POOL[tier], world, VARIANT_COUNT[tier][0], VARIANT_COUNT[tier][1]), [tier, world]);
  return (
    <>
      {agents.map((a, i) => (
        <Person key={`${tier}-${i}`} agent={a} world={world} source={gltfs[a.variant]!} />
      ))}
    </>
  );
}
