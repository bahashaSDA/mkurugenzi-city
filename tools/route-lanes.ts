// Every traffic route must keep a full-width bus on the carriageway: for each route sample, the
// points half a bus-width (+ margin) either side of it must be on a road (or a turnaround disc).
//   npx tsx tools/route-lanes.ts        (exit 1 on any violation)
import { ROUTES, sampleRoute } from '../src/systems/vehicles/routes';
import { nearestRoad } from '../src/world/roadSurface';

const HALF = 1.25 + 0.1; // bus / nganya half width + a little paint
let bad = 0;
for (const r of ROUTES) {
  const s = sampleRoute(r);
  const runs: { from: number; to: number; x: number; z: number; worst: number }[] = [];
  for (let i = 0; i < s.x.length; i++) {
    const h = s.heading[i]!;
    const lx = Math.cos(h), lz = -Math.sin(h); // left of travel
    let worst = 0;
    for (const k of [-1, 0, 1]) {
      const x = s.x[i]! + lx * HALF * k, z = s.z[i]! + lz * HALF * k;
      const n = nearestRoad(x, z, 50);
      worst = Math.max(worst, n ? n.out : 50);
    }
    if (worst > 0.05) {
      const last = runs[runs.length - 1];
      if (last && last.to === i - 1) { last.to = i; last.worst = Math.max(last.worst, worst); }
      else runs.push({ from: i, to: i, x: s.x[i]!, z: s.z[i]!, worst });
    }
  }
  for (const u of runs) {
    bad++;
    console.log(`route ${r.id}: ${u.to - u.from + 1} m off the road from (${u.x.toFixed(1)}, ${u.z.toFixed(1)}), worst ${u.worst.toFixed(2)} m`);
  }
}
console.log(bad ? `FAIL: ${bad} stretches` : 'PASS: every route keeps a bus on the road');
process.exit(bad ? 1 : 0);
