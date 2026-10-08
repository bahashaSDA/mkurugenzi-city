import type { Placement } from '../../world/kit/KitInstances';

// Mtaa wa Mkurugenzi layout (research/references/hub-mtaa-wa-mkurugenzi.md).
//   * Market lane: murram, N-S along x = 0, lined with kiosks facing the lane.
//   * Central avenue: tarmac at x = 14 (see TestMap Avenue), block flats on its east frontage.
//   * Dense single-room shacks behind, ~1 m footpaths, the odd E-W path, water tanks.
// Kit pieces face +Z by default (their door/serving side), so rotY turns the front.

const FACE_EAST = Math.PI / 2; // front toward +X
const FACE_WEST = -Math.PI / 2; // front toward -X
const SHACKS = ['shack_mabati_green', 'shack_mabati_blue', 'shack_mud_plaster'];
const KIOSKS = ['kiosk_pesa', 'kiosk_duka'];

type Rect = [x0: number, z0: number, x1: number, z1: number];
// Kept clear: spawn plaza + letters, the Phase 0 collision test course (smoke tests use it),
// the avenue, the market lane, and the matatu stage to the south (SPEC 6: stage at z = 120).
const KEEP_CLEAR: Rect[] = [
  [-16, -16, 16, 18],
  [-46, -12, -8, 16],
  [9, -400, 21, 400],
  [-9, -400, 9, 400],
  [-30, 104, 40, 150],
];
const clear = (x: number, z: number, pad = 0) =>
  !KEEP_CLEAR.some(([x0, z0, x1, z1]) => x > x0 - pad && x < x1 + pad && z > z0 - pad && z < z1 + pad);

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function buildHubLayout(seed = 254): Placement[] {
  const r = rng(seed);
  const out: Placement[] = [];
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)]!;

  // --- kiosks along the market lane, with chairs and jerricans out front ---
  for (let z = -150; z <= 100; z += 4.6) {
    for (const side of [-1, 1]) {
      if (r() < 0.25 || Math.abs(z) < 18) continue;
      const x = side * 6.6;
      out.push({ piece: pick(KIOSKS), x, z: z + (r() - 0.5) * 0.6, rotY: side < 0 ? FACE_EAST : FACE_WEST });
      if (r() < 0.45) out.push({ piece: 'plastic_chair', x: side * 4.2, z: z + (r() - 0.5) * 2, rotY: r() * Math.PI * 2 });
      if (r() < 0.35) out.push({ piece: 'jerrican', x: side * 4.7, z: z + 1.2 + r(), rotY: r() * Math.PI * 2 });
    }
  }

  // --- power poles along the lane and the avenue ---
  for (let z = -150; z <= 100; z += 32) if (Math.abs(z) > 14) out.push({ piece: 'power_pole', x: -3.8, z, rotY: 0 });
  for (let z = 95; z >= -260; z -= 35) out.push({ piece: 'power_pole', x: 19.6, z, rotY: Math.PI / 2 });

  // --- block flats fronting the avenue (east side) ---
  for (const z of [-110, -78, -46, 46, 78]) out.push({ piece: 'block_flat', x: 27.5, z, rotY: FACE_WEST });

  // --- shack fields west of the lane and east of the flats ---
  const field = (x0: number, x1: number, z0: number, z1: number) => {
    let row = 0;
    for (let z = z0; z <= z1; z += 4.9, row++) {
      if (row % 6 === 5) continue; // an E-W footpath every sixth row
      for (let x = x0; x <= x1; x += 4.5) {
        const jx = x + (r() - 0.5) * 0.7;
        const jz = z + (r() - 0.5) * 0.9;
        if (r() < 0.1 || !clear(jx, jz, 2.2)) continue;
        out.push({ piece: pick(SHACKS), x: jx, z: jz, rotY: Math.floor(r() * 4) * (Math.PI / 2) + (r() - 0.5) * 0.08 });
        if (r() < 0.12 && clear(jx + 2.4, jz, 0.8)) out.push({ piece: 'water_tank', x: jx + 2.45, z: jz + (r() - 0.5), rotY: 0 });
      }
    }
  };
  field(-78, -12, -150, 100);
  field(37, 80, -150, 100);

  return out;
}
