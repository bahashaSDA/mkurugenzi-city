import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { getKTX2Loader } from '../../world/ktx2';
import { NATIVE_SPEED, prepareCharacter, prepareClips } from '../characters';
import type { Prop } from '../../game/economy';

// Abel (temporary MPFB2 stand-in until the approved capture-session likeness, SPEC 5.5).
// Locomotion + standing idle: CMU motion capture (real people), retargeted in Blender (mocap.py).
// Gestures (phone, talking, folded arms...): Quaternius UAL upper body over mocap legs.
// Look (tweed jacket, cap, glasses, beard...) from the owner's reference photo (abel_look.py).
// Swapping in the final capture-session GLB needs no code changes.

export const ABEL_URL = '/models/abel.glb';

/** Written by the Player each frame, read here: drives clip selection without React renders. */
export const playerAnim = {
  speed: 0, grounded: true, vy: 0, idleTime: 0, action: '', actionUntil: 0, riding: false, rideClip: '',
  prop: '' as Prop, // held while eating/drinking
};

const FADE = 0.25;
const IDLE_VARIANTS = ['Idle_FoldArms_Loop', 'Idle_TalkingPhone_Loop', 'Idle_Talking_Loop', 'Idle_Loop'];

export function AbelModel() {
  const gl = useThree((s) => s.gl);
  const gltf = useGLTF(ABEL_URL, false, true, (loader) => {
    loader.setKTX2Loader(getKTX2Loader(gl) as unknown as Parameters<typeof loader.setKTX2Loader>[0]);
  });
  const group = useRef<THREE.Group>(null);

  const { mixer, actions } = useMemo(() => {
    prepareCharacter(gltf.scene, true);
    const mixer = new THREE.AnimationMixer(gltf.scene);
    const actions = new Map<string, THREE.AnimationAction>();
    for (const clip of prepareClips(gltf.animations)) {
      const name = clip.name;
      const a = mixer.clipAction(clip);
      if (!name.endsWith('_Loop') && name !== 'Consume') { // Consume repeats: bite after bite
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
      }
      actions.set(name, a);
    }
    return { mixer, actions };
  }, [gltf]);

  // food and drink props in Abel's hands (GTA-style: you see what he is eating)
  const props = useMemo(() => makeProps(gltf.scene), [gltf]);

  const st = useRef({ current: '', idleVariant: 0, idleSwitchAt: 10 });

  useEffect(() => {
    const idle = actions.get('Idle_Loop');
    idle?.play();
    st.current.current = 'Idle_Loop';
    return () => {
      mixer.stopAllAction();
    };
  }, [actions, mixer]);

  useFrame((_, dt) => {
    const s = st.current;
    const { speed, grounded, vy } = playerAnim;
    let want: string;
    if (playerAnim.riding) want = playerAnim.rideClip || 'Sitting_Idle_Loop';
    else if (playerAnim.action && performance.now() < playerAnim.actionUntil) want = playerAnim.action;
    else if (!grounded && vy > 1.5) want = 'Jump_Start';
    else if (!grounded) want = 'Jump_Loop';
    else if (speed > 5.0) want = 'Sprint_Loop';
    else if (speed > 2.6) want = 'Jog_Fwd_Loop';
    else if (speed > 0.25) want = 'Walk_Loop';
    else {
      // Personality when idle (SPEC 8.1): after 10 s, fold arms / check phone / talk to himself.
      playerAnim.idleTime += dt;
      if (playerAnim.idleTime > s.idleSwitchAt) {
        s.idleVariant = (s.idleVariant + 1) % IDLE_VARIANTS.length;
        s.idleSwitchAt = playerAnim.idleTime + 7 + Math.random() * 5;
      }
      want = playerAnim.idleTime > 10 ? IDLE_VARIANTS[s.idleVariant]! : 'Idle_Loop';
    }
    if (speed > 0.25 || !grounded) {
      playerAnim.idleTime = 0;
      s.idleSwitchAt = 10;
    }
    if (want !== s.current && actions.has(want)) {
      const next = actions.get(want)!;
      const prev = actions.get(s.current);
      next.reset().setEffectiveWeight(1).fadeIn(want.startsWith('Jump') ? 0.12 : FADE).play();
      prev?.fadeOut(want.startsWith('Jump') ? 0.12 : FADE);
      s.current = want;
    }
    const native = NATIVE_SPEED[s.current];
    const a = actions.get(s.current);
    if (a) a.timeScale = native ? THREE.MathUtils.clamp(speed / native, 0.6, 1.8) : 1;
    mixer.update(dt);
    const eating = s.current === 'Consume';
    for (const [k, o] of props) o.visible = eating && (playerAnim.prop === k || (k === 'fork' && playerAnim.prop === 'plate'));
  });

  return <primitive ref={group} object={gltf.scene} />;
}

