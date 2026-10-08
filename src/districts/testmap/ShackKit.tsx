import { useLayoutEffect, useMemo, useRef } from 'react';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { mabatiTextures } from '../../world/proceduralTextures';

// Procedural mabati-shack kit (research/references/hub-mtaa-wa-mkurugenzi.md).
// Rooms 3.0 to 3.7 m square, eaves 2.2 to 2.6 m, mono-pitch roof 8 to 15°.
// One InstancedMesh for walls + one for roofs = 2 draw calls for any number of shacks.
// Same contract as a future Blender kit piece: render instances + one box collider each.

const WALL_COLORS = ['#7A5236', '#D9C9A3', '#7E8386', '#2E8B3D', '#3B8FD0', '#F2C230', '#C8312B', '#A9B0B3', '#8f6a4c'];

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

interface Shack {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  rot: number;
  pitch: number;
  color: string;
}

export function ShackKit({ seed, origin, rows, cols }: { seed: number; origin: [number, number, number]; rows: number; cols: number }) {
  const shacks = useMemo<Shack[]>(() => {
    const r = rng(seed);
    const out: Shack[] = [];
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        if (r() < 0.12) continue; // gaps for footpaths
        const w = 3 + r() * 0.7;
        const d = 3 + r() * 0.7;
        out.push({
          // ~1 m footpaths between rows, irregular jitter
          x: origin[0] + j * 4.3 + (r() - 0.5) * 0.5,
          z: origin[2] + i * 5.2 + (r() - 0.5) * 0.8,
          w,
          d,
          h: 2.2 + r() * 0.4,
          rot: (r() - 0.5) * 0.12,
          pitch: ((8 + r() * 7) * Math.PI) / 180,
          color: WALL_COLORS[Math.floor(r() * WALL_COLORS.length)]!,
        });
      }
    }
    return out;
  }, [seed, origin, rows, cols]);

  const walls = useRef<THREE.InstancedMesh>(null);
  const roofs = useRef<THREE.InstancedMesh>(null);
  const roofMat = useMemo(() => {
    const t = mabatiTextures();
    return new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normal, roughness: 0.55, metalness: 0.6 });
  }, []);

  useLayoutEffect(() => {
    const wm = walls.current;
    const rm = roofs.current;
    if (!wm || !rm) return;
    const o = new THREE.Object3D();
    const c = new THREE.Color();
    shacks.forEach((s, i) => {
      o.position.set(s.x, s.h / 2, s.z);
      o.rotation.set(0, s.rot, 0);
      o.scale.set(s.w, s.h, s.d);
      o.updateMatrix();
      wm.setMatrixAt(i, o.matrix);
      wm.setColorAt(i, c.set(s.color));

      // Roof: 0.25 m overhang, tilted along depth, held down by "stones" later (Phase 1 clutter)
      o.position.set(s.x, s.h + Math.tan(s.pitch) * (s.d / 2) * 0.5 + 0.05, s.z);
      o.rotation.set(s.pitch, s.rot, 0, 'YXZ');
      o.scale.set(s.w + 0.5, 0.03, (s.d + 0.5) / Math.cos(s.pitch));
      o.updateMatrix();
      rm.setMatrixAt(i, o.matrix);
    });
    wm.instanceMatrix.needsUpdate = true;
    rm.instanceMatrix.needsUpdate = true;
    if (wm.instanceColor) wm.instanceColor.needsUpdate = true;
    wm.computeBoundingSphere();
    rm.computeBoundingSphere();
  }, [shacks]);

  return (
    <>
      <instancedMesh ref={walls} args={[undefined, undefined, shacks.length]} castShadow receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.92} />
      </instancedMesh>
      <instancedMesh ref={roofs} args={[undefined, undefined, shacks.length]} material={roofMat} castShadow receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      <RigidBody type="fixed" colliders={false}>
        {shacks.map((s, i) => (
          <CuboidCollider key={i} args={[s.w / 2, s.h / 2 + 0.2, s.d / 2]} position={[s.x, s.h / 2 + 0.2, s.z]} rotation={[0, s.rot, 0]} />
        ))}
      </RigidBody>
    </>
  );
}
