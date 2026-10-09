#!/usr/bin/env node
// Interiors: spawn at a door, E to enter, look around, eat, E at the door to leave.
//   node tools/interior-test.mjs [screenshotDir] [roomType]
import { chromium } from 'playwright';
const SP = process.argv[2] ?? '.';
const ROOM = process.argv[3] ?? 'int_hoteli';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
let page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:4173/?debug&tier=low');
await page.getByRole('button', { name: 'Tap to enter' }).click({ timeout: 90000 });
let door = null;
for (let t = 0; t < 60 && !door; t++) {
  await page.waitForTimeout(1000);
  door = await page.evaluate((room) => {
    const ds = window.__mk.doors;
    if (!ds) return null;
    const d = ds.filter((q) => q.room === room).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
    return d ? { x: d.x + Math.sin(d.rotY) * 0.6, z: d.z + Math.cos(d.rotY) * 0.6, name: d.name } : null;
  }, ROOM);
}
await page.close();
console.log('door', JSON.stringify(door));
page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`http://localhost:4173/?debug&tier=low&spawn=${door.x.toFixed(2)},${door.z.toFixed(2)}`);
await page.getByRole('button', { name: 'Tap to enter' }).click({ timeout: 90000 });
const st = () => page.evaluate(() => ({ inside: !!window.__mk.useInterior.getState().door, prompt: window.__mk.usePrompt.getState().current?.label ?? '', p: { ...window.__mk.playerPosition }, area: window.__mk.useEconomy.getState().area }));
let s;
for (let t = 0; t < 40; t++) {
  await page.waitForTimeout(1000);
  s = await st();
  if (s.prompt.startsWith('Enter')) break;
}
console.log('outside prompt:', s.prompt);
await page.screenshot({ path: `${SP}/int_0_door.png`, timeout: 120000 });
await page.keyboard.press('KeyE');
await page.waitForTimeout(4000);
s = await st();
console.log('inside:', s.inside, 'area:', s.area, 'y:', s.p.y.toFixed(1), 'prompt:', s.prompt);
await page.screenshot({ path: `${SP}/int_1_inside.png`, timeout: 120000 });
// turn round to see the room, then walk to the counter/table area
await page.keyboard.down('KeyW');
await page.waitForTimeout(2500);
await page.keyboard.up('KeyW');
await page.waitForTimeout(1500);
s = await st();
console.log('after walking in, prompt:', s.prompt);
await page.screenshot({ path: `${SP}/int_2_room.png`, timeout: 120000 });
// back to the door and leave
await page.keyboard.down('KeyS');
await page.waitForTimeout(3500);
await page.keyboard.up('KeyS');
await page.waitForTimeout(1000);
s = await st();
console.log('at door, prompt:', s.prompt);
if (s.prompt === 'Leave') await page.keyboard.press('KeyE');
const ys = await page.evaluate(async () => {
  const out = [];
  for (let k = 0; k < 50; k++) {
    await new Promise((r) => requestAnimationFrame(r));
    out.push(window.__mk.playerPosition.y.toFixed(2));
  }
  return out.join(' ');
});
console.log('y after leaving:', ys);
await page.waitForTimeout(2000);
s = await st();
console.log('RESULT left:', !s.inside, 'y:', s.p.y.toFixed(1), 'errors:', errors.length ? errors : 'none');
await page.screenshot({ path: `${SP}/int_3_out.png`, timeout: 120000 });
await browser.close();
