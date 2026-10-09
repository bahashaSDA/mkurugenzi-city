// Mkurugenzi Beach (east coast). Like GTA V: drive the coast road, cross the sand, then open sea
// to the horizon. Everything (terrain, ocean shader, swimming, map) shares these numbers.
//   x < ~1440 : land (Phil-It Studios town, the coast road)
//   1440..shore : the beach, rising ~2.4 m from the waterline to the road
//   shore..   : a sandy swimming shelf (chest deep ~40 m out), then the drop to deep water
export const SEA_Y = 0;
export const COAST_ROAD_X = 1440;
const SHORE_X = 1585;
const BEACH_W = 140; // waterline -> back of the beach

/** Waterline x for a given z (a gently curving bay, not a ruler line). Mirrored in Ocean.tsx GLSL. */
export function shoreX(z: number): number {
  return SHORE_X + 28 * Math.sin(z * 0.0041) + 11 * Math.sin(z * 0.0113 + 1.3);
}

/** Signed distance seaward from the waterline (negative on the beach). */
export function seaward(x: number, z: number): number {
  return x - shoreX(z);
}

/** Beach and seabed height (m) at distance d seaward of the waterline. Mirrored in Ocean.tsx GLSL. */
export function coastProfile(d: number): number {
  if (d <= 0) {
    const t = Math.min(1, -d / BEACH_W);
    return SEA_Y + 2.4 * t * t * (3 - 2 * t) + 0.25 * Math.min(1, -d / 12); // berm a few metres up the sand
  }
  // gentle shelf (~1.4 m deep at 40 m), then the drop-off to deep water
  return SEA_Y - Math.min(45, 0.028 * d + 0.00032 * d * d);
}

/** 0 inland, 1 on the beach and at sea: how much the coast profile replaces the land height. */
export function coastWeight(x: number, z: number): number {
  const d = seaward(x, z);
  const t = Math.max(0, Math.min(1, (d + 230) / 110));
  return t * t * (3 - 2 * t);
}

/** Water depth over ground of height `ground` (0 on land). */
export function waterDepth(ground: number): number {
  return Math.max(0, SEA_Y - ground);
}
