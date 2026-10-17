#!/usr/bin/env node
// Wheel/ground contact probe (session 12): boards a parked car of the given kind on the given road,
// drives it, and samples every 100 ms for each physics wheel: in contact?, and the gap between the
// wheel's contact point and the VISIBLE road surface (surfaceAt). Also the lowest body point.
//   npm run build && npx vite preview --port 4173
//   node tools/ground-probe.mjs <shotDir> <piecePrefix> <roadId> [tier]
import { chromium } from 'playwright';
const [SP = '.', PIECE = 'rv_cruiser', ROAD = 'hill-road', TIER = 'low'] = process.argv.slice(2);
const GL = process.env.GPU ? ['--use-angle=d3d11', '--enable-gpu'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const browser = await chromium.launch({ args: [...GL, '--ignore-gpu-blocklist'] });
const errors = [];
async function open(q) {
  const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  await page.goto(`http://localhost:4173/?debug&tier=${TIER}&${q}`);
  await page.getByRole('button', { name: 'Tap to enter' }).click({ timeout: 420000 });
  await page.waitForTimeout(4000);
  return page;
}
let page = await open('minimal');
const car = await page.evaluate(([piece, road]) => {
  const mk = window.__mk;
  const cars = mk.useParking.getState().cars.filter((c) => c.piece.startsWith(piece));
  // nearest parked car of that kind to the road's middle point (exported via the debug ROADS? use distance to a hint)
  return cars;
}, [PIECE, ROAD]);
const ROADS_HINT = { 'hill-road': [341, 907], 'beach-road': [1436, -180], 'east-st-2': [1432, 124], 'south-road': [272, 327], 'arena-road': [416, -1046], 'cbd-avenue': [20, -700], 'sw-road': [-408, 475] };
const [hx, hz] = ROADS_HINT[ROAD] ?? [0, 0];
car.sort((a, b) => Math.hypot(a.x - hx, a.z - hz) - Math.hypot(b.x - hx, b.z - hz));
const c = car[0];
console.log('[probe]', c.piece, 'at', c.x.toFixed(0), c.z.toFixed(0), 'dist to hint', Math.hypot(c.x - hx, c.z - hz).toFixed(0));
await page.close();
const lx = -3.2;
page = await open(`minimal&spawn=${(c.x + lx * Math.cos(c.rotY) + Math.sin(c.rotY)).toFixed(2)},${(c.z - lx * Math.sin(c.rotY) + Math.cos(c.rotY)).toFixed(2)}`);
// parked: is the instanced parked car sitting on the road? (y vs surface)
const parked = await page.evaluate(([x, z]) => {
  const mk = window.__mk; const p = mk.useParking.getState().cars.find((q) => Math.hypot(q.x - x, q.z - z) < 0.1);
  return { y: p.y, surface: mk.surfaceAt(p.x, p.z), height: mk.heightAt(p.x, p.z) };
}, [c.x, c.z]);
console.log('[probe] parked y', parked);
await page.keyboard.press('KeyF');
for (let t = 0; t < 120; t++) { if ((await page.evaluate(() => window.__mk.occ.phase)) === 'seated') break; await page.waitForTimeout(250); }
await page.screenshot({ path: `${SP}/${PIECE}_${ROAD}_seated.png` });
// put the car on the road under test, at its start, pointing along it
const road = await page.evaluate((id) => window.__mk.ROADS.find((r) => r.id === id), ROAD);
const [[ax, az], [bx, bz]] = road.pts;
await page.evaluate(([ax, az, bx, bz, kind]) => {
  const road = { kind };
  const mk = window.__mk; const b = mk.carBody; const h = Math.atan2(bx - ax, bz - az);
  // past any turning circle at the start; keep left (Kenya): the left lane of the left carriageway
  const L = Math.hypot(bx - ax, bz - az); const f = Math.min(0.5, 40 / L);
  const x = ax + (bx - ax) * f, z = az + (bz - az) * f;
  const off = road.kind === 'highway' ? 7.6 : 1.8;
  const lx = x + ((bz - az) / L) * off, lz = z - ((bx - ax) / L) * off;
  b.setTranslation({ x: lx, y: mk.surfaceAt(lx, lz) + 0.15, z: lz }, true);
  b.setRotation({ x: 0, y: Math.sin(h / 2), z: 0, w: Math.cos(h / 2) }, true);
  b.setLinvel({ x: 0, y: 0, z: 0 }, true); b.setAngvel({ x: 0, y: 0, z: 0 }, true);
}, [ax, az, bx, bz, road.kind]);
await page.evaluate(() => {
  const mk = window.__mk;
  window.__g = { n: 0, contact: 0, on: [], off: [], body: 1e9, bad: [], path: [] };
  setInterval(() => { if (window.__g.path.length < 80) window.__g.path.push([+mk.drive.x.toFixed(0), +mk.drive.y.toFixed(1), +mk.drive.z.toFixed(0)]); }, 1000);
  setInterval(() => {
    const vc = mk.vc; if (!vc || mk.occ.phase !== 'seated') return;
    for (let i = 0; i < vc.numWheels(); i++) {
      window.__g.n++;
      if (!vc.wheelIsInContact(i)) continue;
      window.__g.contact++;
      const p = vc.wheelContactPoint(i);
      if (!p) continue;
      const s = mk.surfaceAt(p.x, p.z);
      const onRoad = s - mk.heightAt(p.x, p.z) > 0.01; // on a ribbon (its lift)
      const list = onRoad ? window.__g.on : window.__g.off;
      if (list.length < 6000) list.push(+(p.y - s).toFixed(3)); // + : tyre on something above the drawn road
      if (Math.abs(p.y - s) > 0.3 && window.__g.bad.length < 12) window.__g.bad.push({ x: +p.x.toFixed(1), y: +p.y.toFixed(2), z: +p.z.toFixed(1), surf: +s.toFixed(2), h: +mk.heightAt(p.x, p.z).toFixed(2), t: +(performance.now() / 1000).toFixed(1), car: [+mk.drive.x.toFixed(1), +mk.drive.y.toFixed(2), +mk.drive.z.toFixed(1)] });
    }
  }, 100);
});
await page.waitForTimeout(3000); // settle, stationary
const still = await page.evaluate(() => ({ y: window.__mk.drive.y, v: window.__mk.carBody.linvel() }));
// drive along the polyline: steer towards a point 14 m ahead on it (A/D taps)
const pts = road.pts;
const target = (x, z) => {
  let best = { d: 1e9, i: 0, t: 0 };
  for (let i = 0; i < pts.length - 1; i++) {
    const [px, pz] = pts[i], [qx, qz] = pts[i + 1]; const dx = qx - px, dz = qz - pz; const L2 = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((x - px) * dx + (z - pz) * dz) / L2)); const d = Math.hypot(x - px - dx * t, z - pz - dz * t);
    if (d < best.d) best = { d, i, t };
  }
  let { i, t } = best; let left = 14;
  for (;;) {
    const [px, pz] = pts[i], [qx, qz] = pts[i + 1]; const L = Math.hypot(qx - px, qz - pz); const rem = (1 - t) * L;
    if (left <= rem || i === pts.length - 2) { const tt = Math.min(1, t + left / L); return { x: px + (qx - px) * tt, z: pz + (qz - pz) * tt, end: i === pts.length - 2 && tt >= 1, off: best.d }; }
    left -= rem; i++; t = 0;
  }
};
await page.keyboard.down('KeyW');
let key = '', maxOff = 0, shots = 0;
const t0 = Date.now();
while (Date.now() - t0 < 60000) {
  const d = await page.evaluate(() => ({ x: window.__mk.drive.x, z: window.__mk.drive.z, h: window.__mk.drive.heading, v: window.__mk.drive.speed }));
  const tg = target(d.x, d.z);
  maxOff = Math.max(maxOff, tg.off);
  if (tg.end) break;
  const want = Math.atan2(tg.x - d.x, tg.z - d.z);
  let err = want - d.h; while (err > Math.PI) err -= 2 * Math.PI; while (err < -Math.PI) err += 2 * Math.PI;
  const k = err > 0.04 ? 'KeyA' : err < -0.04 ? 'KeyD' : '';
  if (k !== key) { if (key) await page.keyboard.up(key); if (k) await page.keyboard.down(k); key = k; }
  // hold ~60 km/h: lift off above 17 m/s
  if (d.v > 17) { await page.keyboard.up('KeyW'); await page.waitForTimeout(150); await page.keyboard.down('KeyW'); }
  if ((Date.now() - t0) / 12000 > shots) { await page.screenshot({ path: `${SP}/${PIECE}_${ROAD}_drive${shots}.png` }); shots++; }
  await page.waitForTimeout(80);
}
if (key) await page.keyboard.up(key);
await page.keyboard.up('KeyW');
const stat = (a) => { const s = [...a].sort((x, y) => x - y); const q = (f) => s[Math.min(s.length - 1, Math.floor(s.length * f))]; return { n: s.length, min: s[0], p05: q(0.05), p50: q(0.5), p95: q(0.95), max: s[s.length - 1] }; };
const raw = await page.evaluate(() => window.__g);
const g = { samples: raw.n, inContact: raw.contact, onRoad: stat(raw.on), offRoad: stat(raw.off), maxOffCentre: +maxOff.toFixed(1), bad: raw.bad, path: raw.path };
console.log('[probe] stationary', JSON.stringify(still));
console.log('[probe] contact', JSON.stringify(g));
console.log('[probe] errors', errors.length ? errors.slice(0, 5) : 'none');
await browser.close();
