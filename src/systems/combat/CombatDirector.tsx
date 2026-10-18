import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CapsuleCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { onKeyPress, input } from '../input';
import { playerAnim } from '../player/AbelModel';
import { playerPosition } from '../player/playerState';
import { heightAt } from '../../world/heights';
import { prepareCharacter, prepareClips } from '../characters';
import { ONE_SHOT } from '../npc/Pedestrians';
import { addCombatant, combatants, fightBrain, flee, playerAttack, keepCombatant, mugging, startFight, updateCombat, useStreetSpawns, type Combatant, type StreetMood } from './combat';
import { useCharacterModels } from '../characterModels';
import { KIBERA } from '../../world/heights';
import { KIBERA_ALLEYS } from '../../districts/kibera/layout';
import { ROADS } from '../../config/roads';
import { occ } from '../vehicles/occupancy';
import { ride } from '../vehicles/state';
import { bike, drive } from '../driving/state';
import { useHealth } from '../../game/health';
import { useCutscene } from '../../game/cutscene';
import { useEconomy } from '../../game/economy';
import { playerView } from '../player/playerState';
import { clock, lightsOn } from '../../world/clock';
import { say } from '../audio/voice';

/** Attack keys, the combat clock, and Abel's guard stance. */
export function CombatDirector() {
  useEffect(() => {
    const offs = [
      onKeyPress('Mouse0', () => playerAttack('punch')),
      onKeyPress('KeyR', () => playerAttack('punch')),
      onKeyPress('KeyQ', () => playerAttack('kick')),
    ];
    return () => offs.forEach((f) => f());
  }, []);
  const mug = useRef({ inside: 0, next: 50 + Math.random() * 40 });
  useFrame((_, rawDt) => {
    muggings(mug.current, Math.min(rawDt, 0.1));
    updateCombat();
    useStreetSpawns.getState().prune();
    // raise the guard when asked, or automatically while someone is squaring up nearby
    let threat = false;
    for (const c of combatants.values()) {
      if (c.state === 'fight' && Math.hypot(c.x - playerPosition.x, c.z - playerPosition.z) < 6) {
        threat = true;
        break;
      }
    }
    playerAnim.guard = input.guard || threat;
  });
  return null;
}

// ------------------------------------------------------------------ Kibera muggings
// Walk Kibera's lanes on foot and sooner or later a couple of guys come up an alley for your
// wallet (more often after dark). Fight them off, or lose part of your cash: knock down the one
// who ran with it to get it back. Never in a vehicle, indoors, in a cutscene or right after one.

/** walkable spots in Kibera: alley centre lines and the murram lanes */
const KIBERA_WALKS: [number, number, number, number][] = [];
function kiberaWalks() {
  if (KIBERA_WALKS.length) return KIBERA_WALKS;
  for (const [x, z0, z1] of KIBERA_ALLEYS) KIBERA_WALKS.push([x, z0, x, z1]);
  for (const rd of ROADS) {
    if (rd.kind !== 'murram' || !rd.id.startsWith('kibera')) continue;
    for (let i = 0; i < rd.pts.length - 1; i++) KIBERA_WALKS.push([...rd.pts[i]!, ...rd.pts[i + 1]!] as [number, number, number, number]);
  }
  return KIBERA_WALKS;
}

/** A spot on a lane 12-22 m from Abel, preferably behind him (they come up on you). */
function ambushSpot(): { x: number; z: number } | null {
  let best: { x: number; z: number; score: number } | null = null;
  const fx = Math.sin(playerView.facing);
  const fz = Math.cos(playerView.facing);
  for (const [ax, az, bx, bz] of kiberaWalks()) {
    const len = Math.hypot(bx - ax, bz - az);
    for (let t = 0; t <= len; t += 3) {
      const x = ax + ((bx - ax) * t) / len;
      const z = az + ((bz - az) * t) / len;
      const d = Math.hypot(x - playerPosition.x, z - playerPosition.z);
      if (d < 12 || d > 22) continue;
      const behind = -((x - playerPosition.x) * fx + (z - playerPosition.z) * fz) / d; // 1 = right behind
      const score = behind + Math.random() * 0.6;
      if (!best || score > best.score) best = { x, z, score };
    }
  }
  return best;
}

