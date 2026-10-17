#!/usr/bin/env node
// Ride a boda and log every rendered frame: does it sit on the ground, do the wheels turn, does
// it move smoothly (no stutter relative to the camera)?
//   GPU=1 node tools/bike-probe.mjs <outDir> [tier=mid]
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
const OUT = process.argv[2] ?? 'bike-probe';
const RIDE_MS = Number(process.env.RIDE_MS ?? 6000);
const TIER = process.argv[3] ?? 'mid';
mkdirSync(OUT, { recursive: true });
const GL = process.env.GPU ? ['--use-angle=d3d11', '--enable-gpu'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const browser = await chromium.launch({ args: [...GL, '--ignore-gpu-blocklist'] });
const errors = [];
let page = await browser.newPage({ viewport: { width: 960, height: 540 } });
await page.goto(`http://localhost:4173/?debug&tier=${TIER}&minimal`);
await page.getByRole('button', { name: 'Tap to enter' }).click({ timeout: 420000 });
await page.waitForTimeout(3000);
const b = await page.evaluate(() => {
  const c = window.__mk.useBodas.getState().bikes[0];
  return { ...c, sx: c.x + 2.4 * Math.cos(c.rotY), sz: c.z - 2.4 * Math.sin(c.rotY) };
});
await page.close();
page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`http://localhost:4173/?debug&tier=${TIER}&time=11&spawn=${b.sx.toFixed(2)},${b.sz.toFixed(2)}`);
await page.getByRole('button', { name: 'Tap to enter' }).click({ timeout: 420000 });
await page.waitForTimeout(4000);
await page.keyboard.press('KeyF');
for (let i = 0; i < 80; i++) {
  if ((await page.evaluate(() => window.__mk.occ.phase)) === 'seated') break;
  await page.waitForTimeout(250);
}
// ride on an open road (the long CBD avenue at x = 14), not through the crowded stage
if (process.env.OPEN !== '0') {
  await page.evaluate(() => (window.__mk.bike.place = { x: 14, z: -540, heading: Math.PI }));
  await page.waitForTimeout(1500);
}
// per-frame recorder (after everything else has run this frame)
await page.evaluate(() => {
  const mk = window.__mk;
  const v = new mk.THREE.Vector3();
  window.__frames = [];
  const cam = () => mk.scene.getObjectByProperty('isCamera', true);
  let camera = null;
  let lastFrame = -1;
  const tick = () => {
    requestAnimationFrame(tick);
    const bk = mk.bike;
    if (bk.frame === lastFrame) return; // one sample per GAME frame (rAF order vs the game loop varies)
    lastFrame = bk.frame;
    const t = bk.t;
    camera ??= window.__mk.camera ?? null;
    // the bike in camera space (stutter shows up here as jitter)
    let sx = 0, sy = 0;
    if (mk.cameraRef?.current) {
      v.set(bk.x, bk.y + 0.8, bk.z).project(mk.cameraRef.current);
      sx = v.x; sy = v.y;
    }
    window.__frames.push({ t, x: bk.x, y: bk.y, z: bk.z, v: bk.speed, gF: bk.groundF, gR: bk.groundR, terrain: mk.heightAt(bk.x, bk.z), spin: bk.spin, pitch: bk.pitch, susp: bk.susp, lean: bk.lean, wheels: bk.wheels, sx, sy });
  };
  requestAnimationFrame(tick);
});
await page.keyboard.down('KeyW');
await page.waitForTimeout(RIDE_MS);
await page.screenshot({ path: `${OUT}/bike_straight.png` });
await page.keyboard.down('KeyD');
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/bike_turn.png` });
await page.keyboard.up('KeyD');
await page.waitForTimeout(3000);
await page.keyboard.up('KeyW');
const frames = await page.evaluate(() => window.__frames);
console.log('HITS', JSON.stringify(await page.evaluate(() => window.__mk.bike.hits)));
writeFileSync(`${OUT}/bike_frames.json`, JSON.stringify(frames));
// analysis
const dts = frames.slice(1).map((f, i) => f.t - frames[i].t);
dts.sort((a, b) => a - b);
const moving = frames.filter((f) => Math.abs(f.v) > 2);
const above = moving.map((f) => f.y - (f.gF + f.gR) / 2);
const spins = frames.slice(1).map((f, i) => f.spin - frames[i].spin);
// smoothness: per-frame distance travelled vs speed*dt
let jerk = 0, n = 0, stalls = 0;
for (let i = 2; i < frames.length; i++) {
  const a = frames[i - 2], b = frames[i - 1], c = frames[i];
  if (Math.abs(b.v) < 2) continue;
  const d1 = Math.hypot(b.x - a.x, b.z - a.z) / ((b.t - a.t) / 1000);
  const d2 = Math.hypot(c.x - b.x, c.z - b.z) / ((c.t - b.t) / 1000);
  jerk += Math.abs(d2 - d1) / Math.max(1, Math.abs(b.v));
  if (Math.hypot(c.x - b.x, c.z - b.z) < 1e-4) stalls++;
  n++;
}
const rep = {
  frames: frames.length,
  fps: +(1000 / dts[Math.floor(dts.length / 2)]).toFixed(1),
  dtP95: +dts[Math.floor(dts.length * 0.95)].toFixed(1),
  secsTo50: (() => { const f0 = frames.find((f) => Math.abs(f.v) > 0.3); const f1 = frames.find((f) => Math.abs(f.v) * 3.6 >= 50); return f0 && f1 ? +((f1.t - f0.t) / 1000).toFixed(1) : null; })(),
  suspRange: [+Math.min(...frames.map((f) => f.susp)).toFixed(3), +Math.max(...frames.map((f) => f.susp)).toFixed(3)],
  maxSpeedKmh: +(Math.max(...frames.map((f) => Math.abs(f.v))) * 3.6).toFixed(1),
  wheelParts: frames.at(-1)?.wheels,
  spinTotal: +(frames.at(-1).spin - frames[0].spin).toFixed(1),
  framesWheelStill: spins.filter((s, i) => Math.abs(s) < 1e-6 && Math.abs(frames[i + 1].v) > 2).length,
  heightAboveGround: { min: +Math.min(...above).toFixed(3), max: +Math.max(...above).toFixed(3), mean: +(above.reduce((a, b) => a + b, 0) / above.length).toFixed(3) },
  speedJitter: +(jerk / Math.max(1, n)).toFixed(3),
  stalledFrames: stalls,
  screenJitter: (() => {
    const s = frames.filter((f) => Math.abs(f.v) > 2);
    let j = 0;
    for (let i = 2; i < s.length; i++) j += Math.abs(s[i].sx - 2 * s[i - 1].sx + s[i - 2].sx) + Math.abs(s[i].sy - 2 * s[i - 1].sy + s[i - 2].sy);
    return +(j / Math.max(1, s.length - 2) * 1000).toFixed(2);
  })(),
};
console.log(JSON.stringify(rep, null, 1));
console.log('ERRORS', errors.length ? errors.slice(0, 5) : 'none');
await browser.close();
