import { useMemo } from 'react';
import { CuboidCollider, RigidBody, TrimeshCollider } from '@react-three/rapier';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ROADS, TURNAROUNDS, type Road } from '../config/roads';
import { heightAt } from './heights';
import { allRibbons, discSurface, skirt, type Ribbon } from './roadSurface';
import { kerbTexture } from './proceduralTextures';
import { makeRoadMaterial } from './materials/surfaceMaterials';
import { useKTX2 } from './useKTX2';
import { registerWet } from './weather';

const SEGMENT = 50; // max collider length for long thin features, m
const ROAD_UNIT = 1000; // tarmac V coordinate = metres / ROAD_UNIT (shared materials)

function segments(len: number): number[] {
  const n = Math.max(1, Math.ceil(len / SEGMENT));
  return Array.from({ length: n }, (_, i) => -len / 2 + (len / n) * (i + 0.5));
}

/** A carriageway as drawn: its surface (the same triangles as its collider) plus the shoulders. */
function ribbonGeometry(rb: Ribbon) {
  const sk = skirt(rb);
  const n = rb.position.length / 3;
  const pos = new Float32Array(rb.position.length + sk.position.length);
  pos.set(rb.position);
  pos.set(sk.position, rb.position.length);
  const uv = new Float32Array(rb.uv.length + sk.uv.length);
  uv.set(rb.uv);
  uv.set(sk.uv, rb.uv.length);
  const idx = new Uint32Array(rb.index.length + sk.index.length);
  idx.set(rb.index);
  for (let i = 0; i < sk.index.length; i++) idx[rb.index.length + i] = sk.index[i]! + n;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals();
  return { geometry: g, length: rb.length };
}

/** Roads draped on the graded ground. UV: u across (0..1), v along (0..1 over the whole road). */
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
    for (const rb of allRibbons()) {
      const { geometry, length } = ribbonGeometry(rb);
      const w = rb.width;
      const u = geometry.getAttribute('uv') as THREE.BufferAttribute;
      if (rb.road.kind === 'murram') {
        for (let i = 0; i < u.count; i++) u.setXY(i, (u.getX(i) * w) / 3, (u.getY(i) * length) / 3); // world-scaled tiling
        murram.push(geometry);
      } else {
        for (let i = 0; i < u.count; i++) u.setY(i, (u.getY(i) * length) / ROAD_UNIT);
        const list = tarmac.get(w) ?? [];
        list.push(geometry);
        tarmac.set(w, list);
      }
    }
    out.push({ geometry: mergeGeometries(murram)!, material: murramMat, key: 'murram' });
    for (const [w, list] of tarmac) {
      const tex = { color: c!.clone(), normal: n!.clone(), rough: r!.clone() };
      for (const t of Object.values(tex)) t.needsUpdate = true;
      out.push({ geometry: mergeGeometries(list)!, material: makeRoadMaterial(tex, w, ROAD_UNIT), key: `tarmac-${w}` });
    }
    // roundabouts and turning circles: plain asphalt discs (no lane paint), draped on the ground
    const discs: THREE.BufferGeometry[] = [];
    for (const t of TURNAROUNDS) {
      const d = discSurface(t);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(d.position, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(d.uv, 2));
      g.setIndex(new THREE.BufferAttribute(d.index, 1));
      g.computeVertexNormals();
      discs.push(g);
    }
    if (discs.length) {
      const tex = { color: c!.clone(), normal: n!.clone(), rough: r!.clone() };
      for (const t of Object.values(tex)) {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.needsUpdate = true;
      }
      const mat = new THREE.MeshStandardMaterial({ map: tex.color, normalMap: tex.normal, roughnessMap: tex.rough, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 });
      out.push({ geometry: mergeGeometries(discs)!, material: mat, key: 'turnarounds' });
    }
    for (const m of out) registerWet(m.material);
    return out;
  }, [c, n, r, mc, mn, mr]);

  const highway = ROADS.find((rd) => rd.kind === 'highway');
  return (
    <>
      {meshes.map((m) => (
        <mesh key={m.key} geometry={m.geometry} material={m.material} receiveShadow />
      ))}
      <RoadColliders />
      {highway && <Median road={highway} />}
      <Islands />
      <AvenueKerbs />
    </>
  );
}

