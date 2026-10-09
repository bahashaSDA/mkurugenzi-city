#!/usr/bin/env node
// End-to-end driving test: walk up to a parked car, F to get in, drive, steer, brake, F to get out.
//   npm run build && npx vite preview --port 4173   (other terminal)
//   node tools/drive-test.mjs [screenshotDir]
// Under software GL the simulation runs slower than real time, hence the long holds.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const SP = process.argv[2] ?? '.';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
// find a parked car first, then reload spawned beside its driver door
let page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:4173/?debug&minimal&tier=low');
await page.getByRole('button', { name: 'Tap to enter' }).waitFor({ timeout: 90000 });
const car = await page.evaluate(() => {
  const c = window.__mk.useParking.getState().cars.find((p) => p.piece.startsWith('car_saloon')) ?? window.__mk.useParking.getState().cars[0];
  const h = c.rotY;
  const lx = -(1.7 / 2 + 0.7);
  return { ...c, dx: c.x + lx * Math.cos(h), dz: c.z - lx * Math.sin(h) };
});
await page.close();
console.log('car', car.piece, car.x.toFixed(1), car.z.toFixed(1));
page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`http://localhost:4173/?debug&minimal&tier=low&spawn=${car.dx.toFixed(2)},${car.dz.toFixed(2)}`);
await page.getByRole('button', { name: 'Tap to enter' }).click({ timeout: 90000 });
await page.waitForTimeout(5000);
const st = () => page.evaluate(() => ({ active: window.__mk.drive.active, x: window.__mk.drive.x, z: window.__mk.drive.z, y: window.__mk.drive.y, speed: window.__mk.drive.speed, prompt: window.__mk.usePrompt.getState().current?.label ?? '', p: { ...window.__mk.playerPosition } }));
let s = await st();
console.log('prompt:', s.prompt);
await page.keyboard.press('KeyF');
await page.waitForTimeout(2500);
s = await st();
const ok = { enter: s.active, moved: false, steered: false, exit: false };
const start = { x: s.x, z: s.z };
await page.keyboard.down('KeyW');
await page.waitForTimeout(20000);
s = await st();
console.log(`after throttle: speed=${(s.speed * 3.6).toFixed(0)} km/h, moved ${Math.hypot(s.x - start.x, s.z - start.z).toFixed(1)} m, y=${s.y.toFixed(2)}`);
ok.moved = Math.hypot(s.x - start.x, s.z - start.z) > 5;
await page.screenshot({ path: `${SP}/drive_1.png` });
const mid = { x: s.x, z: s.z };
await page.keyboard.down('KeyA');
await page.waitForTimeout(10000);
await page.keyboard.up('KeyA');
await page.keyboard.up('KeyW');
s = await st();
const d1 = { x: mid.x - start.x, z: mid.z - start.z };
const d2 = { x: s.x - mid.x, z: s.z - mid.z };
const turn = Math.atan2(d1.x * d2.z - d1.z * d2.x, d1.x * d2.x + d1.z * d2.z);
ok.steered = Math.abs(turn) > 0.2;
console.log(`steered ${(turn * 57.3).toFixed(0)} deg`);
await page.screenshot({ path: `${SP}/drive_2.png` });
await page.keyboard.down('KeyS');
await page.waitForTimeout(8000);
await page.keyboard.up('KeyS');
await page.keyboard.down('Space');
await page.waitForTimeout(4000);
await page.keyboard.up('Space');
s = await st();
console.log(`braked: ${(s.speed * 3.6).toFixed(0)} km/h`);
await page.keyboard.press('KeyF');
await page.waitForTimeout(3000);
s = await st();
ok.exit = !s.active;
await page.screenshot({ path: `${SP}/drive_3.png` });
console.log('RESULT', JSON.stringify(ok), 'errors:', errors.length ? errors : 'none');
await browser.close();
