import { getHubLayout } from '../districts/hub/layout';

// Petrol stations with a garage (Parts 24.2, 24.3): the five `petrol_station` pieces in the towns
// (blender/scripts/build_town_kit.py petrol(): 16 x 11 m canopy over two pump islands at local x = +-5,
// the shop/workshop 12 m behind them). Drive up and stop beside a pump to fill up; stop at the
// workshop bay in front of the shop to have the car repaired. Positions in world metres.

export const FUEL_PRICE = 180; // KSh per litre (Nairobi pump price, 2026)
export const TANK = 45; // litres, every car

export interface Station {
  id: number;
  name: string;
  /** spots a car stops at, beside each pump island (both sides) */
  pumps: { x: number; z: number }[];
  /** the workshop bay in front of the shop */
  bay: { x: number; z: number };
  /** the canopy: centre and rotation (anywhere under it counts as at the pumps) */
  x: number;
  z: number;
  rotY: number;
}

const NAMES = ['CBD Total Energies', 'South Road Total', 'Arena Rubis', 'Studios Shell', 'Estate Ola', "Freddie's Town Kobil"];
let cache: Station[] | null = null;
export function stations(): Station[] {
  if (cache) return cache;
  const out: Station[] = [];
  for (const p of getHubLayout()) {
    if (p.piece !== 'petrol_station') continue;
    const c = Math.cos(p.rotY);
    const s = Math.sin(p.rotY);
    // three.js local: x = Blender x, z = -Blender y (the shop is at Blender +y 12 -> local z -12)
    const at = (lx: number, lz: number) => ({ x: p.x + lx * c + lz * s, z: p.z - lx * s + lz * c });
    out.push({
      id: out.length,
      name: NAMES[out.length % NAMES.length]!,
      pumps: [at(-5, 1.8), at(-5, -1.8), at(5, 1.8), at(5, -1.8)],
      bay: at(0, -6.5),
      x: p.x,
      z: p.z,
      rotY: p.rotY,
    });
  }
  return (cache = out);
}

/** The service a car standing at (x, z) can get here, if any. Anywhere on the forecourt under the
 *  canopy (16 x 11 m) is "at the pumps"; the bay in front of the shop is the garage. */
export function serviceAt(x: number, z: number): { kind: 'fuel' | 'repair'; station: Station } | null {
  for (const st of stations()) {
    if (Math.hypot(st.bay.x - x, st.bay.z - z) < 3.5) return { kind: 'repair', station: st };
    const dx = x - st.x;
    const dz = z - st.z;
    const c = Math.cos(st.rotY);
    const s = Math.sin(st.rotY);
    const lx = dx * c - dz * s;
    const lz = dx * s + dz * c;
    if (Math.abs(lx) < 9 && Math.abs(lz) < 5.5) return { kind: 'fuel', station: st };
    if (st.pumps.some((p) => Math.hypot(p.x - x, p.z - z) < 3)) return { kind: 'fuel', station: st };
  }
  return null;
}

/** The nearest station to (x, z) and how far it is (m). */
export function nearestStation(x: number, z: number): { station: Station; d: number } | null {
  let best: { station: Station; d: number } | null = null;
  for (const st of stations()) {
    const d = Math.hypot(st.x - x, st.z - z);
    if (!best || d < best.d) best = { station: st, d };
  }
  return best;
}
