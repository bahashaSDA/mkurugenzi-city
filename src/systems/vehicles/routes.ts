import { nearestRoad, surfaceAt } from '../../world/roadSurface';
import { TURNAROUNDS, type Turnaround } from '../../config/roads';

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
    // (it closed the loop at (18, -40), the avenue's east KERB: the last 136 m ran down the east
    // pavement where people walk. The junction is on the avenue's centre line.)
    pts: [[14, 132, T], [14, 330, T], [300, 330, T], [300, 200, T], [220, 60, T], [140, -40, T], [14, -40, T]],
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
    // up Utafraaaia Drive and round the turning circle at the top (no U-turn in the road)
    pts: [[14, 100, T], [14, -312, HW], [-1100, -312, T], [-1100, -1306, T], [-1100, -312, HW], [14, -312, T]],
    stops: [
      { name: 'Matatu Stage', x: 14, z: 100, dwell: 9 },
      { name: 'Utafraaaia Estate', x: -1100, z: -900, dwell: 7 },
      { name: 'Utafraaaia House', x: -1100, z: -1240, dwell: 6 },
    ],
  },
  {
    id: 'E',
    name: "Route 105: Kibera - Freddie's School",
    // a real loop: out along Stage Road and Kibera Road, round the turning circle past the school,
    // back by South Road and up the avenue (it used to reverse in the middle of Kibera Road)
    pts: [[14, 150, T], [-145, 150, T], [-145, 330, T], [-500, 520, T], [-850, 700, T], [-1050, 700, T], [-1050, 1006, T], [-1050, 700, T], [-850, 700, T], [-500, 520, T], [-145, 330, T], [14, 330, T]],
    stops: [
      { name: 'Kibera Road', x: -145, z: 250, dwell: 6 },
      { name: "Freddie's School Town", x: -1050, z: 780, dwell: 8 },
      { name: 'Mashinani Junction', x: -500, z: 520, dwell: 5 },
      { name: 'South Road', x: 60, z: 330, dwell: 5 },
    ],
  },
  {
    id: 'F',
    name: 'Route 120: Phil-It Studios - Arena',
    pts: [[14, -312, HW], [1100, -312, T], [1100, 266, T], [1100, -1050, T], [290, -1050, T], [14, -1050, T]],
    stops: [
      { name: 'Phil-It Studios Town', x: 1100, z: 20, dwell: 8 },
      { name: 'Wakurugenzi Arena', x: 1100, z: -1000, dwell: 8 },
      { name: 'CBD: Mkurugenzi Tower', x: 100, z: -1050, dwell: 6 },
    ],
  },
  {
    id: 'X',
    name: 'Expressway',
    // end to end, round the roundabouts that close the expressway (it used to run 110 m past the
    // east end of the road and turn back through the median)
    pts: [[-1428, -312, HW], [1418, -312, HW]],
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
/** half the widest vehicle (bus / nganya) plus a margin: what must stay on the carriageway */
const BODY_HALF = 1.45;

/**
 * Corner smoothing and the swing into a turning circle can carry a path's edge off the tarmac (onto
 * a kerb, a pavement, the verge). Nudge every sample back until a full bus width either side of it
 * is on the road, then smooth lightly so the nudges don't become kinks. In place.
 */
function keepOnRoad(sx: Float32Array, sz: Float32Array) {
  const m = sx.length;
  const nudge = () => {
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % m;
      const k0 = (i - 1 + m) % m;
      const dx = sx[j]! - sx[k0]!;
      const dz = sz[j]! - sz[k0]!;
      const len = Math.hypot(dx, dz) || 1;
      const lx = dz / len; // left of travel
      const lz = -dx / len;
      for (let it = 0; it < 4; it++) {
        const l = nearestRoad(sx[i]! + lx * BODY_HALF, sz[i]! + lz * BODY_HALF, 6);
        const r = nearestRoad(sx[i]! - lx * BODY_HALF, sz[i]! - lz * BODY_HALF, 6);
        const ol = l ? l.out : 0; // no road at all within reach: leave it (not a road stretch)
        const or = r ? r.out : 0;
        if (ol < 0.02 && or < 0.02) break;
        const shift = (or - ol) * 0.6 + Math.sign(or - ol) * 0.02;
        sx[i] = sx[i]! + lx * shift;
        sz[i] = sz[i]! + lz * shift;
      }
    }
  };
  const smooth = (W: number) => {
    const ax = Float32Array.from(sx);
    const az = Float32Array.from(sz);
    for (let i = 0; i < m; i++) {
      let x = 0;
      let z = 0;
      for (let k = -W; k <= W; k++) {
        x += ax[(i + k + m) % m]!;
        z += az[(i + k + m) % m]!;
      }
      sx[i] = x / (2 * W + 1);
      sz[i] = z / (2 * W + 1);
    }
  };
  nudge();
  smooth(2);
  nudge();
}

