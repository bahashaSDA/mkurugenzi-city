import type { Placement } from '../../world/kit/KitInstances';
import { nearRoad } from '../../config/roads';
import { buildKiberaLayout } from '../kibera/layout';
import { buildRidgeLayout } from '../ridge/layout';
import { buildTownsLayout } from '../towns/layout';

// Mtaa wa Mkurugenzi layout v2 ("vertical slice"): density at street level first.
//   * Central avenue (tarmac, x = 14, kerbs at x = 10 / 18) lined on BOTH sides by a continuous
//     Eastlands-style shop frontage: facades 4 m back from the kerb, mabati verandas over a
//     dusty pavement, power poles and street trees on the shoulder, alleys every few plots.
//   * Market lane (murram, x = LANE_X) behind the west frontage, lined with steel kiosks.
//   * Dense shack fields beyond, block flats behind the east frontage.
// Kit pieces face +Z by default (door/serving side), so rotY turns the front.

export const AVENUE_X = 14;
export const KERB_W = 10; // west kerb line
export const KERB_E = 18; // east kerb line
export const LANE_X = -12;
export const STREET_Z: [number, number] = [-150, 100];

const FACE_EAST = Math.PI / 2; // front toward +X
const FACE_WEST = -Math.PI / 2; // front toward -X
const SHACKS = ['shack_mabati_green', 'shack_mabati_blue', 'shack_mud_plaster'];
const KIOSKS = ['kiosk_pesa', 'kiosk_duka'];
const SHOPS = ['shop_hardware', 'shop_barber', 'shop_hoteli', 'shop_butchery', 'shop_electronics', 'shop_mshop', 'shop_boutique'];
const UNIT_W = 4.6; // shop plot width (street_kit)
const FRONT_SETBACK = 4; // kerb to facade: 1.7 m shoulder + 2.3 m veranda

type Rect = [x0: number, z0: number, x1: number, z1: number];
// Kept clear: spawn plaza + letters, the avenue, the market lane, the matatu stage (SPEC 6).
const PLAZA: Rect = [-16, -17, 9, 19];
export const MARKET: Rect = [-70, 36, -18, 88]; // Soko la Mkurugenzi (owner market photo)
const KEEP_CLEAR: Rect[] = [PLAZA, [9, -400, 19, 400], [LANE_X - 4.4, -400, LANE_X + 4.4, 400], [-30, 104, 40, 150], MARKET];
const clear = (x: number, z: number, pad = 0) =>
  !KEEP_CLEAR.some(([x0, z0, x1, z1]) => x > x0 - pad && x < x1 + pad && z > z0 - pad && z < z1 + pad);
const inPlaza = (z: number) => z > PLAZA[1] - UNIT_W / 2 && z < PLAZA[3] + UNIT_W / 2;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

let cached: Placement[] | null = null;
/** The hub layout, built once and shared (terrain mask, kit instances, cables, tests). */
export function getHubLayout(): Placement[] {
  return (cached ??= [...buildHubLayout(), ...buildMarketLayout(), ...buildKiberaLayout(), ...buildRidgeLayout(), ...buildTownsLayout()]);
}

