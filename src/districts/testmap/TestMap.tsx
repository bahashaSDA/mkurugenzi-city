import { CuboidCollider, RigidBody } from '@react-three/rapier';
import * as THREE from 'three';

// Phase 0 collision test course (walls, steps <= 0.35 m and > 0.35 m, 30 and 55 degree slopes,
// stairs). Development geometry: only mounted with ?testcourse (VISUAL_AUDIT H6). The smoke
// tests pass that flag.
export const TEST_COURSE = new URLSearchParams(location.search).has('testcourse');

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
