import { useMemo } from 'react';
import * as THREE from 'three';
import type { Placement } from './kit/KitInstances';

// Overhead cables (VISUAL_AUDIT H5): every Nairobi reference photo has dense, sagging wires.
// Built once into ONE merged mesh (one draw call):
//   * 4 power conductors per span from the pole crossarm insulators
//   * 2-4 extra telecom/illegal tap-off lines per span at random heights and sags
//   * service drops from poles to nearby roofs
// Poles are taken from the layout (piece 'power_pole'); lines are poles sharing an x (+-0.5 m).

const CROSSARM_Y = 8.6; // insulator tops (power_pole in hub_kit)
const INSULATOR_X = [-0.8, -0.3, 0.3, 0.8];
const SAMPLES = 14;
const RADIUS = 0.011;
const RADIAL = 3;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Appends a sagging wire (parabolic approximation of a catenary) as a thin tube. */
function wire(pos: number[], idx: number[], a: THREE.Vector3, b: THREE.Vector3, sag: number) {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const t = i / SAMPLES;
    const p = a.clone().lerp(b, t);
    p.y -= 4 * sag * t * (1 - t);
    pts.push(p);
  }
  const base = pos.length / 3;
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < pts.length; i++) {
    const d = pts[Math.min(i + 1, pts.length - 1)]!.clone().sub(pts[Math.max(i - 1, 0)]!).normalize();
    const n1 = new THREE.Vector3().crossVectors(d, up).normalize();
    if (n1.lengthSq() < 1e-6) n1.set(1, 0, 0);
    const n2 = new THREE.Vector3().crossVectors(d, n1).normalize();
    for (let k = 0; k < RADIAL; k++) {
      const ang = (k / RADIAL) * Math.PI * 2;
      const o = n1.clone().multiplyScalar(Math.cos(ang) * RADIUS).addScaledVector(n2, Math.sin(ang) * RADIUS);
      pos.push(pts[i]!.x + o.x, pts[i]!.y + o.y, pts[i]!.z + o.z);
    }
  }
  for (let i = 0; i < pts.length - 1; i++) {
    for (let k = 0; k < RADIAL; k++) {
      const a0 = base + i * RADIAL + k;
      const a1 = base + i * RADIAL + ((k + 1) % RADIAL);
      const b0 = a0 + RADIAL;
      const b1 = a1 + RADIAL;
      idx.push(a0, b0, a1, a1, b0, b1);
    }
  }
}

export function Cables({ placements }: { placements: Placement[] }) {
  const geometry = useMemo(() => {
    const r = rng(17);
    const poles = placements.filter((p) => p.piece === 'power_pole');
    const roofs = placements.filter((p) => p.piece.startsWith('shop_'));
    // group poles into lines by x
    const lines = new Map<number, Placement[]>();
    for (const p of poles) {
      const key = Math.round(p.x * 2) / 2;
      const list = lines.get(key) ?? [];
      list.push(p);
      lines.set(key, list);
    }
    const pos: number[] = [];
    const idx: number[] = [];
    const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    for (const list of lines.values()) {
      list.sort((a, b) => a.z - b.z);
      for (let i = 0; i < list.length - 1; i++) {
        const a = list[i]!;
        const b = list[i + 1]!;
        const span = Math.abs(b.z - a.z);
        if (span > 60) continue;
        for (const ox of INSULATOR_X) wire(pos, idx, v(a.x + ox, CROSSARM_Y, a.z), v(b.x + ox, CROSSARM_Y, b.z), span * 0.022);
        // telecom / tap-off lines: lower, slacker, untidy
        const extra = 2 + Math.floor(r() * 3);
        for (let k = 0; k < extra; k++) {
          const ya = 6.4 + r() * 1.4;
          const yb = 6.4 + r() * 1.4;
          wire(pos, idx, v(a.x + (r() - 0.5) * 0.3, ya, a.z), v(b.x + (r() - 0.5) * 0.3, yb, b.z), span * (0.035 + r() * 0.05));
        }
      }
      // service drops to the nearest roofs (shops within 14 m along the street)
      for (const p of list) {
        const near = roofs.filter((s) => Math.abs(s.z - p.z) < 14 && Math.abs(s.x - p.x) < 12);
        for (let k = 0; k < Math.min(near.length, 2 + Math.floor(r() * 3)); k++) {
          const s = near[Math.floor(r() * near.length)]!;
          const fx = s.x + Math.sin(s.rotY) * 4.3; // facade line (unit is 9 m deep)
          const target = v(fx, 3.6 + r() * 2.2, s.z + (r() - 0.5) * 3.5);
          wire(pos, idx, v(p.x, CROSSARM_Y - 0.5 - r() * 1.6, p.z), target, 0.25 + r() * 0.35);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }, [placements]);

  return (
    <mesh geometry={geometry} frustumCulled={false}>
      <meshStandardMaterial color="#141210" roughness={0.6} metalness={0.1} />
    </mesh>
  );
}
