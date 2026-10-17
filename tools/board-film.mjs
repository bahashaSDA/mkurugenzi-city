#!/usr/bin/env node
// Film getting into (and out of) a vehicle: a frame every 200 ms from the game camera, stitched
// into a contact sheet, plus the door openness and the clip Abel plays on each frame.
//   GPU=1 node tools/board-film.mjs <outDir> car|matatu|bus
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const OUT = process.argv[2] ?? 'board-film';
const KIND = process.argv[3] ?? 'car';
mkdirSync(`${OUT}/${KIND}`, { recursive: true });
const GL = process.env.GPU ? ['--use-angle=d3d11', '--enable-gpu'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const browser = await chromium.launch({ args: [...GL, '--ignore-gpu-blocklist'] });
const errors = [];
let page = await browser.newPage({ viewport: { width: 640, height: 360 } });
await page.goto('http://localhost:4173/?debug&tier=low&minimal');
await page.getByRole('button', { name: 'Tap to enter' }).click({ timeout: 420000 });
let spawn;
if (KIND === 'car') {
  spawn = await page.evaluate(() => {
    const cars = window.__mk.useParking.getState().cars;
    // a car on the long straight CBD avenue (x = 14), Abel spawned ~3 m off its driver's side
    const c = cars.filter((p) => p.piece.startsWith('rv_') && Math.abs(p.x - 14) < 12 && p.z < -500 && p.z > -1000).sort((a, b) => b.z - a.z)[0] ?? cars[0];
    const lx = -3.2;
    return { x: c.x + lx * Math.cos(c.rotY) + 1.0 * Math.sin(c.rotY), z: c.z - lx * Math.sin(c.rotY) + 1.0 * Math.cos(c.rotY), piece: c.piece };
  });
} else spawn = { x: 20, z: 125 }; // the matatu stage
await page.close();
page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`http://localhost:4173/?debug&tier=low&time=11${KIND === 'car' ? '&minimal' : ''}&spawn=${spawn.x.toFixed(2)},${spawn.z.toFixed(2)}`);
await page.getByRole('button', { name: 'Tap to enter' }).click({ timeout: 420000 });
await page.waitForTimeout(4000);
if (KIND !== 'car') {
  // a vehicle of that kind dwelling at a stop: Abel on the kerb 3 m from its passenger door
  let found = '';
  for (let t = 0; t < 120 && !found; t++) {
    found = await page.evaluate(([kind, piece]) => {
      const mk = window.__mk;
      const v = mk.vehicles.find((q) => q.kind === kind && q.piece.startsWith(piece) && q.stopped && q.dwell > 3 && !q.jackedUntil);
      if (!v) return '';
      const door = mk.doorOf(v);
      const lx = door[0] + 3.0;
      const x = v.x + lx * Math.cos(v.heading) + door[1] * Math.sin(v.heading);
      const z = v.z - lx * Math.sin(v.heading) + door[1] * Math.cos(v.heading);
      Object.assign(mk.teleport, { x, z, y: v.y + 1.2, facing: v.heading - Math.PI / 2, pending: true });
      v.dwell = Math.max(v.dwell, 14);
      return `${v.kind}${v.id}:${v.piece}`;
    }, [KIND, process.env.PIECE ?? '']);
    if (!found) await page.waitForTimeout(2000);
  }
  console.log('[film] boarding', found || 'nothing found');
  await page.waitForTimeout(1500);
}
const log = [];
const snap = async (tag) => {
  const i = log.length;
  await page.screenshot({ path: `${OUT}/${KIND}/f${String(i).padStart(3, '0')}.png` });
  log.push({ i, tag, ...(await page.evaluate(() => ({ phase: window.__mk.occ.phase, door: +(window.__mk.occ.door ?? 0).toFixed(2), clip: window.__mk.playerAnim?.rideClip ?? '', kind: window.__mk.occ.ride?.kind ?? '', fp: [+window.__mk.occ.frame.elements[12].toFixed(2), +window.__mk.occ.frame.elements[13].toFixed(2), +window.__mk.occ.frame.elements[14].toFixed(2)], ik: window.__mk.playerIK ? { w: +window.__mk.playerIK.w.toFixed(2), fw: window.__mk.playerIK.footW.map((x) => +x.toFixed(2)), feet: window.__mk.playerIK.feet?.map((v) => [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)]) ?? null } : null, prompt: window.__mk.usePrompt.getState().current?.label ?? '' }))) });
};
await snap('before');
await page.keyboard.press('KeyF');
if (KIND !== 'car') {
  // the conductor waves Abel over and the matatu pulls up: wait for the boarding to begin
  for (let i = 0; i < 120; i++) {
    const ph = await page.evaluate(() => window.__mk.occ.phase);
    if (ph === 'approaching' || ph === 'boarding') break;
    await page.waitForTimeout(250);
  }
}
let pinned = false;
const pin = async () => {
  // CLOSE=1: a fixed close-up of the doorway (vehicle-local), once the vehicle is known
  if (!process.env.CLOSE || pinned) return;
  pinned = await page.evaluate(() => {
    const mk = window.__mk;
    if (mk.occ.phase !== 'boarding' && mk.occ.phase !== 'approaching') return false;
    const r = mk.occ.ride;
    if (!r) return false;
    const sx = Math.sign(r.stand.x) || -1;
    const far = r.kind === 'transit';
    const cam = new mk.THREE.Vector3(sx * (far ? 4.6 : 2.9), far ? 2.4 : 1.55, r.stand.z - (far ? 3.6 : 2.3)).applyMatrix4(mk.occ.frame);
    const at = new mk.THREE.Vector3(sx * 0.55, 0.7, r.stand.z + 0.7).applyMatrix4(mk.occ.frame);
    Object.assign(mk.camOverride, { on: true, x: cam.x, y: cam.y, z: cam.z, lx: at.x, ly: at.y, lz: at.z });
    return true;
  });
};
for (let i = 0; i < 110; i++) {
  await pin();
  await snap('board');
  if (log.at(-1).phase === 'seated' && log.filter((l) => l.phase === 'seated').length > 3) break;
  await page.waitForTimeout(KIND === 'car' ? 120 : 60);
}
if (KIND === 'car') {
  await page.keyboard.press('KeyF');
  for (let i = 0; i < 50; i++) {
    await snap('exit');
    if (log.at(-1).phase === 'walking') break;
    await page.waitForTimeout(120);
  }
}
writeFileSync(`${OUT}/${KIND}/log.json`, JSON.stringify(log, null, 1));
console.log(log.map((l) => `${l.i} ${l.phase} door=${l.door} ${l.clip}`).join('\n'));
console.log('ERRORS', errors.length ? errors.slice(0, 5) : 'none', spawn.piece ?? '');
await browser.close();