function muggings(st: { inside: number; next: number }, dt: number) {
  const p = playerPosition;
  const inKibera = p.x > KIBERA.x0 && p.x < KIBERA.x1 && p.z > KIBERA.z0 && p.z < KIBERA.z1;
  const onFoot = occ.phase === 'walking' && !drive.active && !bike.active && ride.vehicle < 0 && !playerAnim.swimming;
  const outdoors = Math.abs(p.y - heightAt(p.x, p.z)) < 6; // interiors sit 60 m under their door
  // an active mugging ends when the gang is gone (down or fled) or Abel got well away
  if (mugging.active) {
    let left = 0;
    for (const c of combatants.values()) if (c.mugger && c.state !== 'down' && Math.hypot(c.x - p.x, c.z - p.z) < 45) left++;
    if (!left && performance.now() - mugging.startedAt > 4000) {
      mugging.active = false;
      mugging.robbed = false;
      st.next = 240 + Math.random() * 180; // a few minutes before the next one
      st.inside = 0;
    }
    return;
  }
  if (!inKibera || !onFoot || !outdoors || useCutscene.getState().active || useHealth.getState().wasted) return;
  // after dark the lanes are twice as dangerous
  st.inside += dt * (1 + lightsOn(clock.hours));
  if (mugging.force) {
    mugging.force = false;
    st.inside = st.next;
  }
  if (st.inside < st.next) return;
  if (useEconomy.getState().money < 50) {
    st.inside = st.next - 30; // nothing worth taking: try again later
    return;
  }
  const at = ambushSpot();
  if (!at) return;
  const n = Math.random() < 0.35 ? 3 : 2;
  const add = useStreetSpawns.getState().add;
  for (let i = 0; i < n; i++) add(at.x + (i - (n - 1) / 2) * 1.2, at.z + (i % 2) * 0.9, 'mug');
  mugging.active = true;
  mugging.robbed = false;
  mugging.startedAt = performance.now();
  const l = [
    { sw: 'Wewe! Toa pesa yote, haraka!', en: 'You! Hand over all the money, quick!' },
    { sw: 'Simama hapo. Leta simu na wallet!', en: 'Stop right there. Phone and wallet!' },
    { sw: 'Mkurugenzi, leo umeingia mtaa mbaya. Toa!', en: 'Mkurugenzi, wrong lane today. Pay up!' },
  ][Math.floor(Math.random() * 3)]!;
  say({ who: 'man3', name: 'Mugger', text: l.sw, en: l.en, pos: { x: at.x, y: heightAt(at.x, at.z) + 1.6, z: at.z } });
  useEconomy.getState().toast('Muggers! Fight back (R punch, Q kick, hold guard) or run', 'info');
}

const FIGHTER_VARIANTS = ['hustler', 'worker', 'office', 'young_woman'].map((v) => `/models/npc_${v}.glb`);

/** Mission opponents: spawned around a spot, hostile once Abel comes close; knock-outs count. */
export function MissionFighters({ x, z, count, toughness, onDone }: { x: number; z: number; count: number; toughness: number; onDone?: () => void }) {
  const gltfs = useCharacterModels(FIGHTER_VARIANTS);
  const spots = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const a = (i / count) * Math.PI * 2 + Math.random() * 0.6;
        const r = 3 + Math.random() * 4;
        return { x: x + Math.cos(a) * r, z: z + Math.sin(a) * r, v: i % gltfs.length };
      }),
    [x, z, count, gltfs.length],
  );
  void onDone;
  return (
    <>
      {spots.map((p, i) => (
        <Fighter key={i} x={p.x} z={p.z} source={gltfs[p.v]!} toughness={toughness} />
      ))}
    </>
  );
}

/** People an event threw into the street (a carjacked driver): angry or scared. */
export function StreetBrawlers() {
  const list = useStreetSpawns((s) => s.list);
  const gltfs = useCharacterModels(FIGHTER_VARIANTS);
  return (
    <>
      {list.map((p, i) => (
        <Fighter key={p.id} x={p.x} z={p.z} source={gltfs[i % gltfs.length]!} toughness={0.9} tag="street" mood={p.mood} />
      ))}
    </>
  );
}