/** Concrete median barrier along the expressway (0.8 m high, segmented colliders). */
function Median({ road }: { road: Road }) {
  const items = useMemo(() => {
    const out: { x: number; z: number; len: number; rot: number }[] = [];
    // the median stops short of the roundabouts at each end (that's where traffic turns round)
    const pts = road.pts.map((p) => [...p] as [number, number]);
    for (const [end, next] of [[0, 1], [pts.length - 1, pts.length - 2]] as const) {
      const t = TURNAROUNDS.find((tt) => Math.hypot(tt.x - pts[end]![0], tt.z - pts[end]![1]) < tt.r + 20);
      if (!t) continue;
      const [ex, ez] = pts[end]!;
      const [nx, nz] = pts[next]!;
      const l = Math.hypot(nx - ex, nz - ez);
      const cut = Math.hypot(t.x - ex, t.z - ez) + t.r + 6;
      pts[end] = [ex + ((nx - ex) / l) * cut, ez + ((nz - ez) / l) * cut];
    }
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i]!;
      const [bx, bz] = pts[i + 1]!;
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

/** Roundabout islands: a kerbed, grassed centre that traffic drives round (solid). */
function Islands() {
  const list = TURNAROUNDS.filter((t) => t.island > 0);
  const mats = useMemo(
    () => ({
      kerb: new THREE.MeshStandardMaterial({ map: kerbTexture(), roughness: 0.9 }),
      grass: new THREE.MeshStandardMaterial({ color: '#4d6b2e', roughness: 1 }),
    }),
    [],
  );
  return (
    <RigidBody type="fixed" colliders={false}>
      {list.map((t, i) => {
        const y = heightAt(t.x, t.z);
        return (
          <group key={i} position={[t.x, y, t.z]}>
            <mesh material={mats.kerb} position={[0, 0.1, 0]} castShadow receiveShadow>
              <cylinderGeometry args={[t.island, t.island + 0.05, 0.2, 40, 1, true]} />
            </mesh>
            <mesh material={mats.grass} position={[0, 0.19, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
              <circleGeometry args={[t.island - 0.02, 40]} />
            </mesh>
            <CuboidCollider args={[t.island * 0.7, 0.3, t.island * 0.7]} position={[0, 0.3, 0]} />
          </group>
        );
      })}
    </RigidBody>
  );
}

/**
 * The road surfaces as colliders: the very triangles that are drawn, in ~200 m pieces (small BVHs),
 * plus the turning circles. The terrain heightfield is carved under them (roadSurface.carvedHeight),
 * so on a road the wheels and feet touch exactly the visible tarmac or murram.
 */
const CHUNK = 50; // samples per collider piece (50 x 4 m)
function RoadColliders() {
  const pieces = useMemo(() => {
    const out: { v: Float32Array; i: Uint32Array }[] = [];
    for (const rb of allRibbons()) {
      for (let s0 = 0; s0 < rb.samples - 1; s0 += CHUNK) {
        const s1 = Math.min(rb.samples - 1, s0 + CHUNK);
        const v = rb.position.slice(s0 * 6, (s1 + 1) * 6);
        const quads = s1 - s0;
        const i = new Uint32Array(quads * 6);
        for (let q = 0; q < quads; q++) i.set([q * 2, q * 2 + 1, q * 2 + 2, q * 2 + 1, q * 2 + 3, q * 2 + 2], q * 6);
        out.push({ v, i });
      }
    }
    for (const t of TURNAROUNDS) {
      const d = discSurface(t);
      out.push({ v: d.position, i: d.index });
    }
    return out;
  }, []);
  return (
    <RigidBody type="fixed" colliders={false}>
      {pieces.map((p, k) => (
        <TrimeshCollider key={k} args={[p.v, p.i]} />
      ))}
    </RigidBody>
  );
}
