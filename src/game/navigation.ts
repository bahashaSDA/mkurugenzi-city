import { create } from 'zustand';
import { ROADS, type Road, type RoadKind } from '../config/roads';

// GPS for Mkurugenzi City (GTA-style): a road graph built from the SAME polylines the 3D roads are
// made from (config/roads.ts), so a route never cuts through a building or invents a road.
//
//   nodes : road vertices, junctions (where two roads cross, or one ends on another), dead ends
//   edges : the road between two nodes, both directions (the city has no one-way streets yet),
//           cost = travel time (expressway fast, town roads slower, murram slowest)
//   route : A* from the nearest point on the network to the nearest point to the destination,
//           plus the walk/drive onto and off the road. U-turns are not allowed on the
//           expressway (concrete median); elsewhere turning round costs time, so the GPS only
//           suggests one when it really is the better way.
//
// The minimap, the full map and the "next turn" prompt all read the one route in useNav.

export interface GNode {
  id: number;
  x: number;
  z: number;
  edges: GEdge[];
}
export interface GEdge {
  to: number;
  len: number;
  cost: number; // seconds
  road: string;
  kind: RoadKind;
}

const SPEED: Record<RoadKind, number> = { highway: 24, tarmac: 12, murram: 7 };
const SNAP = 3; // metres: points closer than this are the same junction
const UTURN_COST = 25; // seconds: what turning round in the road costs

let graph: { nodes: GNode[] } | null = null;

function segIntersect(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, dx: number, dz: number) {
  const r1x = bx - ax;
  const r1z = bz - az;
  const r2x = dx - cx;
  const r2z = dz - cz;
  const den = r1x * r2z - r1z * r2x;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((cx - ax) * r2z - (cz - az) * r2x) / den;
  const u = ((cx - ax) * r1z - (cz - az) * r1x) / den;
  if (t < -1e-6 || t > 1 + 1e-6 || u < -1e-6 || u > 1 + 1e-6) return null;
  return { t, u, x: ax + r1x * t, z: az + r1z * t };
}

/** Build (once) the road graph from config/roads.ts. */
export function roadGraph(): { nodes: GNode[] } {
  if (graph) return graph;
  const nodes: GNode[] = [];
  const grid = new Map<string, number[]>();
  const nodeAt = (x: number, z: number): number => {
    const gx = Math.floor(x / SNAP);
    const gz = Math.floor(z / SNAP);
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++)
        for (const id of grid.get(`${gx + i},${gz + j}`) ?? []) {
          const n = nodes[id]!;
          if (Math.hypot(n.x - x, n.z - z) < SNAP) return id;
        }
    const id = nodes.length;
    nodes.push({ id, x, z, edges: [] });
    const k = `${gx},${gz}`;
    grid.set(k, [...(grid.get(k) ?? []), id]);
    return id;
  };
  // cut points along each road: its own vertices, crossings with other roads, other roads' ends
  // that land on it (T-junctions; a road ending within the other's half-width + 4 m joins it)
  const cuts = new Map<Road, { seg: number; t: number; x: number; z: number }[]>();
  for (const r of ROADS) cuts.set(r, r.pts.map(([x, z], i) => ({ seg: Math.min(i, r.pts.length - 2), t: i === r.pts.length - 1 ? 1 : 0, x, z })));
  // T-junction stubs: a road's end -> the point where it meets the other road's centre line
  const stubs: { ax: number; az: number; bx: number; bz: number; r: Road }[] = [];
  for (const a of ROADS)
    for (const b of ROADS) {
      if (a === b) continue;
      for (let i = 0; i < a.pts.length - 1; i++) {
        const [ax, az] = a.pts[i]!;
        const [bx, bz] = a.pts[i + 1]!;
        // crossings (computed from a's side only, once per pair order is fine: both get a cut)
        for (let j = 0; j < b.pts.length - 1; j++) {
          const [cx, cz] = b.pts[j]!;
          const [dx, dz] = b.pts[j + 1]!;
          const hit = segIntersect(ax, az, bx, bz, cx, cz, dx, dz);
          if (hit) cuts.get(a)!.push({ seg: i, t: hit.t, x: hit.x, z: hit.z });
        }
        // b's end points close to this segment
        for (const k of [0, b.pts.length - 1]) {
          const [px, pz] = b.pts[k]!;
          const sx = bx - ax;
          const sz = bz - az;
          const t = Math.max(0, Math.min(1, ((px - ax) * sx + (pz - az) * sz) / (sx * sx + sz * sz)));
          const qx = ax + sx * t;
          const qz = az + sz * t;
          if (Math.hypot(px - qx, pz - qz) < a.width / 2 + 4) {
            cuts.get(a)!.push({ seg: i, t, x: qx, z: qz });
            stubs.push({ ax: px, az: pz, bx: qx, bz: qz, r: b });
          }
        }
      }
    }
  const link = (a: number, b: number, r: Road) => {
    if (a === b) return;
    const na = nodes[a]!;
    const nb = nodes[b]!;
    const len = Math.hypot(na.x - nb.x, na.z - nb.z);
    if (na.edges.some((e) => e.to === b)) return;
    const cost = len / SPEED[r.kind];
    na.edges.push({ to: b, len, cost, road: r.id, kind: r.kind });
    nb.edges.push({ to: a, len, cost, road: r.id, kind: r.kind });
  };
  for (const r of ROADS) {
    const list = cuts.get(r)!.sort((p, q) => p.seg - q.seg || p.t - q.t);
    let prev = -1;
    for (const c of list) {
      const id = nodeAt(c.x, c.z);
      if (prev >= 0) link(prev, id, r);
      prev = id;
    }
  }
  for (const st of stubs) link(nodeAt(st.ax, st.az), nodeAt(st.bx, st.bz), st.r);
  // a road that ends near another's END (not its middle) also joins it
  for (const a of ROADS)
    for (const b of ROADS) {
      if (a === b) continue;
      for (const i of [0, a.pts.length - 1])
        for (const j of [0, b.pts.length - 1]) {
          const [ax, az] = a.pts[i]!;
          const [bx, bz] = b.pts[j]!;
          const d = Math.hypot(ax - bx, az - bz);
          if (d >= SNAP && d < Math.max(a.width, b.width) / 2 + 4) link(nodeAt(ax, az), nodeAt(bx, bz), a);
        }
    }
  graph = { nodes };
  return graph;
}