/** Resample a closed route every metre (lane-offset, draped on the terrain), with headings and the
 *  route-distance of each stop. */
export function sampleRoute(r: RouteDef): RouteSample {
  const pts = r.pts;
  const n = pts.length;
  const xs: number[] = [];
  const zs: number[] = [];
  const hw: number[] = [];
  const turnAt = (x: number, z: number): Turnaround | undefined => TURNAROUNDS.find((t) => Math.hypot(t.x - x, t.z - z) < 4);
  const lane = (i: number) => {
    // segment i: start, unit direction, length, lane offset (left of travel)
    const [ax, az, off] = pts[i % n]!;
    const [bx, bz] = pts[(i + 1) % n]!;
    const len = Math.hypot(bx - ax, bz - az);
    return { ax, az, bx, bz, dx: (bx - ax) / len, dz: (bz - az) / len, len, off };
  };
  for (let i = 0; i < n; i++) {
    const g = lane(i);
    // left of travel in a Y-up, -Z-north world: (dz, -dx)
    const lx = g.dz * g.off;
    const lz = -g.dx * g.off;
    const ta = turnAt(g.ax, g.az);
    const tb = turnAt(g.bx, g.bz);
    const t0 = ta ? ta.r * 0.8 : 0;
    const t1 = tb ? tb.r * 0.8 : 0;
    const usable = g.len - t0 - t1;
    const k = Math.max(1, Math.round(usable / STEP));
    for (let j = 0; j < k; j++) {
      const d = t0 + (usable * j) / k;
      xs.push(g.ax + g.dx * d + lx);
      zs.push(g.az + g.dz * d + lz);
      hw.push(g.off > 4 ? 1 : 0);
    }
    if (tb) {
      // round the turnaround, clockwise on the map (left-hand traffic), from the end of this lane
      // to the start of the next one; around the island if there is one
      const h = lane(i + 1);
      const ex = g.bx - g.dx * t1 + lx;
      const ez = g.bz - g.dz * t1 + lz;
      const sx = h.ax + h.dx * (tb.r * 0.8) + h.dz * h.off;
      const sz = h.az + h.dz * (tb.r * 0.8) - h.dx * h.off;
      const ta0 = Math.atan2(ez - tb.z, ex - tb.x);
      let ta1 = Math.atan2(sz - tb.z, sx - tb.x);
      while (ta1 <= ta0 + 0.3) ta1 += Math.PI * 2;
      const r0 = Math.hypot(ex - tb.x, ez - tb.z);
      const r1 = Math.hypot(sx - tb.x, sz - tb.z);
      const ring = tb.island ? tb.island + 4.5 : tb.r * 0.62;
      const steps = Math.max(8, Math.round(((ta1 - ta0) * ring) / STEP));
      for (let j = 1; j < steps; j++) {
        const f = j / steps;
        const th = ta0 + (ta1 - ta0) * f;
        // ease from the lane onto the ring and back off it
        const rr = f < 0.25 ? r0 + (ring - r0) * (f / 0.25) : f > 0.75 ? ring + (r1 - ring) * ((f - 0.75) / 0.25) : ring;
        xs.push(tb.x + Math.cos(th) * rr);
        zs.push(tb.z + Math.sin(th) * rr);
        hw.push(0);
      }
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
  keepOnRoad(sx, sz);
  const heading = new Float32Array(m);
  const y = new Float32Array(m);
  for (let i = 0; i < m; i++) {
    const j = (i + 1) % m;
    heading[i] = Math.atan2(sx[j]! - sx[i]!, sz[j]! - sz[i]!);
    y[i] = surfaceAt(sx[i]!, sz[i]!); // the road as drawn
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
