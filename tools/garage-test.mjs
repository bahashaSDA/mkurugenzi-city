#!/usr/bin/env node
// Fuel, petrol station, garage repair and a remapped key (session 12).
//   npm run build && npx vite preview --port 4173 ; node tools/garage-test.mjs <shotDir>
import { chromium } from 'playwright';
const SP = process.argv[2] ?? '.';
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const errors = [];
const check = (n, ok, info = '') => console.log(`${ok ? 'PASS' : 'FAIL'} ${n}${info ? ` (${info})` : ''}`);
const open = async (q) => { const p = await browser.newPage({ viewport: { width: 960, height: 540 } }); p.on('pageerror', (e) => errors.push(e.message)); await p.goto(`http://localhost:4173/?debug&tier=low&${q}`); await p.getByRole('button', { name: 'Tap to enter' }).click({ timeout: 420000 }); await p.waitForTimeout(4500); return p; };
const until = async (p, f, ms) => { const t0 = Date.now(); for (;;) { const v = await p.evaluate(f); if (v || Date.now() - t0 > ms) return v; await p.waitForTimeout(250); } };
let page = await open('minimal');
const c = await page.evaluate(() => window.__mk.useParking.getState().cars.find((p) => p.piece.startsWith('rv_car')));
const st = await page.evaluate(() => window.__mk.stations()[0]);
check('petrol stations found', !!st, st ? `${st.name} pumps ${st.pumps.length}` : '');
await page.close();
page = await open(`spawn=${(c.x - 3.2 * Math.cos(c.rotY) + Math.sin(c.rotY)).toFixed(2)},${(c.z + 3.2 * Math.sin(c.rotY) + Math.cos(c.rotY)).toFixed(2)}`);
await page.evaluate(() => window.__mk.bindKey('KeyF', 'KeyT')); // Vehicle on T now
await page.keyboard.press('KeyF');
await page.waitForTimeout(1500);
check('old key F no longer gets in', await page.evaluate(() => window.__mk.occ.phase === 'walking'));
await page.keyboard.press('KeyT');
const seated = await until(page, () => window.__mk.occ.phase === 'seated', 30000);
check('remapped key T gets in', seated);
const place = (x, z, h) => page.evaluate(([x, z, h]) => { const b = window.__mk.carBody; b.setTranslation({ x, y: window.__mk.surfaceAt(x, z) + 0.3, z }, true); b.setRotation({ x: 0, y: Math.sin(h / 2), z: 0, w: Math.cos(h / 2) }, true); b.setLinvel({ x: 0, y: 0, z: 0 }, true); b.setAngvel({ x: 0, y: 0, z: 0 }, true); }, [x, z, h]);
await page.evaluate(() => { window.__mk.drive.fuel = 6; window.__mk.drive.health = 400; window.__mk.useEconomy.setState({ money: 20000 }); });
await place(st.pumps[0].x, st.pumps[0].z, Math.PI / 2); // parallel to the pump island, like a driver pulls in
await page.waitForTimeout(3000);
const lbl = await until(page, () => /Fill up/.test(window.__mk.useService.getState().label) && window.__mk.useService.getState().label, 8000);
await page.screenshot({ path: `${SP}/garage_1_pump.png` });
check('pump prompt with litres and price', !!lbl, String(lbl));
await until(page, () => Math.abs(window.__mk.drive.speed) < 0.2 && /Fill up/.test(window.__mk.useService.getState().label), 8000); // standing still at the pump
const m0 = await page.evaluate(() => window.__mk.useEconomy.getState().money);
await page.keyboard.press('KeyE');
await page.waitForTimeout(400);
await page.keyboard.press('KeyE'); // impatient second press while filling
await page.waitForTimeout(3200);
const r = await page.evaluate(() => ({ fuel: window.__mk.drive.fuel, money: window.__mk.useEconomy.getState().money }));
const shown = Number(String(lbl).match(/KSh ([\d,]+)/)[1].replace(/,/g, ''));
check('filled up, charged once, exactly the price shown', r.fuel > 44 && m0 - r.money === shown, `${m0} -> ${r.money} (shown ${shown}), fuel ${r.fuel.toFixed(1)}`);
await page.screenshot({ path: `${SP}/garage_2_full.png` });
await place(st.bay.x, st.bay.z, 0);
await page.waitForTimeout(3000);
const rl = await until(page, () => /Repair/.test(window.__mk.useService.getState().label) && window.__mk.useService.getState().label, 8000);
check('garage prompt with the price', !!rl, String(rl));
await until(page, () => Math.abs(window.__mk.drive.speed) < 0.2 && /Repair/.test(window.__mk.useService.getState().label), 8000);
const m1 = await page.evaluate(() => window.__mk.useEconomy.getState().money);
await page.keyboard.press('KeyE');
await page.waitForTimeout(3200);
const r2 = await page.evaluate(() => ({ health: window.__mk.drive.health, money: window.__mk.useEconomy.getState().money }));
const shownR = Number(String(rl).match(/KSh ([\d,]+)/)[1].replace(/,/g, ''));
check('repaired, charged once, exactly the price shown', r2.health === 1000 && m1 - r2.money === shownR, `${m1} -> ${r2.money} (shown ${shownR}), health ${r2.health}`);
await page.screenshot({ path: `${SP}/garage_3_repaired.png` });
await page.keyboard.press('KeyT'); // out with the remapped key
await until(page, () => window.__mk.occ.phase === 'walking', 20000);
const parked = await page.evaluate(() => window.__mk.useParking.getState().cars.slice(-1)[0]);
check('the car keeps its fuel when parked', parked.fuel > 44, `${parked.fuel?.toFixed(1)}`);
await page.evaluate(() => window.__mk.resetKeys());
console.log('ERRORS', errors.length ? errors.slice(0, 5) : 'none');
await browser.close();
