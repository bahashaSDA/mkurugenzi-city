import { use, useEffect, useLayoutEffect, useMemo } from 'react';
import * as THREE from 'three';
import { CuboidCollider, HeightfieldCollider, RigidBody } from '@react-three/rapier';
import { WORLD_HALF } from '../config/world';
import { getHubLayout } from '../districts/hub/layout';
import { buildGroundMask } from './materials/groundMask';
import { groundGeometry, makeGroundMaterial } from './materials/surfaceMaterials';
import { useKTX2 } from './useKTX2';
import { terrainHeights } from './terrainHeights';
import { useGame } from '../app/store';
import { registerWet } from './weather';

// Collider rule (session 1): never use huge primitive colliders. Rapier lost precision on a
// 1.6 km cuboid and the character sank ~17 cm. The ground is a heightfield; long walls are
// split into short segments.
const HF_SUBDIV = 500; // physics heightfield: 8 m grid over 4 km
const VIS_SUBDIV = { low: 250, mid: 375, high: 500 } as const; // visual mesh by tier (16 / 10.7 / 8 m)
const WALL_SEG = 200;

/** The tier whose terrain is on screen: a tier change suspends the world until the worker has the
 *  new heights, and the loading screen must wait for it (app/Game Ready) before priming. */
export const terrainShown: { tier: string | null } = { tier: null };

let groundMaskCache: ReturnType<typeof buildGroundMask> | null = null;

export function Terrain() {
  const tier = useGame((s) => s.tier);
  const [bc, bn, br, pc, pn, pr, rc, rn, rr, sc] = useKTX2([
    '/textures/murram_color.ktx2',
    '/textures/murram_normal.ktx2',
    '/textures/murram_rough.ktx2',
    '/textures/murram_path_color.ktx2',
    '/textures/murram_path_normal.ktx2',
    '/textures/murram_path_rough.ktx2',
    '/textures/rock_color.ktx2',
    '/textures/rock_normal.ktx2',
    '/textures/rock_rough.ktx2',
    '/textures/sand_color.ktx2',
  ]);
  // carved heights from the worker (suspends until ready; computed once, then cached)
  const visH = use(terrainHeights(VIS_SUBDIV[tier], 'visual'));
  const physH = use(terrainHeights(HF_SUBDIV, 'physics'));
  // a first visit may step down a tier while loading (app/Game Ready): have the next grid down
  // computed in the background meanwhile, so the step doesn't wait seconds for the worker
  const quality = useGame((s) => s.quality);
  useEffect(() => {
    if (quality !== 'auto' || tier === 'low') return;
    const id = setTimeout(() => terrainHeights(VIS_SUBDIV[tier === 'high' ? 'mid' : 'low'], 'visual'), 500);
    return () => clearTimeout(id);
  }, [tier, quality]);
  const { geometry, material } = useMemo(() => {
    const mask = (groundMaskCache ??= buildGroundMask(getHubLayout())); // painted once (a big canvas)
    const geometry = groundGeometry(WORLD_HALF * 2, VIS_SUBDIV[tier]);
    const pos = geometry.getAttribute('position') as THREE.BufferAttribute;
    // carved under the roads (roadSurface): the hills can never be drawn over the tarmac
    for (let i = 0; i < pos.count; i++) pos.setY(i, visH[i]!);
    pos.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return {
      geometry,
      material: makeGroundMaterial({ color: bc!, normal: bn!, rough: br! }, { color: pc!, normal: pn!, rough: pr! }, mask,
        { color: rc!, normal: rn!, rough: rr! }, sc),
    };
  }, [bc, bn, br, pc, pn, pr, rc, rn, rr, sc, tier, visH]);
  useLayoutEffect(() => {
    terrainShown.tier = tier;
    return () => {
      terrainShown.tier = null;
    };
  }, [tier, geometry]);
  useEffect(() => registerWet(material), [material]);
  // Rapier heightfield order (verified in a unit test): index = i * (n + 1) + j, i along X, j along Z
  const heights = useMemo(() => Array.from(physH), [physH]);
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