/** Nearest point on the network: the edge, where along it, and how far away. */
export function snapToRoad(x: number, z: number): { a: number; b: number; t: number; x: number; z: number; d: number; kind: RoadKind } | null {
  const { nodes } = roadGraph();
  let best: { a: number; b: number; t: number; x: number; z: number; d: number; kind: RoadKind } | null = null;
  for (const n of nodes)
    for (const e of n.edges) {
      if (e.to < n.id) continue; // each edge once
      const m = nodes[e.to]!;
      const sx = m.x - n.x;
      const sz = m.z - n.z;
      const t = Math.max(0, Math.min(1, ((x - n.x) * sx + (z - n.z) * sz) / (sx * sx + sz * sz || 1)));
      const px = n.x + sx * t;
      const pz = n.z + sz * t;
      const d = Math.hypot(x - px, z - pz);
      if (!best || d < best.d) best = { a: n.id, b: m.id, t, x: px, z: pz, d, kind: e.kind };
    }
  return best;
}

export interface Turn {
  x: number;
  z: number;
  at: number; // metres along the route
  dir: 'left' | 'right' | 'uturn' | 'arrive';
  road: string;
}

export interface RouteResult {
  pts: [number, number][]; // from the start to the destination (road part included)
  length: number; // metres
  seconds: number;
  turns: Turn[];
  onRoad: [number, number]; // index range of pts that is on the road network
}

/**
 * Route from (fx, fz) to (tx, tz). `heading` (radians, 0 = +Z) and `moving` say which way you're
 * going: on the expressway you can't turn round, elsewhere it costs time.
 */
