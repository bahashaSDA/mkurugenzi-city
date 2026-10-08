import { useMemo } from 'react';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { kerbTexture } from './proceduralTextures';
import { makeRoadMaterial } from './materials/surfaceMaterials';
import { useKTX2 } from './useKTX2';

const SEGMENT = 50; // max collider length for long thin features, m

function segments(len: number): number[] {
  const n = Math.max(1, Math.ceil(len / SEGMENT));
  return Array.from({ length: n }, (_, i) => -len / 2 + (len / n) * (i + 0.5));
}

/** Central avenue (N-S, SPEC 6) with painted kerbs. Kerbs are 0.15 m: the player steps up. */
export function Avenue() {
  const len = 400;
  const width = 8;
  const [c, n, r] = useKTX2(['/textures/asphalt_color.ktx2', '/textures/asphalt_normal.ktx2', '/textures/asphalt_rough.ktx2']);
  const road = useMemo(() => makeRoadMaterial({ color: c!, normal: n!, rough: r! }, width, len), [c, n, r]);
  const kerb = useMemo(() => {
    const t = kerbTexture().clone();
    t.repeat.set(len / 2, 1);
    t.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 });
  }, []);
  return (
    <group position={[14, 0, -100]}>
      <mesh rotation-x={-Math.PI / 2} position-y={0.02} receiveShadow material={road}>
        <planeGeometry args={[width, len]} />
      </mesh>
      {[-1, 1].map((side) => (
        <RigidBody key={side} type="fixed" colliders={false} position={[side * (width / 2 + 0.1), 0.075, 0]}>
          {segments(len).map((z) => (
            <CuboidCollider key={z} args={[0.1, 0.075, len / segments(len).length / 2]} position={[0, 0, z]} />
          ))}
          <mesh castShadow receiveShadow rotation-y={Math.PI / 2} material={kerb}>
            <boxGeometry args={[len, 0.15, 0.2]} />
          </mesh>
        </RigidBody>
      ))}
    </group>
  );
}
