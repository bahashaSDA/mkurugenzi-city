import { ROADS, TURNAROUNDS, type Road } from '../config/roads';
import { heightAt } from './heights';
import { coastWeight } from '../config/coast';

// One road surface for everything (session 12 root-cause fix).
//
// Before: roads were drawn from heightAt() every 4 m, but the physics ground was an 8 m heightfield
// and the low-tier terrain a 16 m mesh. Where a road is graded into a slope (a 7 m blend) those grids
// cannot follow it: measured up to 0.75 m of physics BELOW the visible road (cars sank into it),
// 1.3 m ABOVE it (wheels floated over it) and, on the low tier, up to 5.7 m of terrain drawn OVER
// the road (roads "swallowed" by the hills). tools/road-gap.ts measures it.
//
// Now:
//   * the road ribbons are built once here; the same triangles are drawn (Roads.tsx) and are the
//     road colliders (RoadColliders), so tyres rest on exactly the road you see;
//   * terrain vertices (physics heightfield and visual mesh, same rule) under or beside a road are
//     carved to just below its surface, so terrain can never cover a road or hold a car above it;
//   * the ribbon edges carry a short sloping skirt, so a road on a fill shows a shoulder, not a
//     paper-thin edge floating over the ground;
//   * surfaceAt() is the height of what you stand or park on (road or ground).

export const STEP = 4; // ribbon sample spacing along the road, m
export const LIFT = { tarmac: 0.025, highway: 0.025, murram: 0.04 } as const;
const DISC_LIFT = 0.03;
/** carved terrain stays this far under the road surface (never pokes through the ribbon) */
const UNDER = 0.015;

export interface Sample { x: number; z: number; dx: number; dz: number; s: number }

/** Resample a polyline every STEP metres: points, unit directions, cumulative lengths. */
export function sample(pts: [number, number][]) {
  const out: Sample[] = [];
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

/** The carriageways of a road: [lateral offset, width] (the expressway is two, either side of the median). */
export function carriageways(road: Road): [number, number][] {
  return road.kind === 'highway' ? [[-5.6, 9], [5.6, 9]] : [[0, road.width]];
}

export interface Ribbon {
  road: Road;
  width: number;
  length: number;
  /** surface: 2 vertices per sample (left, right); xyz */
  position: Float32Array;
  /** u across 0..1, v along 0..1 */
  uv: Float32Array;
  index: Uint32Array;
  samples: number;
}

/** A carriageway ribbon draped on the graded ground (surface only: this is also the collider). */
export function ribbon(road: Road, width: number, offset: number): Ribbon {
  const { pts: sp, length } = sample(road.pts);
  const lift = LIFT[road.kind];
  const position = new Float32Array(sp.length * 6);
  const uv = new Float32Array(sp.length * 4);
  const index = new Uint32Array((sp.length - 1) * 6);
  sp.forEach((p, i) => {
    // perpendicular (left of travel direction in a Y-up, -Z-north world)
    const nx = -p.dz;
    const nz = p.dx;
    for (let k = 0; k < 2; k++) {
      const o = offset + ((k ? 1 : -1) * width) / 2;
      const x = p.x + nx * o;
      const z = p.z + nz * o;
      position.set([x, heightAt(x, z) + lift, z], (i * 2 + k) * 3);
      uv.set([k, p.s / length], (i * 2 + k) * 2);
    }
    if (i > 0) index.set([(i - 1) * 2, (i - 1) * 2 + 1, i * 2, (i - 1) * 2 + 1, i * 2 + 1, i * 2], (i - 1) * 6); // CCW from above
  });
  return { road, width, length, position, uv, index, samples: sp.length };
}

let cache: Ribbon[] | null = null;
/** Every carriageway of every road (built once). */
export function allRibbons(): Ribbon[] {
  if (!cache) cache = ROADS.flatMap((rd) => carriageways(rd).map(([off, w]) => ribbon(rd, w, off)));
  return cache;
}

/**
 * Visual shoulders: from each ribbon edge a strip slopes down and out (1.2 m down over 1.6 m),
 * with the edge's UVs. Under ground on cuts (invisible); on fills it is the embankment.
 */
export function skirt(r: Ribbon): { position: Float32Array; uv: Float32Array; index: Uint32Array } {
  const n = r.samples;
  const position = new Float32Array(n * 2 * 2 * 3); // per sample: [edge, foot] x [left, right]
  const uv = new Float32Array(n * 2 * 2 * 2);
  const index: number[] = [];
  for (let i = 0; i < n; i++) {
    const l = i * 2;
    const ax = r.position[l * 3]!, ay = r.position[l * 3 + 1]!, az = r.position[l * 3 + 2]!;
    const bx = r.position[l * 3 + 3]!, by = r.position[l * 3 + 4]!, bz = r.position[l * 3 + 5]!;
    // outward = from the other edge towards this one
    const wx = (ax - bx) / r.width, wz = (az - bz) / r.width;
    const v = r.uv[l * 2 + 1]!;
    const put = (j: number, x: number, y: number, z: number, u: number) => {
      position.set([x, y, z], j * 3);
      uv.set([u, v], j * 2);
    };
    const j = i * 4; // left edge, left foot, right edge, right foot
    put(j, ax, ay - 0.004, az, 0);
    put(j + 1, ax + wx * 1.6, ay - 1.2, az + wz * 1.6, 0);
    put(j + 2, bx, by - 0.004, bz, 1);
    put(j + 3, bx - wx * 1.6, by - 1.2, bz - wz * 1.6, 1);
    if (i > 0) {
      const p = j - 4;
      // left skirt faces out-left, right skirt out-right (CCW seen from outside)
      index.push(p, j, p + 1, p + 1, j, j + 1);
      index.push(p + 2, p + 3, j + 2, p + 3, j + 3, j + 2);
    }
  }
  return { position, uv, index: new Uint32Array(index) };
}

// ---------------------------------------------------------------------------------- spatial index
// centreline segments bucketed on a 32 m grid, padded by the widest reach any carve uses

type Seg = { ax: number; az: number; bx: number; bz: number; half: number; lift: number; kind: Road['kind'] };
type Disc = { x: number; z: number; r: number };
const CELL = 32;
const PAD = 26; // >= half-diagonal of the coarsest terrain cell (16 m * 1.42 / 2 ... with margin)
let grid: Map<number, { segs: Seg[]; discs: Disc[] }> | null = null;
const key = (i: number, j: number) => i * 4096 + j;

function index() {
  if (grid) return grid;
  grid = new Map();
  const add = (x0: number, z0: number, x1: number, z1: number, f: (b: { segs: Seg[]; discs: Disc[] }) => void) => {
    for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++)
      for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) {
        let b = grid!.get(key(i, j));
        if (!b) grid!.set(key(i, j), (b = { segs: [], discs: [] }));
        f(b);
      }
  };
  for (const rd of ROADS) {
    const half = rd.width / 2;
    const reach = half + PAD;
    for (let i = 0; i < rd.pts.length - 1; i++) {
      const [ax, az] = rd.pts[i]!;
      const [bx, bz] = rd.pts[i + 1]!;
      const s: Seg = { ax, az, bx, bz, half, lift: LIFT[rd.kind], kind: rd.kind };
      add(Math.min(ax, bx) - reach, Math.min(az, bz) - reach, Math.max(ax, bx) + reach, Math.max(az, bz) + reach, (b) => b.segs.push(s));
    }
  }
  for (const t of TURNAROUNDS) {
    const d: Disc = { x: t.x, z: t.z, r: t.r };
    add(t.x - t.r - PAD, t.z - t.r - PAD, t.x + t.r + PAD, t.z + t.r + PAD, (b) => b.discs.push(d));
  }
  return grid;
}

