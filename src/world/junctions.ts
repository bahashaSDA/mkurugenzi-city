import { ROADS, TURNAROUNDS, distToRoad, type Road } from '../config/roads';

// Signalised junctions (Part 24.1): where two tarmac roads cross or one ends on another (a T),
// found from the road network itself. Each has the two roads' directions through it (the two
// signal phases) and a stop-line distance per road. Merged within 30 m; turning circles excluded.

export interface Arm { dx: number; dz: number; road: string }
export interface Junction {
  id: number; x: number; z: number; axes: [Arm, Arm]; stop: [number, number]; width: [number, number];
  /** approaches that exist: axis, sign (+1 = traffic coming along +dir) */
  arms: { axis: 0 | 1; sign: 1 | -1 }[];
}

const paved = ROADS.filter((r) => r.kind !== 'murram');

function segs(r: Road) {
  const out: { ax: number; az: number; bx: number; bz: number }[] = [];
  for (let i = 0; i < r.pts.length - 1; i++) out.push({ ax: r.pts[i]![0], az: r.pts[i]![1], bx: r.pts[i + 1]![0], bz: r.pts[i + 1]![1] });
  return out;
}
function dirAt(r: Road, x: number, z: number) {
  let best = { d: Infinity, dx: 0, dz: 1 };
  for (const s of segs(r)) {
    const vx = s.bx - s.ax, vz = s.bz - s.az;
    const L2 = vx * vx + vz * vz;
    const t = Math.max(0, Math.min(1, ((x - s.ax) * vx + (z - s.az) * vz) / L2));
    const d = Math.hypot(x - s.ax - vx * t, z - s.az - vz * t);
    const L = Math.sqrt(L2);
    if (d < best.d) best = { d, dx: vx / L, dz: vz / L };
  }
  return best;
}

let cache: Junction[] | null = null;
export function junctions(): Junction[] {
  if (cache) return cache;
  const found: { x: number; z: number; a: Road; b: Road }[] = [];
  for (let i = 0; i < paved.length; i++)
    for (let j = i + 1; j < paved.length; j++) {
      const A = paved[i]!, B = paved[j]!;
      // a crossing, or an end of one road on the other (T-junction)
      for (const s of segs(A))
        for (const t of segs(B)) {
          const d1x = s.bx - s.ax, d1z = s.bz - s.az, d2x = t.bx - t.ax, d2z = t.bz - t.az;
          const den = d1x * d2z - d1z * d2x;
          if (Math.abs(den) < 1e-6) continue;
          const u = ((t.ax - s.ax) * d2z - (t.az - s.az) * d2x) / den;
          const v = ((t.ax - s.ax) * d1z - (t.az - s.az) * d1x) / den;
          const L1 = Math.hypot(d1x, d1z), L2 = Math.hypot(d2x, d2z);
          const pad1 = (B.width / 2 + 2) / L1, pad2 = (A.width / 2 + 2) / L2;
          if (u >= -pad1 && u <= 1 + pad1 && v >= -pad2 && v <= 1 + pad2) found.push({ x: s.ax + d1x * u, z: s.az + d1z * u, a: A, b: B });
        }
    }
  const out: Junction[] = [];
  for (const f of found) {
    if (TURNAROUNDS.some((t) => Math.hypot(t.x - f.x, t.z - f.z) < t.r + 15)) continue;
    if (out.some((o) => Math.hypot(o.x - f.x, o.z - f.z) < 30)) continue;
    const da = dirAt(f.a, f.x, f.z), db = dirAt(f.b, f.x, f.z);
    if (Math.abs(da.dx * db.dx + da.dz * db.dz) > 0.6) continue; // roads merging at a shallow angle: no signals
    if (Math.max(f.a.width, f.b.width) < 8) continue; // only where a main road meets: not every estate corner
    const arms: Junction['arms'] = [];
    for (const [axis, r, d] of [[0, f.a, da], [1, f.b, db]] as const)
      for (const sign of [1, -1] as const) {
        // an approach exists if the road carries on 15 m that way (traffic comes from there)
        const x = f.x - d.dx * sign * 15, z = f.z - d.dz * sign * 15;
        if (distToRoad(r, x, z) < r.width / 2) arms.push({ axis, sign });
      }
    out.push({
      arms,
      id: out.length, x: f.x, z: f.z,
      axes: [{ dx: da.dx, dz: da.dz, road: f.a.id }, { dx: db.dx, dz: db.dz, road: f.b.id }],
      // traffic on road A stops before road B's carriageway, and the other way round
      stop: [f.b.width / 2 + 3, f.a.width / 2 + 3],
      width: [f.a.width, f.b.width],
    });
  }
  return (cache = out);
}

// ---- the signal cycle (seconds): A green, A amber, all red, B green, B amber, all red
const G = 18, Y = 3, R = 1.5;
export const CYCLE = 2 * (G + Y + R);
export type Light = 'green' | 'amber' | 'red';
/** The light for traffic on axis 0 or 1 of junction j at time t (s). Junctions are offset. */
export function lightAt(j: Junction, axis: 0 | 1, t: number): Light {
  const p = (t + j.id * 7.3) % CYCLE;
  const q = axis === 0 ? p : (p + G + Y + R) % CYCLE;
  return q < G ? 'green' : q < G + Y ? 'amber' : 'red';
}
