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
  { id: 'expressway', kind: 'highway', width: 20, pts: [[-1560, -312], [-1100, -312], [-300, -312], [300, -312], [1100, -312], [1560, -312]] },
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

  // ---- outer towns (SPEC 6 districts, pushed out towards the map edges so they feel far) ----
  // CBD: Mkurugenzi Avenue north from the expressway, a grid of streets round Mkurugenzi Tower
  { id: 'cbd-avenue', kind: 'tarmac', width: 12, pts: [[14, -322], [14, -1460]] },
  ...[-850, -950, -1050, -1150, -1250, -1350].map((z, i) => ({ id: `cbd-st-${i}`, kind: 'tarmac' as const, width: 9, pts: [[-260, z], [290, z]] as [number, number][] })),
  { id: 'cbd-west', kind: 'tarmac', width: 9, pts: [[-260, -800], [-260, -1400]] },
  { id: 'cbd-east', kind: 'tarmac', width: 9, pts: [[290, -800], [290, -1400]] },
  // Wakurugenzi Arena (north-east), linked to the CBD and the expressway
  { id: 'arena-road', kind: 'tarmac', width: 9, pts: [[290, -1050], [1100, -1050], [1100, -322]] },
  // Phil-It Studios town (east)
  { id: 'east-link', kind: 'tarmac', width: 8, pts: [[1100, -302], [1100, 260]] },
  { id: 'east-st', kind: 'tarmac', width: 7, pts: [[900, -60], [1400, -60]] },
  { id: 'east-st-2', kind: 'tarmac', width: 7, pts: [[900, 120], [1400, 120]] },
  // Utafraaaia estate (north-west): leafy streets of walled homes
  { id: 'estate-road', kind: 'tarmac', width: 7, pts: [[-1100, -322], [-1100, -1300]] },
  ...[-650, -800, -950, -1100, -1250].map((z, i) => ({ id: `estate-st-${i}`, kind: 'tarmac' as const, width: 6, pts: [[-1400, z], [-800, z]] as [number, number][] })),
  // Freddie's School town (south-west), reached past Kibera
  { id: 'sw-road', kind: 'tarmac', width: 7, pts: [[-145, 330], [-500, 520], [-850, 700], [-1450, 700]] },
  { id: 'sw-st', kind: 'tarmac', width: 7, pts: [[-1050, 560], [-1050, 1000]] },
  { id: 'sw-st-2', kind: 'tarmac', width: 6, pts: [[-1250, 850], [-850, 850]] },
  // Storyteller's Fire on the southern hills
  { id: 'hill-road', kind: 'tarmac', width: 7, pts: [[300, 330], [300, 700], [360, 980]] },
  { id: 'fire-track', kind: 'murram', width: 4.5, pts: [[360, 980], [330, 1080], [380, 1150], [340, 1210]] },
];

/** Towns: level ground, a name for the HUD and map, and the area that counts as "in town". */
export interface Town {
  id: string;
  name: string;
  x: number;
  z: number;
  rx: number; // half-size of the levelled area
  rz: number;
}
export const TOWNS: Town[] = [
  { id: 'cbd', name: 'CBD: Mkurugenzi Tower', x: 15, z: -1100, rx: 330, rz: 340 },
  { id: 'arena', name: 'Wakurugenzi Arena', x: 1100, z: -1100, rx: 140, rz: 120 },
  { id: 'east', name: 'Phil-It Studios Town', x: 1150, z: 30, rx: 290, rz: 220 },
  { id: 'estate', name: 'Utafraaaia Estate', x: -1100, z: -950, rx: 330, rz: 360 },
  { id: 'sw', name: "Freddie's School Town", x: -1050, z: 780, rx: 260, rz: 260 },
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