/**
 * Road under or near (x, z): the distance outside its footprint (0 = on it) and the surface height
 * at the nearest footprint point. Lowest road wins where footprints overlap. null: no road in `reach`.
 */
export function nearestRoad(x: number, z: number, reach: number): { out: number; y: number; kind: Road['kind'] } | null {
  const b = index().get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
  if (!b) return null;
  let best: { out: number; y: number; kind: Road['kind'] } | null = null;
  for (const s of b.segs) {
    const dx = s.bx - s.ax, dz = s.bz - s.az;
    const t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / (dx * dx + dz * dz)));
    const cx = s.ax + dx * t, cz = s.az + dz * t;
    const d = Math.hypot(x - cx, z - cz);
    const out = Math.max(0, d - s.half);
    if (out > reach) continue;
    // the nearest point of the footprint: the point itself, or the edge towards it
    const k = d > s.half ? s.half / d : 1;
    const px = cx + (x - cx) * k, pz = cz + (z - cz) * k;
    const y = heightAt(px, pz) + s.lift;
    if (!best || out < best.out - 1e-6 || (Math.abs(out - best.out) < 1e-6 && y < best.y)) best = { out, y, kind: s.kind };
  }
  for (const c of b.discs) {
    const d = Math.hypot(x - c.x, z - c.z);
    const out = Math.max(0, d - c.r);
    if (out > reach) continue;
    const k = d > c.r ? c.r / d : 1;
    const y = heightAt(c.x + (x - c.x) * k, c.z + (z - c.z) * k) + DISC_LIFT;
    if (!best || out < best.out - 1e-6 || (Math.abs(out - best.out) < 1e-6 && y < best.y)) best = { out, y, kind: 'tarmac' };
  }
  return best;
}

const memo = new Map<string, number | null>();
/** nearestRoad(...).y, memoised on a 1/16 m key (the carve lattice revisits the same points). */
function memoRoad(x: number, z: number, reach: number): number | null {
  const k = `${Math.round(x * 16)},${Math.round(z * 16)},${Math.round(reach * 16)}`;
  let v = memo.get(k);
  if (v === undefined) {
    v = nearestRoad(x, z, reach)?.y ?? null;
    memo.set(k, v);
  }
  return v;
}
/** Free the carve memo once the terrain is built. */
export function releaseCarveMemo() {
  memo.clear();
}