interface FighterProps {
  x: number;
  z: number;
  source: { scene: THREE.Object3D; animations: THREE.AnimationClip[] };
  toughness: number;
  tag?: 'mission' | 'street';
  mood?: StreetMood;
}

function Fighter({ x, z, source, toughness, tag = 'mission', mood = 'fight' }: FighterProps) {
  const holder = useRef<THREE.Group>(null);
  const marker = useRef<THREE.Mesh>(null);
  const body = useRef<RapierRigidBody>(null);
  const { obj, mixer, actions } = useMemo(() => {
    const obj = cloneSkinned(source.scene);
    prepareCharacter(obj, true);
    const mixer = new THREE.AnimationMixer(obj);
    const actions = new Map<string, THREE.AnimationAction>();
    for (const clip of prepareClips(source.animations.map((c) => c.clone()))) {
      const a = mixer.clipAction(clip);
      if (ONE_SHOT.has(clip.name)) {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
      }
      actions.set(clip.name, a);
    }
    return { obj, mixer, actions };
  }, [source]);
  const me = useMemo<Combatant>(() => {
    const c = addCombatant({ x, z, tag, hp: 70 * toughness, toughness });
    if (tag === 'street') {
      if (mood === 'mug') {
        c.mugger = true;
        c.hp = 60;
        c.maxHp = 60;
        startFight(c);
      } else if (mood === 'fight') startFight(c);
      else flee(c, 14000);
    }
    return c;
  }, [x, z, toughness, tag, mood]);
  useEffect(() => keepCombatant(me), [me]);
  const st = useRef({ cur: '', clipUntil: 0 });
  const play = (name: string, restart: boolean) => {
    const s = st.current;
    if ((s.cur === name && !restart) || !actions.has(name)) return;
    actions.get(name)!.reset().fadeIn(ONE_SHOT.has(name) ? 0.08 : 0.2).play();
    if (s.cur !== name) actions.get(s.cur)?.fadeOut(0.2);
    s.cur = name;
  };
  useEffect(() => {
    play('Fight_Idle_Loop', true);
    return () => {
      mixer.stopAllAction();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mixer]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const g = holder.current;
    if (!g) return;
    if (tag === 'mission' && me.state === 'calm' && Math.hypot(me.x - playerPosition.x, me.z - playerPosition.z) < 22) startFight(me);
    const b = fightBrain(me, dt) ?? { vx: 0, vz: 0, face: Math.atan2(playerPosition.x - me.x, playerPosition.z - me.z), clip: 'Fight_Idle_Loop', rate: 1 };
    me.x += b.vx * dt;
    me.z += b.vz * dt;
    if (b.face !== null) {
      let d = b.face - me.rotY;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      me.rotY += d * Math.min(1, dt * 8);
    }
    play(b.clip, ONE_SHOT.has(b.clip) && me.clipUntil !== st.current.clipUntil);
    st.current.clipUntil = me.clipUntil;
    const a = actions.get(b.clip);
    if (a) a.timeScale = b.rate;
    const y = heightAt(me.x, me.z);
    g.position.set(me.x, y, me.z);
    g.rotation.y = me.rotY;
    const since = performance.now() - me.hitAt;
    g.rotation.x = since < 300 ? -Math.sin((since / 300) * Math.PI) * 0.18 : 0;
    body.current?.setNextKinematicTranslation({ x: me.x, y: y + (me.state === 'down' ? -5 : 0.9), z: me.z });
    if (marker.current) marker.current.visible = tag === 'mission' && me.state !== 'down';
    mixer.update(dt);
  });

  return (
    <>
      <group ref={holder}>
        <primitive object={obj} />
        {/* red marker over a mission opponent (GTA style) */}
        <mesh ref={marker} position={[0, 2.25, 0]} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[0.14, 0.28, 4]} />
          <meshBasicMaterial color="#e0302a" />
        </mesh>
      </group>
      <RigidBody ref={body} type="kinematicPosition" colliders={false} position={[x, 0.9, z]}>
        <CapsuleCollider args={[0.55, 0.28]} />
      </RigidBody>
    </>
  );
}
