import type { Placement } from '../../world/kit/KitInstances';
import { distToRoad, ROADS, type Road } from '../../config/roads';
import { heightAt } from '../../world/heights';

// The outer towns (town_kit.glb): buildings line every street, front doors facing the road
// (kit pieces face local +Z), with landmarks placed by hand. Deterministic.

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// footprint (width along the street, depth back from it) per piece
const SIZE: Record<string, [number, number]> = {
  bld_shops_2: [16, 16], bld_shops_3: [16, 16], bld_shops_4: [18, 18], bld_apart_5: [22, 12], bld_office_8: [26, 20],
  bld_tower_a: [32, 32], bld_tower_b: [28, 28], mk_tower: [44, 44], house_bungalow_a: [23, 23], house_bungalow_b: [23, 23],
  house_maisonette: [23, 23], petrol_station: [17, 26], church: [13, 30], school_block: [35, 24], tree_street: [7, 3],
  tree_jacaranda: [8, 3],
};

/** Homes you can enter (front gates), for the interiors system and missions. */
export const TOWN_HOMES: { x: number; z: number; rotY: number; piece: string }[] = [];
/** Landmarks for missions and the map. */
export const LANDMARKS: Record<string, { x: number; z: number }> = {};

const road = (id: string) => ROADS.find((r) => r.id === id)!;

/** Plots kept free for hand-built landmarks: the Grand Theatre (districts/theatre). [x0, z0, x1, z1] */
export const RESERVED: [number, number, number, number][] = [[-206, -1032, -134, -948]];
const reserved = (x: number, z: number, half: number) =>
  RESERVED.some(([x0, z0, x1, z1]) => x + half > x0 && x - half < x1 && z + half > z0 && z - half < z1);

/** Line one side of a road segment with buildings, fronts facing the road. */
function lineStreet(
  out: Placement[],
  rd: Road,
  side: 1 | -1,
  pick: () => string,
  opts: { from?: number; to?: number; gap?: number; setback?: number; segs?: number[] } = {},
) {
  const r = rng(rd.id.length * 131 + side * 17 + (opts.from ?? 0));
  const segs = opts.segs ?? rd.pts.slice(0, -1).map((_, i) => i);
  for (const i of segs) {
    const [ax, az] = rd.pts[i]!;
    const [bx, bz] = rd.pts[i + 1]!;
    const len = Math.hypot(bx - ax, bz - az);
    const dx = (bx - ax) / len;
    const dz = (bz - az) / len;
    const nx = dz * side; // to the chosen side
    const nz = -dx * side;
    const rotY = Math.atan2(-nx, -nz); // front (+Z local) faces the road
    let s = Math.max(6, opts.from ?? 6);
    const end = Math.min(len - 6, opts.to ?? len);
    while (s < end) {
      const piece = pick();
      const [w, d] = SIZE[piece] ?? [16, 16];
      const off = rd.width / 2 + (opts.setback ?? 3.5) + d / 2;
      const c = s + w / 2;
      if (c + w / 2 > end) break;
      const x = ax + dx * c + nx * off;
      const z = az + dz * c + nz * off;
      // keep clear of every other road (junctions, cross streets)
      const clear = ROADS.every((o) => o === rd || distToRoad(o, x, z) > o.width / 2 + Math.max(w, d) / 2 + 2) && !reserved(x, z, Math.max(w, d) / 2);
      if (clear) {
        out.push({ piece, x, z, rotY, y: heightAt(x, z) });
        if (piece.startsWith('house_')) TOWN_HOMES.push({ x, z, rotY, piece });
      }
      s += w + (opts.gap ?? 1.5) + r() * 2;
    }
  }
}

function trees(out: Placement[], rd: Road, every: number, offset: number, seed: number) {
  const r = rng(seed);
  for (let i = 0; i < rd.pts.length - 1; i++) {
    const [ax, az] = rd.pts[i]!;
    const [bx, bz] = rd.pts[i + 1]!;
    const len = Math.hypot(bx - ax, bz - az);
    const dx = (bx - ax) / len;
    const dz = (bz - az) / len;
    for (let s = 10; s < len - 10; s += every) {
      for (const side of [-1, 1]) {
        const x = ax + dx * s + dz * side * (rd.width / 2 + offset);
        const z = az + dz * s - dx * side * (rd.width / 2 + offset);
        if (ROADS.some((o) => o !== rd && distToRoad(o, x, z) < o.width / 2 + 4) || reserved(x, z, 3)) continue;
        out.push({ piece: r() < 0.55 ? 'tree_jacaranda' : 'tree_street', x, z, rotY: r() * 6.28, y: heightAt(x, z) });
      }
    }
  }
}

function place(out: Placement[], piece: string, x: number, z: number, rotY: number, landmark?: string) {
  out.push({ piece, x, z, rotY, y: heightAt(x, z) });
  if (landmark) LANDMARKS[landmark] = { x, z };
}