export function findRoute(fx: number, fz: number, tx: number, tz: number, heading?: number, moving = false): RouteResult | null {
  const { nodes } = roadGraph();
  const s = snapToRoad(fx, fz);
  const g = snapToRoad(tx, tz);
  if (!s || !g) return null;
  // same edge, straight along it
  const N = nodes.length;
  const START = N;
  const GOAL = N + 1;
  const pos = (i: number) => (i === START ? s : i === GOAL ? g : nodes[i]!);
  const startEdges: { to: number; cost: number }[] = [];
  const na = nodes[s.a]!;
  const nb = nodes[s.b]!;
  const edgeLen = Math.hypot(nb.x - na.x, nb.z - na.z);
  const sp = SPEED[s.kind];
  // which way along the edge is "ahead"?
  let aheadIsB = true;
  if (heading !== undefined) {
    const ex = nb.x - na.x;
    const ez = nb.z - na.z;
    aheadIsB = Math.sin(heading) * ex + Math.cos(heading) * ez >= 0;
  }
  const backPenalty = moving ? (s.kind === 'highway' ? Infinity : UTURN_COST) : 0;
  const toA = (s.t * edgeLen) / sp + (aheadIsB ? backPenalty : 0);
  const toB = ((1 - s.t) * edgeLen) / sp + (aheadIsB ? 0 : backPenalty);
  if (Number.isFinite(toA)) startEdges.push({ to: s.a, cost: toA });
  if (Number.isFinite(toB)) startEdges.push({ to: s.b, cost: toB });
  const goalFrom = new Map<number, number>();
  const ga = nodes[g.a]!;
  const gb = nodes[g.b]!;
  const gLen = Math.hypot(gb.x - ga.x, gb.z - ga.z);
  const gsp = SPEED[g.kind];
  goalFrom.set(g.a, (g.t * gLen) / gsp);
  goalFrom.set(g.b, ((1 - g.t) * gLen) / gsp);
  // start and goal on the same edge: direct (if it's not behind us on the expressway)
  const sameEdge = (s.a === g.a && s.b === g.b) || (s.a === g.b && s.b === g.a);

  // A* over nodes (+ START/GOAL virtual)
  const h = (i: number) => {
    const p = pos(i);
    return Math.hypot(p.x - g.x, p.z - g.z) / SPEED.highway;
  };
  const dist = new Map<number, number>([[START, 0]]);
  const prev = new Map<number, number>();
  const open: [number, number][] = [[h(START), START]];
  const pop = () => {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i]![0] < open[bi]![0]) bi = i;
    return open.splice(bi, 1)[0]!;
  };
  const relax = (from: number, to: number, c: number) => {
    const nd = dist.get(from)! + c;
    if (nd < (dist.get(to) ?? Infinity)) {
      dist.set(to, nd);
      prev.set(to, from);
      open.push([nd + h(to), to]);
    }
  };
  if (sameEdge) {
    const along = Math.abs(s.t - (s.a === g.a ? g.t : 1 - g.t)) * edgeLen;
    const forward = (s.a === g.a ? g.t : 1 - g.t) >= s.t === aheadIsB;
    const c = along / sp + (forward ? 0 : backPenalty);
    if (Number.isFinite(c)) relax(START, GOAL, c);
  }
  while (open.length) {
    const [, u] = pop();
    if (u === GOAL) break;
    const du = dist.get(u)!;
    if (u === START) {
      for (const e of startEdges) relax(START, e.to, e.cost);
      continue;
    }
    const n = nodes[u]!;
    for (const e of n.edges) relax(u, e.to, e.cost);
    const gc = goalFrom.get(u);
    if (gc !== undefined) relax(u, GOAL, gc);
    void du;
  }
  if (!dist.has(GOAL)) return null;
  const chain: number[] = [];
  for (let c: number | undefined = GOAL; c !== undefined; c = prev.get(c)) chain.unshift(c);
  const pts: [number, number][] = [[fx, fz]];
  const roadStart = pts.length;
  for (const i of chain) {
    const p = pos(i);
    const last = pts[pts.length - 1]!;
    if (Math.hypot(last[0] - p.x, last[1] - p.z) > 0.5) pts.push([p.x, p.z]);
  }
  const roadEnd = pts.length - 1;
  if (Math.hypot(g.x - tx, g.z - tz) > 1) pts.push([tx, tz]);
  // length and turns (at junctions, where the direction changes)
  let length = 0;
  const turns: Turn[] = [];
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1]!;
    const [bx, bz] = pts[i]!;
    length += Math.hypot(bx - ax, bz - az);
    if (i < pts.length - 1) {
      const [cx, cz] = pts[i + 1]!;
      const h1 = Math.atan2(bx - ax, bz - az);
      const h2 = Math.atan2(cx - bx, cz - bz);
      let d = h2 - h1;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      if (Math.abs(d) > 0.5) {
        // heading +Z is 0; turning to smaller heading is a right turn in this world (x right, z down the map)
        const dir = Math.abs(d) > 2.6 ? 'uturn' : d < 0 ? 'right' : 'left';
        turns.push({ x: bx, z: bz, at: length, dir, road: '' });
      }
    }
  }
  turns.push({ x: tx, z: tz, at: length, dir: 'arrive', road: '' });
  return { pts, length, seconds: dist.get(GOAL)!, turns, onRoad: [roadStart, roadEnd] };
}

export interface NavTarget {
  x: number;
  z: number;
  kind: 'objective' | 'waypoint' | 'mission';
  label: string;
}

export const useNav = create<{
  target: NavTarget | null;
  route: RouteResult | null;
  /** distance (m) along the route to the next turn, and that turn */
  next: { turn: Turn; dist: number } | null;
  remaining: number;
  computedAt: number;
}>(() => ({ target: null, route: null, next: null, remaining: 0, computedAt: 0 }));
