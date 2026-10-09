import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { CapsuleCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { onKeyPress, input } from '../input';
import { playerAnim } from '../player/AbelModel';
import { playerPosition } from '../player/playerState';
import { getKTX2Loader } from '../../world/ktx2';
import { heightAt } from '../../world/heights';
import { prepareCharacter, prepareClips } from '../characters';
import { ONE_SHOT } from '../npc/Pedestrians';
import { addCombatant, combatants, fightBrain, flee, playerAttack, removeCombatant, startFight, updateCombat, useStreetSpawns, type Combatant } from './combat';

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
  useFrame(() => {
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

const FIGHTER_VARIANTS = ['hustler', 'worker', 'office', 'young_woman'].map((v) => `/models/npc_${v}.glb`);

/** Mission opponents: spawned around a spot, hostile once Abel comes close; knock-outs count. */
export function MissionFighters({ x, z, count, toughness, onDone }: { x: number; z: number; count: number; toughness: number; onDone?: () => void }) {
  const gl = useThree((s) => s.gl);
  const gltfs = useGLTF(FIGHTER_VARIANTS, false, true, (loader) => {
    loader.setKTX2Loader(getKTX2Loader(gl) as unknown as Parameters<typeof loader.setKTX2Loader>[0]);
  });
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
  const gl = useThree((s) => s.gl);
  const list = useStreetSpawns((s) => s.list);
  const gltfs = useGLTF(FIGHTER_VARIANTS, false, true, (loader) => {
    loader.setKTX2Loader(getKTX2Loader(gl) as unknown as Parameters<typeof loader.setKTX2Loader>[0]);
  });
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
  mood?: 'flee' | 'fight';
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
      if (mood === 'fight') startFight(c);
      else flee(c, 14000);
    }
    return c;
  }, [x, z, toughness, tag, mood]);
  useEffect(() => () => removeCombatant(me.id), [me]);
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
