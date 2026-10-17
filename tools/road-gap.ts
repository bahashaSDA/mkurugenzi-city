// Road vs ground agreement (session 12). Run: npx tsx tools/road-gap.ts
// For every carriageway vertex (and the centre between them) compares the road as drawn (the
// ribbon, which is also the road collider) with the triangulated terrain grids:
//   physics  8 m heightfield: must not poke above the road (else cars ride on hidden ground)
//   visual  16 / 10.7 / 8 m mesh (low/mid/high): must not cover the road
// Pass: every value <= 0.02 m. With carve=0 it reports the old, uncarved heights.
import { heightAt } from '../src/world/heights';
import { WORLD_HALF } from '../src/config/world';
import { allRibbons, carvedHeight, discSurface } from '../src/world/roadSurface';
import { TURNAROUNDS } from '../src/config/roads';

const carve = process.argv[2] !== 'carve=0';
const grid = (n: number) => {
  const cell = (2 * WORLD_HALF) / n;
  const memo = new Map<number, number>();
  const H = (i: number, j: number) => {
    const k = i * 100000 + j;
    let v = memo.get(k);
    if (v === undefined) {
      const x = -WORLD_HALF + i * cell, z = -WORLD_HALF + j * cell;
      v = carve ? carvedHeight(x, z, cell) : heightAt(x, z);
      memo.set(k, v);
    }
    return v;
  };
  return (x: number, z: number) => {
    const gx = (x + WORLD_HALF) / cell, gz = (z + WORLD_HALF) / cell;
    const i = Math.floor(gx), j = Math.floor(gz), fx = gx - i, fz = gz - j;
    const a = H(i, j), b = H(i + 1, j), c = H(i, j + 1), d = H(i + 1, j + 1);
    return fx + fz <= 1 ? a + (b - a) * fx + (c - a) * fz : d + (c - d) * (1 - fx) + (b - d) * (1 - fz);
  };
};
const grids = { physics: grid(500), low: grid(250), mid: grid(375), high: grid(500) };
const worst: Record<string, { e: number; at: string; road: string }> = {};
for (const rb of allRibbons()) {
  const P = rb.position;
  for (let i = 0; i < rb.samples; i++) {
    const pts = [0, 1].map((k) => [P[(i * 2 + k) * 3]!, P[(i * 2 + k) * 3 + 1]!, P[(i * 2 + k) * 3 + 2]!]);
    pts.push(pts[0]!.map((v, k) => (v + pts[1]![k]!) / 2));
    for (const [x, y, z] of pts) {
      for (const [name, g] of Object.entries(grids)) {
        const e = g(x!, z!) - y!;
        if (!worst[name] || e > worst[name]!.e) worst[name] = { e, at: `${x!.toFixed(0)},${z!.toFixed(0)}`, road: rb.road.id };
      }
    }
  }
}
for (const t of TURNAROUNDS) {
  const d = discSurface(t);
  for (let i = 0; i < d.position.length; i += 3) {
    const [x, y, z] = [d.position[i]!, d.position[i + 1]!, d.position[i + 2]!];
    for (const [name, g] of Object.entries(grids)) {
      const e = g(x, z) - y;
      if (e > worst[name]!.e) worst[name] = { e, at: `${x.toFixed(0)},${z.toFixed(0)}`, road: 'turning circle' };
    }
  }
}
let ok = true;
for (const [name, w] of Object.entries(worst)) {
  const pass = w.e <= 0.02;
  ok &&= pass;
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name.padEnd(8)} terrain above road by at most ${w.e.toFixed(3)} m (${w.road} at ${w.at})`);
}
// how deep the carve digs beside the roads (the visible / physical ditch): heightAt - carved, at
// grid vertices outside every road footprint (physics grid)
if (carve) {
  let dig = { d: 0, at: '' };
  const n = 500, cell = (2 * WORLD_HALF) / n;
  for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) {
    const x = -WORLD_HALF + i * cell, z = -WORLD_HALF + j * cell;
    const d = heightAt(x, z) - carvedHeight(x, z, cell);
    if (d > dig.d) dig = { d, at: `${x.toFixed(0)},${z.toFixed(0)}` };
  }
  console.log(`INFO deepest carve below the natural ground (physics grid): ${dig.d.toFixed(2)} m at ${dig.at}`);
}
process.exit(ok ? 0 : 1);
