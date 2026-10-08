import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { CapsuleCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { useGame } from '../../app/store';
import { getKTX2Loader } from '../../world/ktx2';
import { NATIVE_SPEED, prepareCharacter, prepareClips } from '../characters';
import { playerPosition } from '../player/playerState';
import { getHubLayout, KERB_E, KERB_W } from '../../districts/hub/layout';

// Street life (VISUAL_OVERHAUL 19 / SPEC 8.6): MPFB2 pedestrians with retargeted CC0 clips.
//   walkers  - stroll the pavements under the verandas, both directions, step aside for Abel
//   standers - wait at kiosks and shopfronts: talk, phone, fold arms; nod when Abel walks past
//   sitters  - on the plastic chairs by the kiosks
// Pool size per tier; only people near the camera animate (SPEC 8.6 LOD), the rest are hidden.

const VARIANTS = ['mama_mboga', 'hustler', 'office', 'student', 'elder', 'young_woman', 'worker', 'auntie'];
const URLS = VARIANTS.map((v) => `/models/npc_${v}.glb`);
const POOL = { low: 10, mid: 18, high: 28 } as const;
const ANIMATE_DIST = 70;
const STAND_CLIPS = ['Idle_Talking_Loop', 'Idle_TalkingPhone_Loop', 'Idle_FoldArms_Loop', 'Idle_Loop'];

type Role = 'walk' | 'stand' | 'sit';
interface Agent {
  role: Role;
  variant: number;
  x: number;
  z: number;
  rotY: number;
  laneX: number; // walkers: pavement line they follow
  dir: 1 | -1;
  speed: number;
  clip: string;
  nodded: boolean;
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function planAgents(count: number): Agent[] {
  const r = rng(91);
  const layout = getHubLayout();
  const chairs = layout.filter((p) => p.piece === 'plastic_chair');
  const kiosks = layout.filter((p) => p.piece.startsWith('kiosk'));
  const shops = layout.filter((p) => p.piece.startsWith('shop_'));
  const out: Agent[] = [];
  const base = (role: Role, x: number, z: number, rotY: number, clip: string): Agent => ({
    role, variant: Math.floor(r() * VARIANTS.length), x, z, rotY, laneX: x, dir: r() < 0.5 ? 1 : -1,
    speed: 1.1 + r() * 0.4, clip, nodded: false,
  });
  // ~55% walkers concentrated near the spawn end of the street, ~30% standers, ~15% sitters
  for (let i = 0; i < count; i++) {
    const k = i / count;
    if (k < 0.55) {
      const west = r() < 0.5;
      const lane = west ? KERB_W - 2.6 + (r() - 0.5) * 0.8 : KERB_E + 2.6 + (r() - 0.5) * 0.8;
      const a = base('walk', lane, -60 + r() * 110, 0, 'Walk_Loop');
      a.speed = 0.9 + r() * 0.6; // real pedestrian pace: 0.9-1.5 m/s
      a.clip = a.speed < 1.2 ? 'Walk_Slow_Loop' : 'Walk_Loop';
      out.push(a);
    } else if (k < 0.85) {
      const atKiosk = r() < 0.5 && kiosks.length;
      const p = atKiosk ? kiosks[Math.floor(r() * kiosks.length)]! : shops[Math.floor(r() * shops.length)]!;
      // stand ~1.6 m in front of the serving hatch / shop door, facing it
      const fx = Math.sin(p.rotY);
      const fz = Math.cos(p.rotY);
      const d = atKiosk ? 2.2 : 6.0;
      out.push(base('stand', p.x + fx * d + (r() - 0.5), p.z + fz * d + (r() - 0.5) * 1.5, p.rotY + Math.PI,
        STAND_CLIPS[Math.floor(r() * STAND_CLIPS.length)]!));
    } else if (chairs.length) {
      const c = chairs[Math.floor(r() * chairs.length)]!;
      out.push(base('sit', c.x, c.z, c.rotY + Math.PI, 'Sitting_Idle_Loop'));
    }
  }
  return out;
}

const _toPlayer = new THREE.Vector3();

function Person({ agent, source }: { agent: Agent; source: { scene: THREE.Object3D; animations: THREE.AnimationClip[] } }) {
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
      if (name === 'Yes') {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = false;
      }
      actions.set(name, a);
    }
    return { obj, mixer, actions };
  }, [source, tier]);

  const st = useRef({ cur: '', x: agent.x, z: agent.z, rotY: agent.rotY, pause: 0, nodUntil: 0, t: Math.random() * 10 });

  const play = (name: string, fade = 0.3) => {
    const s = st.current;
    if (s.cur === name || !actions.has(name)) return;
    const next = actions.get(name)!;
    next.reset().fadeIn(fade).play();
    actions.get(s.cur)?.fadeOut(fade);
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
    const cam = state.camera.position;
    const far = Math.hypot(s.x - cam.x, s.z - cam.z) > ANIMATE_DIST;
    g.visible = !far;
    if (far && agent.role !== 'walk') return;
    s.t += dt;
    _toPlayer.set(playerPosition.x - s.x, 0, playerPosition.z - s.z);
    const pd = _toPlayer.length();

    if (agent.role === 'walk') {
      // step aside / pause when Abel is right in the path
      const ahead = (playerPosition.z - s.z) * agent.dir;
      const blocked = pd < 1.6 && ahead > 0;
      if (blocked) {
        s.pause = 0.8;
        s.x += Math.sign(s.x - playerPosition.x || 1) * dt * 0.8;
      }
      if (s.pause > 0) {
        s.pause -= dt;
        play('Idle_Loop', 0.2);
      } else {
        play(agent.clip, 0.25);
        s.z += agent.dir * agent.speed * dt;
        s.x += (agent.laneX - s.x) * Math.min(1, dt * 0.6); // drift back to the pavement line
        if (s.z > 95 || s.z < -145) agent.dir = (agent.dir * -1) as 1 | -1; // turn at the street ends
        const want = agent.dir > 0 ? 0 : Math.PI;
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
    g.position.set(s.x, 0, s.z);
    g.rotation.y = s.rotY;
    body.current?.setNextKinematicTranslation({ x: s.x, y: 0.9, z: s.z });
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
  const gl = useThree((s) => s.gl);
  const tier = useGame((s) => s.tier);
  const gltfs = useGLTF(URLS, false, true, (loader) => {
    loader.setKTX2Loader(getKTX2Loader(gl) as unknown as Parameters<typeof loader.setKTX2Loader>[0]);
  });
  const agents = useMemo(() => planAgents(POOL[tier]), [tier]);
  return (
    <>
      {agents.map((a, i) => (
        <Person key={`${tier}-${i}`} agent={a} source={gltfs[a.variant]!} />
      ))}
    </>
  );
}
