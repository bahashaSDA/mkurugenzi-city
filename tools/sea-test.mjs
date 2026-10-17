#!/usr/bin/env node
// Driving into the sea (session 12): the car must slow, flood and stop, not drive along the seabed.
import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const check = (n, ok, i = '') => console.log(`${ok ? 'PASS' : 'FAIL'} ${n}${i ? ` (${i})` : ''}`);
const open = async (q) => { const p = await browser.newPage({ viewport: { width: 960, height: 540 } }); await p.goto(`http://localhost:4173/?debug&tier=low&${q}`); await p.getByRole('button', { name: 'Tap to enter' }).click({ timeout: 420000 }); await p.waitForTimeout(4500); return p; };
let page = await open('minimal');
const c = await page.evaluate(() => window.__mk.useParking.getState().cars.find((p) => p.piece.startsWith('rv_cruiser')));
await page.close();
page = await open(`minimal&spawn=${(c.x - 3.2 * Math.cos(c.rotY) + Math.sin(c.rotY)).toFixed(2)},${(c.z + 3.2 * Math.sin(c.rotY) + Math.cos(c.rotY)).toFixed(2)}`);
await page.keyboard.press('KeyF');
for (let t = 0; t < 120; t++) { if ((await page.evaluate(() => window.__mk.occ.phase)) === 'seated') break; await page.waitForTimeout(250); }
// on the beach just above the waterline, facing the sea (east)
await page.evaluate(() => { const mk = window.__mk, b = mk.carBody; const x = 1585, z = 0; b.setTranslation({ x, y: mk.surfaceAt(x, z) + 0.4, z }, true); b.setRotation({ x: 0, y: Math.sin(Math.PI / 4), z: 0, w: Math.cos(Math.PI / 4) }, true); b.setLinvel({ x: 0, y: 0, z: 0 }, true); b.setAngvel({ x: 0, y: 0, z: 0 }, true); });
await page.waitForTimeout(2000);
await page.keyboard.down('KeyW');
let maxX = 0; let last;
for (let k = 0; k < 60; k++) { await page.waitForTimeout(250); last = await page.evaluate(() => ({ x: window.__mk.drive.x, y: window.__mk.drive.y, v: window.__mk.drive.speed, hp: window.__mk.drive.health })); maxX = Math.max(maxX, last.x); }
await page.keyboard.up('KeyW');
const sea = await page.evaluate(([x]) => ({ seabed: window.__mk.heightAt(x, 0) }), [last.x]);
check('the car stops in the water (not driving along the seabed)', Math.abs(last.v) < 1, JSON.stringify(last));
check('the engine floods in deep water', last.hp < 1000, `health ${last.hp.toFixed(0)}, seabed ${sea.seabed.toFixed(2)}`);
check('did not get far out to sea', maxX < 1640, `furthest x ${maxX.toFixed(0)}`);
await page.screenshot({ path: process.argv[2] ? `${process.argv[2]}/sea_car.png` : 'sea_car.png' });
await browser.close();
