import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { getKTX2Loader } from '../../world/ktx2';

// Abel (temporary MPFB2 stand-in until the approved capture-session likeness, SPEC 5.5).
// Clips are Quaternius UAL (CC0) retargeted onto the MPFB game_engine rig in Blender
// (blender/scripts/build_humans.py + retarget.py). Swapping in the final GLB needs no code changes.

export const ABEL_URL = '/models/abel.glb';

/** Written by the Player each frame, read here: drives clip selection without React renders. */
export const playerAnim = { speed: 0, grounded: true, vy: 0, idleTime: 0 };

const FADE = 0.25;
// Native forward speed of each locomotion clip (m/s), used to scale playback so feet don't slide.
const NATIVE: Record<string, number> = { Walk_Loop: 1.35, Jog_Fwd_Loop: 3.3, Sprint_Loop: 6.2 };
const IDLE_VARIANTS = ['Idle_FoldArms_Loop', 'Idle_TalkingPhone_Loop', 'Idle_Talking_Loop', 'Idle_Loop'];

const clean = (n: string) => n.replace(/\.\d+$/, '');

/** Cut-out materials (hair cards, brows, lashes) must alpha-test, not alpha-blend. */
function prepare(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isMesh) return;
    m.castShadow = true;
    m.receiveShadow = true;
    m.frustumCulled = false; // skinned bounds don't follow the pose; it's one character
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) {
      if (/short0|afro|braid|bob|long0|ponytail|eyebrow|eyelash/i.test(mat.name)) {
        mat.transparent = false;
        mat.alphaTest = 0.5;
        mat.side = THREE.DoubleSide;
        mat.depthWrite = true;
      }
    }
  });
}

export function AbelModel() {
  const gl = useThree((s) => s.gl);
  const gltf = useGLTF(ABEL_URL, false, true, (loader) => {
    loader.setKTX2Loader(getKTX2Loader(gl) as unknown as Parameters<typeof loader.setKTX2Loader>[0]);
  });
  const group = useRef<THREE.Group>(null);

  const { mixer, actions } = useMemo(() => {
    prepare(gltf.scene);
    const mixer = new THREE.AnimationMixer(gltf.scene);
    const actions = new Map<string, THREE.AnimationAction>();
    for (const clip of gltf.animations) {
      const name = clean(clip.name);
      clip.name = name;
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
    if (!grounded && vy > 1.5) want = 'Jump_Start';
    else if (!grounded) want = 'Jump_Loop';
    else if (speed > 5.4) want = 'Sprint_Loop';
    else if (speed > 2.9) want = 'Jog_Fwd_Loop';
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
    const native = NATIVE[s.current];
    const a = actions.get(s.current);
    if (a) a.timeScale = native ? THREE.MathUtils.clamp(speed / native, 0.6, 1.8) : 1;
    mixer.update(dt);
  });

  return <primitive ref={group} object={gltf.scene} />;
}
