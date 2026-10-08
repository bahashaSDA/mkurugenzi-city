import { useMemo, useRef } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { CuboidCollider, RigidBody, useRapier, type RapierRigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';

// SPEC 7.1 / 11: giant knock-over "MKURUGENZI" letters at spawn. Dynamic bodies that
// slowly glide home 30 s after being knocked over.

const WORD = 'MKURUGENZI';
const SIZE = 2.2;
const DEPTH = 0.6;
const GAP = 0.35;
const RESET_AFTER_S = 30;
const RESET_DURATION_S = 2;
const ORIGIN_Z = -4;

interface Letter {
  geo: THREE.BufferGeometry;
  half: [number, number, number];
  home: THREE.Vector3;
}

const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _homeQ = new THREE.Quaternion();

export function SpawnLetters() {
  const font = useLoader(FontLoader, '/fonts/droid_sans_bold_caps.typeface.json');
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#FFC72C', roughness: 0.5, metalness: 0.1 }),
    [],
  );

  const letters = useMemo<Letter[]>(() => {
    const out: Letter[] = [];
    const widths: number[] = [];
    const geos = WORD.split('').map((ch) => {
      const g = new TextGeometry(ch, {
        font,
        size: SIZE,
        depth: DEPTH,
        curveSegments: 3,
        bevelEnabled: true,
        bevelThickness: 0.04,
        bevelSize: 0.03,
        bevelSegments: 1,
      });
      g.center();
      g.computeBoundingBox();
      const b = g.boundingBox!;
      widths.push(b.max.x - b.min.x);
      return g;
    });
    const total = widths.reduce((a, w) => a + w, 0) + GAP * (WORD.length - 1);
    let x = -total / 2;
    geos.forEach((g, i) => {
      const b = g.boundingBox!;
      const w = widths[i]!;
      const h = b.max.y - b.min.y;
      const d = b.max.z - b.min.z;
      out.push({ geo: g, half: [w / 2, h / 2, d / 2], home: new THREE.Vector3(x + w / 2, h / 2 + 0.01, ORIGIN_Z) });
      x += w + GAP;
    });
    return out;
  }, [font]);

  return (
    <>
      {letters.map((l, i) => (
        <PhysicsLetter key={i} letter={l} material={material} />
      ))}
    </>
  );
}

function PhysicsLetter({ letter, material }: { letter: Letter; material: THREE.Material }) {
  const body = useRef<RapierRigidBody>(null);
  const { rapier } = useRapier();
  const st = useRef({ knockedAt: -1, resetStart: -1, fromP: new THREE.Vector3(), fromQ: new THREE.Quaternion(), check: 0 });

  useFrame((state) => {
    const rb = body.current;
    if (!rb) return;
    const t = state.clock.elapsedTime;
    const s = st.current;

    if (s.resetStart >= 0) {
      const k = Math.min(1, (t - s.resetStart) / RESET_DURATION_S);
      const e = k * k * (3 - 2 * k); // smoothstep
      _p.lerpVectors(s.fromP, letter.home, e);
      _p.y += Math.sin(k * Math.PI) * 1.2; // little hop on the way home
      _q.slerpQuaternions(s.fromQ, _homeQ.identity(), e);
      rb.setNextKinematicTranslation(_p);
      rb.setNextKinematicRotation(_q);
      if (k >= 1) {
        s.resetStart = -1;
        s.knockedAt = -1;
        rb.setBodyType(rapier.RigidBodyType.Dynamic, true);
        rb.setLinvel({ x: 0, y: 0, z: 0 }, false);
        rb.setAngvel({ x: 0, y: 0, z: 0 }, false);
        rb.sleep();
      }
      return;
    }

    // Displacement check twice a second is plenty.
    if (t - s.check < 0.5) return;
    s.check = t;
    const p = rb.translation();
    const r = rb.rotation();
    const moved =
      Math.abs(p.x - letter.home.x) + Math.abs(p.z - letter.home.z) + Math.abs(p.y - letter.home.y) > 0.3 ||
      1 - Math.abs(r.w) > 0.01;
    if (!moved) {
      s.knockedAt = -1;
      return;
    }
    if (s.knockedAt < 0) s.knockedAt = t;
    if (t - s.knockedAt > RESET_AFTER_S) {
      s.fromP.set(p.x, p.y, p.z);
      s.fromQ.set(r.x, r.y, r.z, r.w);
      s.resetStart = t;
      rb.setBodyType(rapier.RigidBodyType.KinematicPositionBased, true);
    }
  });

  return (
    <RigidBody ref={body} colliders={false} position={letter.home.toArray()} density={35} friction={0.8} canSleep>
      <CuboidCollider args={letter.half} />
      <mesh geometry={letter.geo} material={material} castShadow receiveShadow />
    </RigidBody>
  );
}
