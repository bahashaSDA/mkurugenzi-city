import { useMemo } from 'react';
import * as THREE from 'three';
import { CuboidCollider, HeightfieldCollider, RigidBody } from '@react-three/rapier';
import { WORLD_HALF } from '../config/world';
import { getHubLayout } from '../districts/hub/layout';
import { buildGroundMask } from './materials/groundMask';
import { groundGeometry, makeGroundMaterial } from './materials/surfaceMaterials';
import { useKTX2 } from './useKTX2';
import { heightAt } from './heights';
import { useGame } from '../app/store';

// Collider rule (session 1): never use huge primitive colliders. Rapier lost precision on a
// 1.6 km cuboid and the character sank ~17 cm. The ground is a heightfield; long walls are
// split into short segments.
const HF_SUBDIV = 400; // physics heightfield: 8 m grid over 3.2 km
const VIS_SUBDIV = { low: 200, mid: 300, high: 400 } as const; // visual mesh by tier (16 / 10.7 / 8 m)
const WALL_SEG = 200;

export function Terrain() {
  const tier = useGame((s) => s.tier);
  const [bc, bn, br, pc, pn, pr, rc, rn, rr] = useKTX2([
    '/textures/murram_color.ktx2',
    '/textures/murram_normal.ktx2',
    '/textures/murram_rough.ktx2',
    '/textures/murram_path_color.ktx2',
    '/textures/murram_path_normal.ktx2',
    '/textures/murram_path_rough.ktx2',
    '/textures/rock_color.ktx2',
    '/textures/rock_normal.ktx2',
    '/textures/rock_rough.ktx2',
  ]);
  const { geometry, material } = useMemo(() => {
    const mask = buildGroundMask(getHubLayout());
    const geometry = groundGeometry(WORLD_HALF * 2, VIS_SUBDIV[tier]);
    const pos = geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
    pos.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return {
      geometry,
      material: makeGroundMaterial({ color: bc!, normal: bn!, rough: br! }, { color: pc!, normal: pn!, rough: pr! }, mask,
        { color: rc!, normal: rn!, rough: rr! }),
    };
  }, [bc, bn, br, pc, pn, pr, rc, rn, rr, tier]);
  // Rapier heightfield order (verified in a unit test): index = i * (n + 1) + j, i along X, j along Z
  const heights = useMemo(() => {
    const n = HF_SUBDIV;
    const hs = new Array<number>((n + 1) * (n + 1));
    for (let i = 0; i <= n; i++)
      for (let j = 0; j <= n; j++) hs[i * (n + 1) + j] = heightAt(-WORLD_HALF + (2 * WORLD_HALF * i) / n, -WORLD_HALF + (2 * WORLD_HALF * j) / n);
    return hs;
  }, []);
  const n = (WORLD_HALF * 2) / WALL_SEG;
  const wall = Array.from({ length: n }, (_, i) => -WORLD_HALF + WALL_SEG * (i + 0.5));

  return (
    <RigidBody type="fixed" colliders={false}>
      <HeightfieldCollider args={[HF_SUBDIV, HF_SUBDIV, heights, { x: WORLD_HALF * 2, y: 1, z: WORLD_HALF * 2 }]} />
      <mesh geometry={geometry} material={material} receiveShadow />
      {/* World boundary walls (SPEC 9): invisible, so nobody falls out of the world. */}
      {wall.map((c) => (
        <group key={c}>
          <CuboidCollider args={[WALL_SEG / 2, 20, 1]} position={[c, 20, -WORLD_HALF - 1]} />
          <CuboidCollider args={[WALL_SEG / 2, 20, 1]} position={[c, 20, WORLD_HALF + 1]} />
          <CuboidCollider args={[1, 20, WALL_SEG / 2]} position={[-WORLD_HALF - 1, 20, c]} />
          <CuboidCollider args={[1, 20, WALL_SEG / 2]} position={[WORLD_HALF + 1, 20, c]} />
        </group>
      ))}
    </RigidBody>
  );
}