export function buildHubLayout(seed = 254): Placement[] {
  const r = rng(seed);
  const out: Placement[] = [];
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)]!;

  // --- shop frontage along both sides of the avenue ---
  for (const side of [-1, 1] as const) {
    const facade = side < 0 ? KERB_W - FRONT_SETBACK : KERB_E + FRONT_SETBACK;
    const x = facade + side * 4.5; // unit is 9 m deep
    let sinceAlley = 0;
    let last = '';
    for (let z = STREET_Z[0]; z <= STREET_Z[1]; z += UNIT_W) {
      if (side < 0 && inPlaza(z)) continue;
      // an alley (one empty plot) every 5-8 shops, leading back to the lane / shacks
      if (sinceAlley > 4 && r() < 0.3) {
        sinceAlley = 0;
        continue;
      }
      sinceAlley++;
      let s = pick(SHOPS);
      if (s === last) s = pick(SHOPS); // avoid identical neighbours
      last = s;
      out.push({ piece: s, x, z, rotY: side < 0 ? FACE_EAST : FACE_WEST });
    }
  }

  // --- shoulder: power poles (crossarm across the street) and street trees ---
  for (let z = 95; z >= -150; z -= 32) {
    out.push({ piece: 'power_pole', x: KERB_W - 0.7, z, rotY: 0 });
    out.push({ piece: 'power_pole', x: KERB_E + 0.7, z: z - 16, rotY: 0 });
  }
  for (let z = 88; z >= -150; z -= 21 + r() * 8) {
    const west = r() < 0.5;
    const tz = z + (r() - 0.5) * 4;
    if (west && inPlaza(tz)) continue;
    // ~60% jacarandas: it is October and they are in bloom across Nairobi
    out.push({ piece: r() < 0.6 ? 'tree_jacaranda' : 'tree_street', x: west ? KERB_W - 1.0 : KERB_E + 1.0, z: tz, rotY: r() * Math.PI * 2 });
  }

  // --- market lane kiosks (facing the lane), with chairs and jerricans ---
  for (let z = -150; z <= 100; z += 4.6) {
    for (const side of [-1, 1]) {
      if (r() < 0.25 || inPlaza(z)) continue;
      const x = LANE_X + side * 4.4;
      out.push({ piece: pick(KIOSKS), x, z: z + (r() - 0.5) * 0.6, rotY: side < 0 ? FACE_EAST : FACE_WEST });
      if (r() < 0.45) out.push({ piece: 'plastic_chair', x: LANE_X + side * 2.1, z: z + (r() - 0.5) * 2, rotY: r() * Math.PI * 2 });
      if (r() < 0.35) out.push({ piece: 'jerrican', x: LANE_X + side * 2.6, z: z + 1.2 + r(), rotY: r() * Math.PI * 2 });
    }
  }
  for (let z = -150; z <= 100; z += 32) if (!inPlaza(z)) out.push({ piece: 'power_pole', x: LANE_X + 2.6, z, rotY: 0 });

  // --- block flats behind the east frontage ---
  for (const z of [-110, -55, 45, 80]) out.push({ piece: 'block_flat', x: 41, z, rotY: FACE_WEST });

  // --- shack fields ---
  const field = (x0: number, x1: number, z0: number, z1: number) => {
    let row = 0;
    for (let z = z0; z <= z1; z += 4.9, row++) {
      if (row % 6 === 5) continue; // an E-W footpath every sixth row
      for (let x = x0; x <= x1; x += 4.5) {
        const jx = x + (r() - 0.5) * 0.7;
        const jz = z + (r() - 0.5) * 0.9;
        if (r() < 0.1 || !clear(jx, jz, 2.2) || nearRoad(jx, jz, 2.5)) continue;
        out.push({ piece: pick(SHACKS), x: jx, z: jz, rotY: Math.floor(r() * 4) * (Math.PI / 2) + (r() - 0.5) * 0.08 });
        if (r() < 0.12 && clear(jx + 2.4, jz, 0.8)) out.push({ piece: 'water_tank', x: jx + 2.45, z: jz + (r() - 0.5), rotY: 0 });
      }
    }
  };
  field(-80, -21, -150, 100);
  field(50, 86, -150, 100);

  return out;
}

/** The market: rows of produce stalls under big umbrellas with aisles between, sacks and crates,
 *  and a chips booth. Stall fronts (+Z local) face the aisles. */
export function buildMarketLayout(seed = 77): Placement[] {
  const r = rng(seed);
  const out: Placement[] = [];
  const [x0, z0, x1, z1] = MARKET;
  // aisles every 9 m; stall rows on both sides of each aisle facing it
  for (let az = z0 + 6; az < z1 - 3; az += 9) {
    for (const side of [-1, 1]) {
      const z = az + side * 2.6;
      for (let x = x0 + 3; x < x1 - 2; x += 3.1 + r() * 0.6) {
        if (r() < 0.12) continue;
        const piece = r() < 0.62 ? 'market_stall' : 'market_stall_b';
        out.push({ piece, x: x + (r() - 0.5) * 0.4, z: z + (r() - 0.5) * 0.4, rotY: side < 0 ? 0 : Math.PI });
        if (r() < 0.25) out.push({ piece: r() < 0.5 ? 'sack_pile' : 'crate_stack', x: x + 1.5, z: z + side * 1.4, rotY: r() * 6 });
      }
    }
  }
  out.push({ piece: 'chips_booth', x: x1 + 1.5, z: z0 + 4, rotY: Math.PI / 2 });
  out.push({ piece: 'chips_booth', x: -25, z: 118, rotY: Math.PI / 2 }); // by the matatu stage
  out.push({ piece: 'crate_stack', x: -23, z: 115, rotY: 0.3 });
  return out;
}