export function buildTownsLayout(): Placement[] {
  const out: Placement[] = [];
  TOWN_HOMES.length = 0;
  const r = rng(404);
  const mix = (list: string[], w?: number[]) => () => {
    if (!w) return list[Math.floor(r() * list.length)]!;
    let t = r() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < list.length; i++) if ((t -= w[i]!) <= 0) return list[i]!;
    return list[0]!;
  };

  // ---------------------------------------------------------------- CBD
  // Mkurugenzi Tower on the avenue, towers and offices along it, shops and flats on the cross streets
  place(out, 'mk_tower', 14 - 6 - 4 - 22, -1100, Math.PI / 2, 'Mkurugenzi Tower');
  const avenue = road('cbd-avenue');
  const cbdBig = mix(['bld_tower_a', 'bld_tower_b', 'bld_office_8', 'bld_office_8'], [3, 3, 2, 2]);
  lineStreet(out, avenue, 1, cbdBig, { from: 480, gap: 6 });
  lineStreet(out, avenue, -1, cbdBig, { from: 480, gap: 6 });
  for (let i = 0; i < 6; i++) {
    const st = road(`cbd-st-${i}`);
    const pick = mix(['bld_shops_3', 'bld_shops_4', 'bld_apart_5', 'bld_office_8', 'bld_shops_2'], [3, 3, 2, 2, 1]);
    lineStreet(out, st, 1, pick, { gap: 1 });
    lineStreet(out, st, -1, pick, { gap: 1 });
  }
  for (const id of ['cbd-west', 'cbd-east']) {
    lineStreet(out, road(id), 1, mix(['bld_shops_3', 'bld_apart_5']), {});
    lineStreet(out, road(id), -1, mix(['bld_shops_4', 'bld_office_8']), {});
  }
  trees(out, avenue, 24, 2.5, 7);
  place(out, 'church', -200, -1300, 0);
  place(out, 'petrol_station', 120, -820, Math.PI);

  // ---------------------------------------------------------------- Wakurugenzi Arena
  place(out, 'arena', 1185, -1140, 0, 'Wakurugenzi Arena');
  lineStreet(out, road('arena-road'), 1, mix(['bld_shops_2', 'bld_shops_3', 'bld_apart_5']), { segs: [0], from: 450, to: 760 });
  lineStreet(out, road('arena-road'), -1, mix(['bld_shops_2', 'bld_shops_3']), { segs: [0], from: 450, to: 700 });
  place(out, 'petrol_station', 1040, -980, -Math.PI / 2);

  // ---------------------------------------------------------------- Phil-It Studios town (east)
  place(out, 'studio_hangar', 1300, -150, 0, 'Phil-It Studios');
  const eastPick = mix(['bld_shops_2', 'bld_shops_3', 'bld_shops_4', 'bld_apart_5'], [4, 3, 2, 2]);
  lineStreet(out, road('east-link'), 1, eastPick, { from: 150 });
  lineStreet(out, road('east-link'), -1, eastPick, { from: 150 });
  for (const id of ['east-st', 'east-st-2']) {
    lineStreet(out, road(id), 1, eastPick, {});
    lineStreet(out, road(id), -1, eastPick, {});
  }
  place(out, 'petrol_station', 1080, -260, Math.PI / 2);
  place(out, 'church', 980, 220, Math.PI);

  // ---------------------------------------------------------------- Utafraaaia Estate (north-west)
  const homes = mix(['house_bungalow_a', 'house_bungalow_b', 'house_maisonette'], [3, 3, 2]);
  for (let i = 0; i < 5; i++) {
    const st = road(`estate-st-${i}`);
    lineStreet(out, st, 1, homes, { gap: 3 });
    lineStreet(out, st, -1, homes, { gap: 3 });
    trees(out, st, 30, 1.6, 20 + i);
  }
  lineStreet(out, road('estate-road'), 1, homes, { from: 200, gap: 3 });
  lineStreet(out, road('estate-road'), -1, homes, { from: 200, gap: 3 });
  place(out, 'house_maisonette', -1100, -1335, 0, 'Utafraaaia House');
  place(out, 'petrol_station', -1060, -380, -Math.PI / 2);
  place(out, 'church', -870, -560, Math.PI);

  // ---------------------------------------------------------------- Freddie's School town (south-west)
  place(out, 'school_block', -940, 920, Math.PI, "Freddie's School");
  const swPick = mix(['bld_shops_2', 'bld_shops_3', 'bld_apart_5'], [5, 3, 2]);
  lineStreet(out, road('sw-st'), 1, swPick, {});
  lineStreet(out, road('sw-st'), -1, swPick, {});
  lineStreet(out, road('sw-road'), 1, swPick, { segs: [2], from: 80, to: 520 });
  lineStreet(out, road('sw-road'), -1, swPick, { segs: [2], from: 80, to: 520 });
  lineStreet(out, road('sw-st-2'), -1, homes, { gap: 3 });
  place(out, 'church', -1180, 600, 0);
  place(out, 'petrol_station', -900, 670, 0);

  // ---------------------------------------------------------------- Storyteller's Fire
  place(out, 'fire_circle', 340, 1215, 0, "Storyteller's Fire");
  return out;
}
