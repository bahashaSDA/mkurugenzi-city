#!/usr/bin/env node
// Swimming and diving (session 12).  npm run build && npx vite preview --port 4173 ; node tools/dive-test.mjs <shotDir>
import { chromium } from 'playwright';
const SP = process.argv[2] ?? '.';
const X = Number(process.argv[3] ?? 1680), Z = Number(process.argv[4] ?? 0);
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const check = (n, ok, i = '') => console.log(`${ok ? 'PASS' : 'FAIL'} ${n}${i ? ` (${i})` : ''}`);
const st = () => page.evaluate(() => ({ swim: window.__mk.playerAnim.swimming, ...window.__mk.diving, y: window.__mk.playerPosition.y }));
await page.goto(`http://localhost:4173/?debug&tier=low&spawn=${X},${Z}&time=12&freeze&weather=clear`);
await page.getByRole('button', { name: 'Tap to enter' }).click({ timeout: 420000 });
await page.waitForTimeout(6000);
let s = await st();
check('swimming in deep water', s.swim, JSON.stringify(s));
await page.keyboard.down('KeyC');
await page.waitForTimeout(3500);
s = await st();
await page.screenshot({ path: `${SP}/dive_1_under.png` });
check('dives under with C', s.depth > 2 && s.under && s.cameraUnder, JSON.stringify(s));
check('holding his breath', s.breath < 0.95, s.breath.toFixed(2));
await page.keyboard.up('KeyC');
await page.keyboard.down('Space');
await page.waitForTimeout(2500);
await page.keyboard.up('Space');
s = await st();
check('comes back up with Space', s.depth < 0.3 && !s.cameraUnder, JSON.stringify(s));
await page.screenshot({ path: `${SP}/dive_2_surface.png` });
// out of breath while holding C: pushed up anyway (never stuck under)
await page.keyboard.down('KeyC');
await page.waitForTimeout(1500);
await page.evaluate(() => (window.__mk.diving.breath = 0.001));
let minDepth = 99;
for (let k = 0; k < 30; k++) { await page.waitForTimeout(100); minDepth = Math.min(minDepth, (await st()).depth); }
s = await st();
await page.keyboard.up('KeyC');
check('out of breath (C still held): pushed up to the air', minDepth < 0.1, `min depth ${minDepth.toFixed(2)}; ${JSON.stringify(s)}`);
console.log('ERRORS', errors.length ? errors.slice(0, 5) : 'none');
await browser.close();
