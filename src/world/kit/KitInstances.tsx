import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { ConvexHullCollider, CuboidCollider, RigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { useGame } from '../../app/store';
import type { Kit, KitPart } from './useKit';

export interface Placement {
  piece: string;
  x: number;
  z: number;
  rotY: number;
  y?: number;
  /** Uniform scale (rocks); colliders scale with it. */
  scale?: number;
}

const scaledHulls = new WeakMap<Float32Array, Map<number, Float32Array>>();
function scaledHull(points: Float32Array, k: number): Float32Array {
  if (k === 1) return points;
  let m = scaledHulls.get(points);
  if (!m) scaledHulls.set(points, (m = new Map()));
  let out = m.get(k);
  if (!out) m.set(k, (out = points.map((v) => v * k)));
  return out;
}

// LOD switch distances (m) per tier. The hub is dense (a shack every ~22 m²), so the LOD0 radius
// dominates the triangle budget: 18 m on low tier keeps ~45 full-detail shacks in view.
const LOD_DIST = { low: [18, 70], mid: [25, 90], high: [35, 110] } as const;
const CULL_DIST = { low: 260, mid: 420, high: 600 } as const;
const UPDATE_EVERY_S = 0.25;
const UPDATE_MOVE_M = 2;

interface Batch {
  mesh: THREE.InstancedMesh;
  part: KitPart;
  lod: number;
}

const _m = new THREE.Matrix4();
const _camPos = new THREE.Vector3();

/**
 * Draws every placement of every kit piece with GPU instancing: one InstancedMesh per
 * (piece, LOD, primitive). Instances are re-bucketed by camera distance a few times a
 * second (no per-frame allocation). Also creates one fixed rigid body holding a simple
 * collider per placement (SPEC 9: boxes/hulls only).
 */
export function KitInstances({ kit, placements, render = true }: { kit: Kit; placements: Placement[]; render?: boolean }) {
  const group = useRef<THREE.Group>(null);
  const tier = useGame((s) => s.tier);

  const byPiece = useMemo(() => {
    const map = new Map<string, { matrices: THREE.Matrix4[]; xz: Float32Array }>();
    const groups = new Map<string, Placement[]>();
    for (const p of placements) {
      if (!kit.has(p.piece)) continue;
      const list = groups.get(p.piece) ?? [];
      list.push(p);
      groups.set(p.piece, list);
    }
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const sc = new THREE.Vector3();
    for (const [piece, list] of groups) {
      const xz = new Float32Array(list.length * 2);
      const matrices = list.map((p, i) => {
        xz[i * 2] = p.x;
        xz[i * 2 + 1] = p.z;
        return new THREE.Matrix4().compose(new THREE.Vector3(p.x, p.y ?? 0, p.z), q.setFromAxisAngle(up, p.rotY), sc.setScalar(p.scale ?? 1));
      });
      map.set(piece, { matrices, xz });
    }
    return map;
  }, [kit, placements]);

  // Build the instanced meshes once per kit/placement set.
  const batches = useMemo(() => {
    const out = new Map<string, Batch[]>();
    if (!render) return out; // colliders only
    for (const [piece, { matrices }] of byPiece) {
      const def = kit.get(piece)!;
      const list: Batch[] = [];
      def.lods.forEach((parts, lod) => {
        for (const part of parts) {
          const mesh = new THREE.InstancedMesh(part.geometry, part.material, matrices.length);
          mesh.count = 0;
          mesh.castShadow = lod === 0;
          mesh.receiveShadow = lod < 2;
          mesh.name = `${piece}_LOD${lod}`;
          list.push({ mesh, part, lod });
        }
      });
      out.set(piece, list);
    }
    return out;
  }, [byPiece, kit, render]);

  useEffect(() => {
    const g = group.current;
    if (!g) return;
    for (const list of batches.values()) for (const b of list) g.add(b.mesh);
    return () => {
      for (const list of batches.values()) {
        for (const b of list) {
          g.remove(b.mesh);
          b.mesh.dispose(); // instance buffers only; geometry/material belong to the cached GLB
        }
      }
    };
  }, [batches]);

  const st = useRef({ t: 99, x: Infinity, z: Infinity });
  useFrame((state, dt) => {
    const s = st.current;
    s.t += dt;
    state.camera.getWorldPosition(_camPos);
    const moved = Math.abs(_camPos.x - s.x) + Math.abs(_camPos.z - s.z) > UPDATE_MOVE_M;
    // Moving: re-bucket at most 4x/s. Idle: once per second (catches tier changes).
    if (s.t < (moved ? UPDATE_EVERY_S : 1)) return;
    s.t = 0;
    s.x = _camPos.x;
    s.z = _camPos.z;
    const cull = CULL_DIST[tier];
    const d0 = LOD_DIST[tier][0] ** 2;
    const d1 = LOD_DIST[tier][1] ** 2;
    const dc = cull * cull;

    for (const [piece, { matrices, xz }] of byPiece) {
      const list = batches.get(piece);
      if (!list) continue;
      for (const b of list) b.mesh.count = 0;
      for (let i = 0; i < matrices.length; i++) {
        const dx = xz[i * 2]! - _camPos.x;
        const dz = xz[i * 2 + 1]! - _camPos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > dc) continue;
        const lod = d2 < d0 ? 0 : d2 < d1 ? 1 : 2;
        for (const b of list) {
          if (b.lod !== lod) continue;
          _m.multiplyMatrices(matrices[i]!, b.part.local);
          b.mesh.setMatrixAt(b.mesh.count++, _m);
        }
      }
      for (const b of list) {
        b.mesh.visible = b.mesh.count > 0;
        if (b.mesh.visible) {
          b.mesh.instanceMatrix.needsUpdate = true;
          b.mesh.computeBoundingSphere();
        }
      }
    }
  });

  return (
    <>
      <group ref={group} />
      <RigidBody type="fixed" colliders={false}>
        {placements.flatMap((p, i) =>
          (kit.get(p.piece)?.colliders ?? []).map((col, j) => {
            const rot: [number, number, number] = [0, p.rotY, 0];
            const key = `${i}.${j}`;
            const k = p.scale ?? 1;
            if (col.kind === 'hull') {
              return <ConvexHullCollider key={key} args={[scaledHull(col.points, k)]} position={[p.x, p.y ?? 0, p.z]} rotation={rot} />;
            }
            // Rotate the collider's centre offset into place with the piece.
            const c = Math.cos(p.rotY);
            const s = Math.sin(p.rotY);
            const [cx, cy, cz] = col.center.map((v) => v * k) as [number, number, number];
            return (
              <CuboidCollider
                key={key}
                args={col.halfExtents.map((v) => v * k) as [number, number, number]}
                position={[p.x + cx * c + cz * s, (p.y ?? 0) + cy, p.z - cx * s + cz * c]}
                rotation={rot}
              />
            );
          }),
        )}
      </RigidBody>
    </>
  );
}