/** Simple food/drink meshes parented to the hand bones (sizes in metres, bone scale compensated). */
function makeProps(root: THREE.Object3D): Map<string, THREE.Object3D> {
  const out = new Map<string, THREE.Object3D>();
  const right = root.getObjectByName('hand_r');
  const left = root.getObjectByName('hand_l');
  if (!right || !left) return out;
  root.updateMatrixWorld(true);
  const ws = new THREE.Vector3();
  const mat = (c: string, rough = 0.5, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
    new THREE.MeshStandardMaterial({ color: c, roughness: rough, ...extra });
  const add = (name: string, bone: THREE.Object3D, parts: THREE.Mesh[], offset: [number, number, number], rot: [number, number, number] = [0, 0, 0]) => {
    const g = new THREE.Group();
    for (const p of parts) g.add(p);
    bone.getWorldScale(ws);
    g.scale.setScalar(1 / ws.x);
    g.position.set(offset[0] / ws.x, offset[1] / ws.x, offset[2] / ws.x);
    g.rotation.set(...rot);
    g.visible = false;
    bone.add(g);
    out.set(name, g);
  };
  const mesh = (geo: THREE.BufferGeometry, m: THREE.Material, y = 0) => {
    const o = new THREE.Mesh(geo, m);
    o.position.y = y;
    o.castShadow = true;
    return o;
  };
  // glass soda bottle: dark glass, red label band, metal crown
  add('bottle', right, [
    mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.14, 12), mat('#3b1f12', 0.15, { transparent: true, opacity: 0.85 }), 0),
    mesh(new THREE.CylinderGeometry(0.031, 0.031, 0.05, 12), mat('#b3121f', 0.6), 0),
    mesh(new THREE.CylinderGeometry(0.012, 0.028, 0.08, 10), mat('#3b1f12', 0.15), 0.11),
  ], [0, 0.09, 0.03]);
  add('cup', right, [mesh(new THREE.CylinderGeometry(0.042, 0.034, 0.09, 14), mat('#f2efe6', 0.3)), mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.005, 14), mat('#b98b5a', 0.4), 0.04)], [0, 0.08, 0.04]);
  add('fruit', right, [mesh(new THREE.SphereGeometry(0.045, 12, 10).scale(1, 1.25, 1), mat('#e2a52a', 0.6))], [0, 0.08, 0.03]);
  add('snack', right, [mesh(new THREE.BoxGeometry(0.1, 0.03, 0.08), mat('#d59a45', 0.8))], [0, 0.08, 0.03]);
  // plate of food in the left hand, fork in the right
  add('plate', left, [
    mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.015, 20), mat('#f4f4f0', 0.25)),
    mesh(new THREE.SphereGeometry(0.085, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.35, 1), mat('#c8913e', 0.8), 0.006),
  ], [0, 0.08, 0.06], [Math.PI / 2, 0, 0]);
  add('fork', right, [mesh(new THREE.BoxGeometry(0.008, 0.16, 0.004), mat('#c9ccd0', 0.25, { metalness: 0.9 }))], [0, 0.08, 0.02]);
  return out;
}
