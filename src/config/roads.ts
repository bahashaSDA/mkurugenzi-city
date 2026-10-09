// Road network (metres, -Z = north). Kenya drives on the LEFT.
//   tarmac  : 2-lane town roads with faded centre line
//   highway : "Mkurugenzi Expressway", 2+2 lanes with a concrete median (SPEC 6 ring road)
//   murram  : red-earth side roads and shortcuts (not flattened: they follow the hills)
export type RoadKind = 'tarmac' | 'highway' | 'murram';

export interface Road {
  id: string;
  kind: RoadKind;
  width: number;
  pts: [number, number][];
}

export const ROADS: Road[] = [
  // The avenue with the shopping street (kerbs drawn by Roads.tsx), now running the full length
  { id: 'avenue', kind: 'tarmac', width: 8, pts: [[14, 330], [14, -300]] },
  { id: 'expressway', kind: 'highway', width: 20, pts: [[-760, -312], [-300, -312], [300, -312], [760, -312]] },
  { id: 'kibera-road', kind: 'tarmac', width: 7, pts: [[-145, 330], [-145, -300]] },
  { id: 'stage-road', kind: 'tarmac', width: 7, pts: [[-145, 150], [-40, 150], [10, 150]] },
  { id: 'north-street', kind: 'tarmac', width: 7, pts: [[-145, -150], [10, -150]] },
  { id: 'east-road', kind: 'tarmac', width: 7, pts: [[18, -40], [140, -40], [220, 60], [300, 200], [300, 330]] },
  { id: 'ridge-track', kind: 'murram', width: 5, pts: [[300, 330], [250, 380], [210, 440], [180, 520]] },
  { id: 'south-road', kind: 'tarmac', width: 7, pts: [[-145, 330], [14, 330], [300, 330]] },
  // murram shortcuts through Kibera (follow the hillside)
  { id: 'kibera-main', kind: 'murram', width: 4.5, pts: [[-147, 20], [-220, 10], [-300, 30], [-380, 0], [-460, 20]] },
  { id: 'kibera-rail', kind: 'murram', width: 5, pts: [[-147, -90], [-250, -110], [-350, -80], [-470, -100]] },
  { id: 'kibera-cut', kind: 'murram', width: 3.5, pts: [[-300, 30], [-290, -40], [-300, -95]] },
  { id: 'market-cut', kind: 'murram', width: 3.5, pts: [[-12, 40], [-40, 46], [-90, 60], [-145, 64]] },
];

/** Distance from (x, z) to a polyline, and the segment direction there. */
export function distToRoad(r: Road, x: number, z: number): number {
  let best = Infinity;
  for (let i = 0; i < r.pts.length - 1; i++) {
    const [ax, az] = r.pts[i]!;
    const [bx, bz] = r.pts[i + 1]!;
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
    if (d < best) best = d;
  }
  return best;
}

/** True if (x, z) is on or right beside any road (used to keep buildings off roads). */
export function nearRoad(x: number, z: number, pad: number): boolean {
  return ROADS.some((r) => distToRoad(r, x, z) < r.width / 2 + pad);
}
