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
    pts: [[14, 124, T], [14, -306, HW], [-145, -312, T], [-145, 150, T], [14, 150, T]],
    stops: [
      { name: 'Matatu Stage', x: 14, z: 118, dwell: 9 },
      { name: 'Kibera (Railway)', x: -145, z: -150, dwell: 5 },
      { name: 'Kibera (Main lane)', x: -145, z: 20, dwell: 5 },
    ],
  },
  {
    id: 'B',
    name: 'Route 111: Stage - Rocky Ridge - East Road',
    pts: [[14, 132, T], [14, 330, T], [300, 330, T], [300, 200, T], [220, 60, T], [140, -40, T], [18, -40, T]],
    stops: [
      { name: 'Matatu Stage', x: 14, z: 138, dwell: 9 },
      { name: 'Rocky Ridge', x: 300, z: 300, dwell: 5 },
      { name: 'East Road', x: 140, z: -40, dwell: 4 },
    ],
  },
  {
    id: 'X',
    name: 'Expressway',
    pts: [[-740, -312, HW], [740, -312, HW]],
    stops: [],
  },
];

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
