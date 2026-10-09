import { useMemo } from 'react';
import * as THREE from 'three';
import { ROADS } from '../../config/roads';
import { heightAt } from '../../world/heights';
import { KIBERA_ALLEYS } from './layout';

// Open sewage channels (owner request: "add sewage and a lot of dirt so it looks real"): a narrow
// wet, dark ribbon down one side of every alley and both edges of the murram lanes, streaked
// green-grey with the odd patch of grey foam. One merged mesh, one draw call.

const STEP = 2;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function KiberaDrains() {
  const mesh = useMemo(() => {
    const r = rng(77);
    const pos: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    const sludge = (): [number, number, number] => {
      const k = r();
      if (k < 0.08) return [0.42, 0.42, 0.36]; // foam / grey water
      if (k < 0.5) return [0.1, 0.12, 0.06]; // green slime
      return [0.07, 0.055, 0.035]; // black mud
    };
    const ribbon = (pts: [number, number][], width: number) => {
      for (let i = 0; i < pts.length; i++) {
        const [x, z] = pts[i]!;
        const [nx, nz] = pts[Math.min(i + 1, pts.length - 1)]!;
        const [px, pz] = pts[Math.max(i - 1, 0)]!;
        let dx = nx - px;
        let dz = nz - pz;
        const l = Math.hypot(dx, dz) || 1;
        dx /= l;
        dz /= l;
        const c = sludge();
        for (const side of [-1, 1]) {
          const vx = x + dz * side * (width / 2);
          const vz = z - dx * side * (width / 2);
          pos.push(vx, heightAt(vx, vz) + 0.025, vz);
          col.push(...c);
        }
        if (i > 0) {
          const a = pos.length / 3 - 4;
          idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      }
    };
    for (const [x, z0, z1] of KIBERA_ALLEYS) {
      const pts: [number, number][] = [];
      for (let z = z0; z <= z1; z += STEP) pts.push([x + 0.4, z]);
      ribbon(pts, 0.32);
    }
    for (const rd of ROADS) {
      if (rd.kind !== 'murram' || !rd.id.startsWith('kibera')) continue;
      for (const side of [-1, 1]) {
        const pts: [number, number][] = [];
        for (let i = 0; i < rd.pts.length - 1; i++) {
          const [ax, az] = rd.pts[i]!;
          const [bx, bz] = rd.pts[i + 1]!;
          const len = Math.hypot(bx - ax, bz - az);
          const ux = (bx - ax) / len;
          const uz = (bz - az) / len;
          const off = side * (rd.width / 2 + 0.3);
          for (let s = 0; s < len; s += STEP) pts.push([ax + ux * s + uz * off, az + uz * s - ux * off]);
        }
        ribbon(pts, 0.45);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    // wet: dark, glossy, reflects the sky a little
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.12, metalness: 0.0, polygonOffset: true, polygonOffsetFactor: -2 });
    return new THREE.Mesh(g, m);
  }, []);
  return <primitive object={mesh} receiveShadow />;
}