/**
 * Terrain height for a grid vertex of a mesh with `cell` spacing: heightAt, but never above a road
 * whose footprint the vertex's triangles can touch (so the interpolated ground stays under it).
 */
export function carvedHeight(x: number, z: number, cell: number): number {
  const h = heightAt(x, z);
  const r = nearestRoad(x, z, cell * 1.42);
  if (!r) return h;
  // The ground drawn between grid vertices is a plane per triangle: it stays under the road if each
  // corner is under the road's own plane through it. On a straight grade that is just the road
  // height at the vertex; in a sag (or a cross-slope) the road curves away from the chord. So look
  // at the road on a lattice over the square +-cell the vertex's triangles span, carry each sample
  // back to the vertex along the road's local slope there, and keep the lowest. Taking the plain
  // lowest road point instead dug 2.6 m trenches beside steep roads.
  let low = r.y;
  // lattice step = cell / 2 (and the slope probes +-cell/8), so neighbouring vertices share lattice
  // points: each is computed once (memo) and the whole grid costs ~2x a plain heightAt pass
  const N = 4;
  const e = cell / 8;
  const near = cell / 2 + e;
  const S = (qx: number, qz: number) => memoRoad(qx, qz, near);
  for (let a = 0; a <= N; a++)
    for (let b = 0; b <= N; b++) {
      const qx = x + cell * ((2 * a) / N - 1);
      const qz = z + cell * ((2 * b) / N - 1);
      // beside the road: its nearest footprint point (a cross-sloped road is lowest at an edge)
      const q = S(qx, qz);
      if (q === null) continue;
      const gx = ((S(qx + e, qz) ?? q) - (S(qx - e, qz) ?? q)) / (2 * e);
      const gz = ((S(qx, qz + e) ?? q) - (S(qx, qz - e) ?? q)) / (2 * e);
      const y = q + gx * (x - qx) + gz * (z - qz);
      if (y < low) low = y;
    }
  return Math.min(h, low - UNDER);
}

/** Height of what stands on (x, z): the road surface on a road, otherwise the ground. */
export function surfaceAt(x: number, z: number): number {
  const r = nearestRoad(x, z, 0);
  return r && r.out === 0 ? Math.max(r.y, heightAt(x, z)) : heightAt(x, z);
}

/**
 * A turning circle / roundabout draped on the ground: a polar grid (rings every ~2 m, 48 spokes),
 * not a fan from the centre (whose straight spokes cut chords through a slope and floated in the
 * air at the expressway ends). Drawn and used as the collider, like the ribbons.
 */
export function discSurface(t: { x: number; z: number; r: number }): { position: Float32Array; uv: Float32Array; index: Uint32Array } {
  const spokes = 48;
  const rings = Math.max(2, Math.ceil(t.r / 2));
  const position = new Float32Array((1 + rings * spokes) * 3);
  const uv = new Float32Array((1 + rings * spokes) * 2);
  const put = (i: number, x: number, z: number) => {
    position.set([x, heightAt(x, z) + DISC_LIFT, z], i * 3);
    uv.set([x / 6, z / 6], i * 2);
  };
  put(0, t.x, t.z);
  for (let ring = 1; ring <= rings; ring++)
    for (let k = 0; k < spokes; k++) {
      const a = (k / spokes) * Math.PI * 2;
      const rr = (t.r * ring) / rings;
      put(1 + (ring - 1) * spokes + k, t.x + Math.cos(a) * rr, t.z + Math.sin(a) * rr);
    }
  const index: number[] = [];
  const v = (ring: number, k: number) => (ring === 0 ? 0 : 1 + (ring - 1) * spokes + (k % spokes));
  for (let ring = 0; ring < rings; ring++)
    for (let k = 0; k < spokes; k++) {
      // CCW seen from above (+Y): angle grows from +X towards +Z, so (k+1) then k
      if (ring === 0) index.push(0, v(1, k + 1), v(1, k));
      else index.push(v(ring, k), v(ring, k + 1), v(ring + 1, k + 1), v(ring, k), v(ring + 1, k + 1), v(ring + 1, k));
    }
  return { position, uv, index: new Uint32Array(index) };
}

/** What a tyre or a foot is on, for grip, marks, dust and footsteps. */
export type Surface = 'tarmac' | 'murram' | 'dirt' | 'sand';
export function surfaceKind(x: number, z: number): Surface {
  const r = nearestRoad(x, z, 0);
  if (r && r.out === 0) return r.kind === 'murram' ? 'murram' : 'tarmac';
  return coastWeight(x, z) > 0.5 ? 'sand' : 'dirt'; // off-road is mostly red earth with dry grass
}
