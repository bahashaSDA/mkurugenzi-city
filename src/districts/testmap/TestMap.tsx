import { useMemo } from 'react';
import { CuboidCollider, HeightfieldCollider, RigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { WORLD_HALF } from '../../config/world';
import { kerbTexture, murramTexture, tarmacTexture } from '../../world/proceduralTextures';

// Phase 0 test map: verifies the controller against every collision case in SPEC 8.1 / 9
// (walls, steps <= 0.35 m, steps > 0.35 m, 30° and 55° slopes, stairs, kerbs, poles).
//
// Collider rule learned here: never use very large primitive colliders. Rapier's shape casts
// lose precision against a 1.6 km cuboid and the character controller sank ~17 cm into it
// while walking. Ground is a heightfield (exact, and ready for real terrain); long walls and
// kerbs are split into short segments.

const HF_SUBDIV = 64; // 25 m grid; flat for now, real terrain heights arrive with the hub terrain
const SEGMENT = 50; // max collider length for long thin features, m

/** Evenly spaced segment centres covering [-len/2, len/2]. */
function segments(len: number, seg = SEGMENT): number[] {
  const n = Math.max(1, Math.ceil(len / seg));
  return Array.from({ length: n }, (_, i) => -len / 2 + (len / n) * (i + 0.5));
}

function Ground() {
  const murram = useMemo(() => {
    const t = murramTexture().clone();
    t.repeat.set(WORLD_HALF / 2, WORLD_HALF / 2); // ~4 m per tile
    t.needsUpdate = true;
    return t;
  }, []);
  const heights = useMemo(() => new Array<number>((HF_SUBDIV + 1) * (HF_SUBDIV + 1)).fill(0), []);
  const wall = segments(WORLD_HALF * 2, 200);
  return (
    <RigidBody type="fixed" colliders={false}>
      <HeightfieldCollider args={[HF_SUBDIV, HF_SUBDIV, heights, { x: WORLD_HALF * 2, y: 1, z: WORLD_HALF * 2 }]} />
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[WORLD_HALF * 2, WORLD_HALF * 2]} />
        <meshStandardMaterial map={murram} roughness={0.95} />
      </mesh>
      {/* World boundary walls (SPEC 9): invisible, so nobody falls out of the world. */}
      {wall.map((c) => (
        <group key={c}>
          <CuboidCollider args={[100, 20, 1]} position={[c, 20, -WORLD_HALF - 1]} />
          <CuboidCollider args={[100, 20, 1]} position={[c, 20, WORLD_HALF + 1]} />
          <CuboidCollider args={[1, 20, 100]} position={[-WORLD_HALF - 1, 20, c]} />
          <CuboidCollider args={[1, 20, 100]} position={[WORLD_HALF + 1, 20, c]} />
        </group>
      ))}
    </RigidBody>
  );
}

/** Central avenue (N-S) with painted kerbs. Kerbs are 0.15 m: the controller must step up. */
function Avenue() {
  const len = 400;
  const width = 8;
  const tex = useMemo(() => {
    const t = tarmacTexture().clone();
    t.repeat.set(1, len / 8);
    t.needsUpdate = true;
    return t;
  }, []);
  const kerb = useMemo(() => {
    const t = kerbTexture().clone();
    t.repeat.set(len / 2, 1);
    t.needsUpdate = true;
    return t;
  }, []);
  const x = 14;
  return (
    <group position={[x, 0, -100]}>
      <mesh rotation-x={-Math.PI / 2} position-y={0.02} receiveShadow>
        <planeGeometry args={[width, len]} />
        <meshStandardMaterial map={tex} roughness={0.9} polygonOffset polygonOffsetFactor={-1} />
      </mesh>
      {[-1, 1].map((side) => (
        <RigidBody key={side} type="fixed" colliders={false} position={[side * (width / 2 + 0.1), 0.075, 0]}>
          {segments(len).map((z) => (
            <CuboidCollider key={z} args={[0.1, 0.075, len / segments(len).length / 2]} position={[0, 0, z]} />
          ))}
          <mesh castShadow receiveShadow rotation-y={Math.PI / 2}>
            <boxGeometry args={[len, 0.15, 0.2]} />
            <meshStandardMaterial map={kerb} roughness={0.85} />
          </mesh>
        </RigidBody>
      ))}
    </group>
  );
}

const concrete = new THREE.MeshStandardMaterial({ color: '#b9ad98', roughness: 0.92 });
const block = new THREE.MeshStandardMaterial({ color: '#d9c9a3', roughness: 0.9 });

function Box({ pos, size, rot = 0, mat = concrete }: { pos: [number, number, number]; size: [number, number, number]; rot?: number; mat?: THREE.Material }) {
  return (
    <RigidBody type="fixed" colliders={false} position={pos} rotation={[0, rot, 0]}>
      <CuboidCollider args={[size[0] / 2, size[1] / 2, size[2] / 2]} />
      <mesh castShadow receiveShadow material={mat}>
        <boxGeometry args={size} />
      </mesh>
    </RigidBody>
  );
}

function Ramp({ pos, angleDeg, length = 8, width = 3 }: { pos: [number, number, number]; angleDeg: number; length?: number; width?: number }) {
  const a = (angleDeg * Math.PI) / 180;
  const h = Math.sin(a) * length;
  return (
    <RigidBody type="fixed" colliders={false} position={[pos[0], pos[1] + h / 2, pos[2]]} rotation={[a, 0, 0]}>
      <CuboidCollider args={[width / 2, 0.1, length / 2]} />
      <mesh castShadow receiveShadow material={concrete}>
        <boxGeometry args={[width, 0.2, length]} />
      </mesh>
    </RigidBody>
  );
}

function Stairs({ pos, steps = 10, rise = 0.17, run = 0.3, width = 2.4 }: { pos: [number, number, number]; steps?: number; rise?: number; run?: number; width?: number }) {
  return (
    <group position={pos}>
      {Array.from({ length: steps }, (_, i) => (
        <Box key={i} pos={[0, (rise * (i + 1)) / 2, -run * i]} size={[width, rise * (i + 1), run]} mat={block} />
      ))}
      <Box pos={[0, (rise * steps) / 2, -run * steps - 1.35]} size={[width, rise * steps, 3]} mat={block} />
    </group>
  );
}

export function TestMap() {
  return (
    <>
      <Ground />
      <Avenue />

      {/* Collision test course, west of spawn */}
      <group position={[-14, 0, 0]}>
        <Box pos={[0, 1.5, -6]} size={[10, 3, 0.25]} mat={block} />
        <Box pos={[-5, 1.5, -1]} size={[0.25, 3, 10]} mat={block} />
        <Box pos={[2, 0.5, 2]} size={[3, 1.0, 0.2]} />
        {/* step tests: 0.3 m should auto-step, 0.45 m should block */}
        <Box pos={[-2, 0.15, 6]} size={[1.5, 0.3, 1.5]} />
        <Box pos={[0.5, 0.225, 6]} size={[1.5, 0.45, 1.5]} />
        <Stairs pos={[-12, 0, 6]} />
        <Ramp pos={[-18, 0, 0]} angleDeg={30} />
        <Ramp pos={[-22, 0, 0]} angleDeg={55} />
      </group>
    </>
  );
}
