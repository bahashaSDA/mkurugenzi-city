import { useMemo } from 'react';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ROADS, type Road } from '../config/roads';
import { heightAt } from './heights';
import { kerbTexture } from './proceduralTextures';
import { makeRoadMaterial } from './materials/surfaceMaterials';
import { useKTX2 } from './useKTX2';

const SEGMENT = 50; // max collider length for long thin features, m
const STEP = 4; // ribbon sample spacing, m
const ROAD_UNIT = 1000; // tarmac V coordinate = metres / ROAD_UNIT (shared materials)

function segments(len: number): number[] {
  const n = Math.max(1, Math.ceil(len / SEGMENT));
  return Array.from({ length: n }, (_, i) => -len / 2 + (len / n) * (i + 0.5));
}

/** Resample a polyline every STEP metres: points, unit directions, cumulative lengths. */
function sample(pts: [number, number][]) {
  const out: { x: number; z: number; dx: number; dz: number; s: number }[] = [];
  let s = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i]!;
    const [bx, bz] = pts[i + 1]!;
    const len = Math.hypot(bx - ax, bz - az);
    const dx = (bx - ax) / len;
    const dz = (bz - az) / len;
    const n = Math.max(1, Math.ceil(len / STEP));
    for (let k = i === 0 ? 0 : 1; k <= n; k++) {
      const t = k / n;
      out.push({ x: ax + (bx - ax) * t, z: az + (bz - az) * t, dx, dz, s: s + len * t });
    }
    s += len;
  }
  return { pts: out, length: s };
}

/** Ribbon draped on the terrain. UV: u across (0..1), v along (0..1 over the whole road). */
function ribbon(pts: [number, number][], width: number, offset: number, lift: number) {
  const { pts: sp, length } = sample(pts);
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  sp.forEach((p, i) => {
    // perpendicular (left of travel direction in a Y-up, -Z-north world)
    const nx = -p.dz;
    const nz = p.dx;
    for (const side of [-1, 1]) {
      const o = offset + (side * width) / 2;
      const x = p.x + nx * o;
      const z = p.z + nz * o;
      pos.push(x, heightAt(x, z) + lift, z);
      uv.push(side < 0 ? 0 : 1, p.s / length);
    }
    if (i > 0) {
      const a = (i - 1) * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); // counter-clockwise from above
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return { geometry: g, length };
}

export function RoadNetwork() {
  const [c, n, r, mc, mn, mr] = useKTX2([
    '/textures/asphalt_color.ktx2', '/textures/asphalt_normal.ktx2', '/textures/asphalt_rough.ktx2',
    '/textures/murram_path_color.ktx2', '/textures/murram_path_normal.ktx2', '/textures/murram_path_rough.ktx2',
  ]);
  // Draw-call discipline: every murram road is one merged mesh; tarmac merges per width (the road
  // shader needs the width), with V in metres / ROAD_UNIT so one material fits any length.
  const meshes = useMemo(() => {
    const out: { geometry: THREE.BufferGeometry; material: THREE.Material; key: string }[] = [];
    const murramMat = new THREE.MeshStandardMaterial({
      map: mc!, normalMap: mn!, roughnessMap: mr!, roughness: 1, color: new THREE.Color(1.05, 0.8, 0.66),
      polygonOffset: true, polygonOffsetFactor: -1,
    });
    const murram: THREE.BufferGeometry[] = [];
    const tarmac = new Map<number, THREE.BufferGeometry[]>();
    for (const road of ROADS) {
      const parts: [number, number][] = road.kind === 'highway' ? [[-5.6, 9], [5.6, 9]] : [[0, road.width]];
      for (const [off, w] of parts) {
        const { geometry, length } = ribbon(road.pts, w, off, road.kind === 'murram' ? 0.04 : 0.025);
        const u = geometry.getAttribute('uv') as THREE.BufferAttribute;
        if (road.kind === 'murram') {
          for (let i = 0; i < u.count; i++) u.setXY(i, (u.getX(i) * w) / 3, (u.getY(i) * length) / 3); // world-scaled tiling
          murram.push(geometry);
        } else {
          for (let i = 0; i < u.count; i++) u.setY(i, (u.getY(i) * length) / ROAD_UNIT);
          const list = tarmac.get(w) ?? [];
          list.push(geometry);
          tarmac.set(w, list);
        }
      }
    }
    out.push({ geometry: mergeGeometries(murram)!, material: murramMat, key: 'murram' });
    for (const [w, list] of tarmac) {
      const tex = { color: c!.clone(), normal: n!.clone(), rough: r!.clone() };
      for (const t of Object.values(tex)) t.needsUpdate = true;
      out.push({ geometry: mergeGeometries(list)!, material: makeRoadMaterial(tex, w, ROAD_UNIT), key: `tarmac-${w}` });
    }
    return out;
  }, [c, n, r, mc, mn, mr]);

  const highway = ROADS.find((rd) => rd.kind === 'highway');
  return (
    <>
      {meshes.map((m) => (
        <mesh key={m.key} geometry={m.geometry} material={m.material} receiveShadow />
      ))}
      {highway && <Median road={highway} />}
      <AvenueKerbs />
    </>
  );
}

/** Concrete median barrier along the expressway (0.8 m high, segmented colliders). */
function Median({ road }: { road: Road }) {
  const items = useMemo(() => {
    const out: { x: number; z: number; len: number; rot: number }[] = [];
    for (let i = 0; i < road.pts.length - 1; i++) {
      const [ax, az] = road.pts[i]!;
      const [bx, bz] = road.pts[i + 1]!;
      const len = Math.hypot(bx - ax, bz - az);
      const nseg = Math.ceil(len / SEGMENT);
      for (let k = 0; k < nseg; k++) {
        const t = (k + 0.5) / nseg;
        out.push({ x: ax + (bx - ax) * t, z: az + (bz - az) * t, len: len / nseg, rot: Math.atan2(bx - ax, bz - az) });
      }
    }
    return out;
  }, [road]);
  // one instanced mesh for every segment (was one draw call per 50 m)
  const mesh = useMemo(() => {
    const m = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: '#b8b2a6', roughness: 0.9 }), items.length);
    const q = new THREE.Quaternion();
    items.forEach((s, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.rot);
      m.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(s.x, heightAt(s.x, s.z) + 0.4, s.z), q, new THREE.Vector3(0.6, 0.8, s.len)));
    });
    m.castShadow = true;
    m.receiveShadow = true;
    m.computeBoundingSphere();
    return m;
  }, [items]);
  return (
    <>
      <primitive object={mesh} />
      <RigidBody type="fixed" colliders={false}>
        {items.map((s, i) => (
          <CuboidCollider key={i} args={[0.3, 0.4, s.len / 2]} position={[s.x, heightAt(s.x, s.z) + 0.4, s.z]} rotation={[0, s.rot, 0]} />
        ))}
      </RigidBody>
    </>
  );
}

/** The avenue's painted kerbs (0.15 m: the player steps up), along its full length. */
function AvenueKerbs() {
  const av = ROADS.find((rd) => rd.id === 'avenue')!;
  const [[x, z0], [, z1]] = av.pts as [[number, number], [number, number]];
  const len = Math.abs(z1 - z0);
  const cz = (z0 + z1) / 2;
  const width = av.width;
  const kerb = useMemo(() => {
    const t = kerbTexture().clone();
    t.repeat.set(len / 2, 1);
    t.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 });
  }, [len]);
  return (
    <group position={[x, 0, cz]}>
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
