import { heightAt } from '../../world/heights';

// Vehicle routes as closed loops along road centre lines. Each point carries the lane offset to the
// LEFT of travel for the segment starting there (Kenya drives on the left): town roads ~1.9 m,
// the expressway ~7.8 m (outer lane of the left carriageway).
export interface Stop {
  name: string;
  x: number;
  z: number;
  dwell: number;
}

export interface RouteDef {
  id: string;
  name: string;
  pts: [number, number, number][]; // x, z, lane offset
  stops: Stop[];
}

const T = 1.9;
const HW = 7.8;

export const ROUTES: RouteDef[] = [
  {
    id: 'A',
    name: 'Route 46: Stage - Expressway - Kibera',
    pts: [[14, 124, T], [14, -312, HW], [-145, -312, T], [-145, 150, T], [14, 150, T]],
    stops: [
      { name: 'Matatu Stage', x: 14, z: 118, dwell: 9 },
      { name: 'Mtaa wa Mkurugenzi', x: 14, z: -60, dwell: 6 },
      { name: 'Expressway Junction', x: 14, z: -290, dwell: 5 },
      { name: 'Kibera (Railway)', x: -145, z: -150, dwell: 6 },
      { name: 'Kibera (Main lane)', x: -145, z: 20, dwell: 6 },
      { name: 'Soko (Market)', x: -60, z: 150, dwell: 6 },
    ],
  },
  {
    id: 'B',
    name: 'Route 111: Stage - Rocky Ridge - East Road',
    pts: [[14, 132, T], [14, 330, T], [300, 330, T], [300, 200, T], [220, 60, T], [140, -40, T], [18, -40, T]],
    stops: [
      { name: 'Matatu Stage', x: 14, z: 138, dwell: 9 },
      { name: 'South Road', x: 14, z: 300, dwell: 6 },
      { name: 'Rocky Ridge', x: 300, z: 300, dwell: 6 },
      { name: 'East Road', x: 140, z: -40, dwell: 6 },
    ],
  },
  {
    id: 'C',
    name: 'Route 33: Stage - CBD (Mkurugenzi Tower)',
    pts: [[14, 112, T], [14, -1250, T], [290, -1250, T], [290, -1050, T], [14, -1050, T]],
    stops: [
      { name: 'Matatu Stage', x: 14, z: 112, dwell: 9 },
      { name: 'CBD: Mkurugenzi Tower', x: 14, z: -1090, dwell: 8 },
      { name: 'CBD East', x: 290, z: -1150, dwell: 6 },
      { name: 'Expressway Junction', x: 14, z: -330, dwell: 5 },
    ],
  },
  {
    id: 'D',
    name: 'Route 8: Utafraaaia Estate',
    pts: [[14, 100, T], [14, -312, HW], [-1100, -312, T], [-1100, -1250, T], [-1100, -312, HW], [14, -312, T]],
    stops: [
      { name: 'Matatu Stage', x: 14, z: 100, dwell: 9 },
      { name: 'Utafraaaia Estate', x: -1100, z: -900, dwell: 7 },
      { name: 'Utafraaaia House', x: -1100, z: -1240, dwell: 6 },
    ],
  },
  {
    id: 'E',
    name: "Route 105: Kibera - Freddie's School",
    pts: [[-145, 150, T], [-145, 330, T], [-500, 520, T], [-850, 700, T], [-1050, 700, T], [-1050, 950, T], [-1050, 700, T], [-850, 700, T], [-500, 520, T], [-145, 330, T]],
    stops: [
      { name: 'Kibera (Main lane)', x: -145, z: 30, dwell: 6 },
      { name: "Freddie's School Town", x: -1050, z: 780, dwell: 8 },
      { name: 'Mashinani Junction', x: -500, z: 520, dwell: 5 },
    ],
  },
  {
    id: 'F',
    name: 'Route 120: Phil-It Studios - Arena',
    pts: [[14, -312, HW], [1100, -312, T], [1100, 250, T], [1100, -1050, T], [290, -1050, T], [14, -1050, T]],
    stops: [
      { name: 'Phil-It Studios Town', x: 1100, z: 20, dwell: 8 },
      { name: 'Wakurugenzi Arena', x: 1100, z: -1000, dwell: 8 },
      { name: 'CBD: Mkurugenzi Tower', x: 100, z: -1050, dwell: 6 },
    ],
  },
  {
    id: 'X',
    name: 'Expressway',
    pts: [[-1540, -312, HW], [1540, -312, HW]],
    stops: [],
  },
];

let cached: Record<string, RouteSample> | null = null;
/** All routes, sampled once (shared by the traffic, stages and hailing). */
export function routeSamples(): Record<string, RouteSample> {
  return (cached ??= Object.fromEntries(ROUTES.map((r) => [r.id, sampleRoute(r)])));
}

/** Nearest sample index on a route to (x, z), and its distance. */
export function nearestOnRoute(r: RouteSample, x: number, z: number) {
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < r.x.length; i++) {
    const d = (r.x[i]! - x) ** 2 + (r.z[i]! - z) ** 2;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return { s: best * r.step, d: Math.sqrt(bd) };
}

export interface RouteSample {
  x: Float32Array;
  y: Float32Array;
  z: Float32Array;
  heading: Float32Array;
  highway: Uint8Array;
  length: number;
  step: number;
  stops: { s: number; stop: Stop }[];
}

const STEP = 1.0;

/** Resample a closed route every metre (lane-offset, draped on the terrain), with headings and the
 *  route-distance of each stop. */
export function sampleRoute(r: RouteDef): RouteSample {
  const pts = r.pts;
  const n = pts.length;
  const xs: number[] = [];
  const zs: number[] = [];
  const hw: number[] = [];
  for (let i = 0; i < n; i++) {
    const [ax, az, off] = pts[i]!;
    const [bx, bz] = pts[(i + 1) % n]!;
    const len = Math.hypot(bx - ax, bz - az);
    const dx = (bx - ax) / len;
    const dz = (bz - az) / len;
    // left of travel in a Y-up, -Z-north world: (dz, -dx)
    const lx = dz * off;
    const lz = -dx * off;
    const k = Math.max(1, Math.round(len / STEP));
    for (let j = 0; j < k; j++) {
      const t = j / k;
      xs.push(ax + (bx - ax) * t + lx);
      zs.push(az + (bz - az) * t + lz);
      hw.push(off > 4 ? 1 : 0);
    }
  }
  // smooth corners (moving average) so vehicles turn instead of snapping
  const m = xs.length;
  const sx = new Float32Array(m);
  const sz = new Float32Array(m);
  const W = 6;
  for (let i = 0; i < m; i++) {
    let ax = 0;
    let az = 0;
    for (let k = -W; k <= W; k++) {
      ax += xs[(i + k + m) % m]!;
      az += zs[(i + k + m) % m]!;
    }
    sx[i] = ax / (2 * W + 1);
    sz[i] = az / (2 * W + 1);
  }
  const heading = new Float32Array(m);
  const y = new Float32Array(m);
  for (let i = 0; i < m; i++) {
    const j = (i + 1) % m;
    heading[i] = Math.atan2(sx[j]! - sx[i]!, sz[j]! - sz[i]!);
    y[i] = heightAt(sx[i]!, sz[i]!);
  }
  const stops = r.stops.map((stop) => {
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i < m; i++) {
      const d = Math.hypot(sx[i]! - stop.x, sz[i]! - stop.z);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return { s: best * STEP, stop };
  });
  return { x: sx, y, z: sz, heading, highway: Uint8Array.from(hw), length: m * STEP, step: STEP, stops };
}
