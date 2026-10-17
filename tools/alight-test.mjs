#!/usr/bin/env node
// Getting off at the next stage (session 12, owner report "I can't alight"): board a matatu, press F
// ONCE while it is driving (> 15 km/h), then do nothing: it must stop at the next stage and Abel must
// step off there on his own, onto the kerb.  node tools/alight-test.mjs <shotDir>
import { chromium } from 'playwright';
const SP = process.argv[2] ?? '.';
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const check = (n, ok, i = '') => console.log(`${ok ? 'PASS' : 'FAIL'} ${n}${i ? ` (${i})` : ''}`);
const st = () => page.evaluate(() => { const mk = window.__mk; const v = mk.vehicles[mk.ride.vehicle]; return { phase: mk.occ.phase, ride: mk.ride.vehicle, v: v ? v.v : 0, stopped: v ? v.stopped : false, p: { ...mk.playerPosition }, toasts: mk.useEconomy.getState().toasts.map((t) => t.text) }; });
await page.goto('http://localhost:4173/?debug&tier=low&spawn=9,100');
await page.getByRole('button', { name: 'Tap to enter' }).click({ timeout: 420000 });
await page.waitForTimeout(5000);
let vid = null;
for (let t = 0; t < 90 && !vid; t++) {
  vid = await page.evaluate(() => {
    const mk = window.__mk;
    const v = mk.vehicles.find((q) => q.kind !== 'car' && q.stopped && q.dwell > 3 && mk.doorOf);
    if (!v) return null;
    const door = mk.doorOf(v); const lx = door[0] + 3.0;
    Object.assign(mk.teleport, { x: v.x + lx * Math.cos(v.heading) + door[1] * Math.sin(v.heading), z: v.z - lx * Math.sin(v.heading) + door[1] * Math.cos(v.heading), y: v.y + 1.2, facing: v.heading - Math.PI / 2, pending: true });
    v.dwell = Math.max(v.dwell, 12);
    return `${v.kind}${v.id}`;
  });
  if (!vid) await page.waitForTimeout(2000);
}
await page.waitForTimeout(1500);
await page.keyboard.press('KeyF');
let s;
for (let t = 0; t < 120; t++) { s = await st(); if (s.phase === 'seated') break; await page.waitForTimeout(500); }
check('boarded', s.phase === 'seated', vid);
// wait until it's driving, then press F once
for (let t = 0; t < 120; t++) { s = await st(); if (s.v > 4.5) break; await page.waitForTimeout(500); }
check('the matatu is moving', s.v > 4.5, `${(s.v * 3.6).toFixed(0)} km/h`);
await page.keyboard.press('KeyF');
await page.waitForTimeout(600);
const asked = await st();
check('asked to get off while moving: still aboard, told it stops at the next stage', asked.phase === 'seated' && asked.toasts.some((t) => /Next stage/.test(t)), JSON.stringify(asked.toasts));
let off = false;
for (let t = 0; t < 240 && !off; t++) { s = await st(); off = s.phase === 'walking' && s.ride < 0; if (s.phase === 'exiting') await page.screenshot({ path: `${SP}/alight_stepping_off.png` }); await page.waitForTimeout(500); }
check('stopped at the next stage and stepped off by himself', off, JSON.stringify(s.p));
await page.waitForTimeout(1500);
await page.screenshot({ path: `${SP}/alight_off.png` });
console.log('ERRORS', errors.length ? errors.slice(0, 5) : 'none');
await browser.close();
