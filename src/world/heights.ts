import { distToRoad, ROADS, TOWNS } from '../config/roads';

// World height field (metres). Pure and deterministic: terrain mesh, physics heightfield and every
// layout that places things on the ground all call the same function.
//   * central mtaa, avenue, market and stage: flat (y = 0)
//   * Kibera: a valley-side hill rising to the west (~20 m), as in the owner's Kibera photo
//   * Rocky Ridge (south-east): broken rocky hills
//   * tarmac roads and the highway are graded flat into the slopes; murram follows the ground

function hash(x: number, z: number) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function noise(x: number, z: number) {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const fx = x - xi;
  const fz = z - zi;
  const u = fx * fx * (3 - 2 * fx);
  const v = fz * fz * (3 - 2 * fz);
  const a = hash(xi, zi) + (hash(xi + 1, zi) - hash(xi, zi)) * u;
  const b = hash(xi, zi + 1) + (hash(xi + 1, zi + 1) - hash(xi, zi + 1)) * u;
  return a + (b - a) * v;
}
function fbm(x: number, z: number, oct = 4) {
  let s = 0;
  let a = 0.5;
  for (let i = 0; i < oct; i++) {
    s += noise(x, z) * a;
    x *= 2.03;
    z *= 2.03;
    a *= 0.5;
  }
  return s;
}
const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

export const RIDGE = { x: 300, z: 440, r: 170 };
export const KIBERA = { x0: -460, x1: -150, z0: -290, z1: 300 };

const PAVED = ROADS.filter((r) => r.kind !== 'murram');
const TRACKS = ROADS.filter((r) => r.kind === 'murram');

// ?testcourse: the collision course at (-600, 600) needs flat ground (it sits on the Kibera hill)
const TEST_PAD = typeof location !== 'undefined' && new URLSearchParams(location.search).has('testcourse');

export const FIRE_HILL = { x: 340, z: 1210, r: 330, h: 42 };
const EDGE0 = 1440;
const EDGE1 = 1590;

/** Smooth large-scale landform (no small noise): what roads and towns are graded onto. */
function macro(x: number, z: number) {
  const west = smooth(-150, -470, x);
  let h = west * (20 + 3 * Math.sin(z * 0.012));
  const fd = Math.hypot(x - FIRE_HILL.x, z - FIRE_HILL.z);
  h += FIRE_HILL.h * smooth(FIRE_HILL.r, 0, fd) ** 1.6; // the southern hills (Storyteller's Fire on top)
  h += smooth(EDGE0, EDGE1, Math.max(Math.abs(x), Math.abs(z))) * 40; // map edge rises into hills (SPEC 9)
  return h;
}

/** Pull h towards each town's level inside (and just around) its area. */
function townLevel(x: number, z: number, h: number) {
  for (const t of TOWNS) {
    const k = smooth(1, 0, Math.max((Math.abs(x - t.x) - t.rx) / 60, (Math.abs(z - t.z) - t.rz) / 60, 0));
    if (k > 0) h += (macro(t.x, t.z) - h) * k;
  }
  return h;
}

export function heightAt(x: number, z: number): number {
  let h = macro(x, z);
  // Kibera hillside folds
  const west = smooth(-150, -470, x);
  h += west * (fbm(x * 0.01, z * 0.01) - 0.5) * 6;
  // Rocky ridge: rugged peaks
  const rd = Math.hypot(x - RIDGE.x, z - RIDGE.z);
  let ridge = smooth(RIDGE.r, RIDGE.r * 0.25, rd);
  // keep the murram track over the ridge walkable: no crags right under it
  if (ridge > 0) for (const r of TRACKS) ridge *= 1 - smooth(r.width / 2 + 10, r.width / 2 + 1.5, distToRoad(r, x, z));
  h += ridge * (14 * fbm(x * 0.02, z * 0.02) + 6 * Math.abs(fbm(x * 0.07 + 9, z * 0.07) - 0.5) * 2);
  // gentle rolling countryside between the towns
  const far = smooth(500, 900, Math.hypot(x, z));
  h += far * (fbm(x * 0.006 + 3, z * 0.006 - 7) - 0.5) * 14;
  // towns sit on level ground
  h = townLevel(x, z, h);
  // grade paved roads onto the smooth landform (levelled through towns, so no trenches)
  let base = NaN;
  for (const r of PAVED) {
    const d = distToRoad(r, x, z);
    const k = smooth(r.width / 2 + 8, r.width / 2 + 1, d);
    if (k > 0) {
      if (Number.isNaN(base)) base = townLevel(x, z, macro(x, z));
      h += (base - h) * k;
    }
  }
  if (TEST_PAD) h *= 1 - smooth(70, 45, Math.max(Math.abs(x + 600), Math.abs(z - 600)));
  return h;
}
