#!/usr/bin/env node
// Handling, drift, tyre marks and dust per car (session 12, Parts 3.4-3.6).
//   npm run build && npx vite preview --port 4173
//   node tools/handling-test.mjs <shotDir> [rv_car rv_cruiser ...]
// For each car: board it, put it on the flat expressway (left lane, heading east), then measure
//   accel   0 -> 50 km/h time (s)
//   brake   60 km/h -> stop distance (m)
//   roll    max body roll in a full-lock turn at ~40 km/h (deg)
//   drift   handbrake + full lock at ~50 km/h for 1.6 s: yaw turned (deg), max slip angle (deg),
//           tyre-mark quads laid on tarmac
//   offroad 8 s on the red earth beside the road: track quads laid, dust puffs alive
import { chromium } from 'playwright';
const SP = process.argv[2] ?? '.';
const PIECES = process.argv.slice(3).length ? process.argv.slice(3) : ['rv_car', 'rv_cruiser'];
const GL = process.env.GPU ? ['--use-angle=d3d11', '--enable-gpu'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const browser = await chromium.launch({ args: [...GL, '--ignore-gpu-blocklist'] });
const errors = [];
const out = {};

async function open(q) {
  const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  await page.goto(`http://localhost:4173/?debug&tier=low&${q}`);
  await page.getByRole('button', { name: 'Tap to enter' }).click({ timeout: 420000 });
  await page.waitForTimeout(4000);
  return page;
}
const S = (page) => page.evaluate(() => {
  const mk = window.__mk; const b = mk.carBody; const r = b.rotation(); const v = b.linvel();
  // roll = rotation about the car's forward axis: angle of its local X axis above the horizon
  const q = new mk.THREE.Quaternion(r.x, r.y, r.z, r.w);
  const xa = new mk.THREE.Vector3(1, 0, 0).applyQuaternion(q);
  const fa = new mk.THREE.Vector3(0, 0, 1).applyQuaternion(q);
  const sp = Math.hypot(v.x, v.z);
  const slip = sp > 2 ? Math.abs(Math.asin(Math.max(-1, Math.min(1, (v.x * fa.z - v.z * fa.x) / sp)))) * 180 / Math.PI : 0;
  return { x: mk.drive.x, z: mk.drive.z, h: mk.drive.heading, v: mk.drive.speed, roll: Math.asin(Math.max(-1, Math.min(1, xa.y))) * 180 / Math.PI, slip, fx: mk.tyreFxStats() };
});
const place = (page, x, z, h) => page.evaluate(([x, z, h]) => {
  const mk = window.__mk; const b = mk.carBody;
  b.setTranslation({ x, y: mk.surfaceAt(x, z) + 0.2, z }, true);
  b.setRotation({ x: 0, y: Math.sin(h / 2), z: 0, w: Math.cos(h / 2) }, true);
  b.setLinvel({ x: 0, y: 0, z: 0 }, true); b.setAngvel({ x: 0, y: 0, z: 0 }, true);
}, [x, z, h]);
const until = async (page, f, ms, step = 50) => { const t0 = Date.now(); for (;;) { const s = await S(page); if (f(s) || Date.now() - t0 > ms) return { s, t: (Date.now() - t0) / 1000 }; await page.waitForTimeout(step); } };

for (const piece of PIECES) {
  let page = await open('minimal');
  const c = await page.evaluate((p) => window.__mk.useParking.getState().cars.filter((c) => c.piece.startsWith(p)).sort((a, b) => Math.hypot(a.x - 14, a.z + 700) - Math.hypot(b.x - 14, b.z + 700))[0], piece);
  await page.close();
  page = await open(`minimal&spawn=${(c.x - 3.2 * Math.cos(c.rotY) + Math.sin(c.rotY)).toFixed(2)},${(c.z + 3.2 * Math.sin(c.rotY) + Math.cos(c.rotY)).toFixed(2)}`);
  await page.keyboard.press('KeyF');
  for (let t = 0; t < 120; t++) { if ((await page.evaluate(() => window.__mk.occ.phase)) === 'seated') break; await page.waitForTimeout(250); }
  const r = { piece: c.piece };
  const H = Math.PI / 2; // east
  // accel (game time runs slower than wall time under software GL: measure in game time via speed samples)
  await place(page, -900, -319.6, H); await page.waitForTimeout(2500);
  const g0 = await page.evaluate(() => performance.now());
  await page.keyboard.down('KeyW');
  const a = await until(page, (s) => s.v > 50 / 3.6, 40000, 30);
  const g1 = await page.evaluate(() => performance.now());
  r.accel_0_50_s = +((g1 - g0) / 1000).toFixed(2);
  // brake from 60
  await until(page, (s) => s.v > 60 / 3.6, 30000, 30);
  await page.keyboard.up('KeyW');
  const b0 = await S(page);
  await page.keyboard.down('KeyS');
  const b1 = (await until(page, (s) => s.v < 0.5, 20000, 30)).s;
  await page.keyboard.up('KeyS');
  r.brake_60_0_m = +Math.hypot(b1.x - b0.x, b1.z - b0.z).toFixed(1);
  await page.screenshot({ path: `${SP}/${piece}_brake.png` });
  // roll in a full-lock turn at ~40
  await place(page, -600, -319.6, H); await page.waitForTimeout(2000);
  await page.keyboard.down('KeyW');
  await until(page, (s) => s.v > 40 / 3.6, 30000, 30);
  await page.keyboard.up('KeyW');
  await page.keyboard.down('KeyA');
  let maxRoll = 0;
  for (let k = 0; k < 30; k++) { const s = await S(page); maxRoll = Math.max(maxRoll, Math.abs(s.roll)); await page.waitForTimeout(80); }
  await page.screenshot({ path: `${SP}/${piece}_roll.png` });
  await page.keyboard.up('KeyA');
  r.roll_deg = +maxRoll.toFixed(1);
  // handbrake drift on tarmac
  await place(page, -300, -319.6, H); await page.waitForTimeout(2000);
  await page.keyboard.down('KeyW');
  await until(page, (s) => s.v > 50 / 3.6, 30000, 30);
  const m0 = (await S(page)).fx.marks;
  const h0 = (await S(page)).h;
  await page.keyboard.down('KeyA');
  await page.keyboard.down('Space');
  let maxSlip = 0;
  for (let k = 0; k < 20; k++) { const s = await S(page); maxSlip = Math.max(maxSlip, s.slip); if (k === 10) await page.screenshot({ path: `${SP}/${piece}_drift.png` }); await page.waitForTimeout(80); }
  await page.keyboard.up('Space');
  await page.keyboard.up('KeyA');
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(1500);
  const d1 = await S(page);
  let dh = (d1.h - h0) * 180 / Math.PI; while (dh > 180) dh -= 360; while (dh < -180) dh += 360;
  r.drift_yaw_deg = +dh.toFixed(0);
  r.drift_slip_deg = +maxSlip.toFixed(0);
  r.drift_marks = d1.fx.marks - m0;
  await page.screenshot({ path: `${SP}/${piece}_marks.png` });
  // off-road: the red earth north of the expressway
  await place(page, 0, -360, H); await page.waitForTimeout(2000);
  const o0 = (await S(page)).fx.marks;
  await page.keyboard.down('KeyW');
  let maxPuffs = 0;
  for (let k = 0; k < 40; k++) { const s = await S(page); maxPuffs = Math.max(maxPuffs, s.fx.live); if (k === 30) await page.screenshot({ path: `${SP}/${piece}_dust.png` }); await page.waitForTimeout(200); }
  await page.keyboard.up('KeyW');
  const o1 = await S(page);
  r.offroad_track_quads = o1.fx.marks - o0;
  r.offroad_max_puffs = maxPuffs;
  r.offroad_speed_kmh = +(o1.v * 3.6).toFixed(0);
  out[piece] = r;
  console.log('[handling]', JSON.stringify(r));
  await page.close();
}
console.log('ERRORS', errors.length ? errors.slice(0, 6) : 'none');
await browser.close();
