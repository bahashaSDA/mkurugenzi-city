import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { getKTX2Loader } from '../../world/ktx2';
import { NATIVE_SPEED, prepareCharacter, prepareClips } from '../characters';

// Abel (temporary MPFB2 stand-in until the approved capture-session likeness, SPEC 5.5).
// Locomotion + standing idle: CMU motion capture (real people), retargeted in Blender (mocap.py).
// Gestures (phone, talking, folded arms...): Quaternius UAL upper body over mocap legs.
// Look (tweed jacket, cap, glasses, beard...) from the owner's reference photo (abel_look.py).
// Swapping in the final capture-session GLB needs no code changes.

export const ABEL_URL = '/models/abel.glb';

/** Written by the Player each frame, read here: drives clip selection without React renders. */
export const playerAnim = { speed: 0, grounded: true, vy: 0, idleTime: 0, action: '', actionUntil: 0, riding: false, rideClip: '' };

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
      if (!name.endsWith('_Loop')) {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
      }
      actions.set(name, a);
    }
    return { mixer, actions };
  }, [gltf]);

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
  });

  return <primitive ref={group} object={gltf.scene} />;
}
