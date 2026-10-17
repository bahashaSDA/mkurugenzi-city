#!/usr/bin/env node
// Mkurugenzi Stories radio station (session 12): board a car, the station plays a real episode in
// YouTube's player, get out (it stops and remembers), get back in (it resumes the same episode).
//   npm run build && npx vite preview --port 4173 ; node tools/stories-test.mjs <shotDir>
import { chromium } from 'playwright';
const SP = process.argv[2] ?? '.';
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const check = (n, ok, info = '') => console.log(`${ok ? 'PASS' : 'FAIL'} ${n}${info ? ` (${info})` : ''}`);
const until = async (f, ms) => { const t0 = Date.now(); for (;;) { const v = await page.evaluate(f); if (v || Date.now() - t0 > ms) return v; await page.waitForTimeout(300); } };
await page.goto('http://localhost:4173/?debug&tier=low&minimal');
await page.evaluate(() => { try { localStorage.setItem('mk.radio.v1', JSON.stringify({ on: true, index: 0, volume: 0.6 })); localStorage.removeItem('mk.stories.v1'); } catch {} });
await page.reload();
await page.getByRole('button', { name: 'Tap to enter' }).click({ timeout: 420000 });
await page.waitForTimeout(4000);
const c = await page.evaluate(() => window.__mk.useParking.getState().cars.find((p) => p.piece.startsWith('rv_car')));
await page.goto(`http://localhost:4173/?debug&tier=low&minimal&spawn=${(c.x - 3.2 * Math.cos(c.rotY) + Math.sin(c.rotY)).toFixed(2)},${(c.z + 3.2 * Math.sin(c.rotY) + Math.cos(c.rotY)).toFixed(2)}`);
await page.getByRole('button', { name: 'Tap to enter' }).click({ timeout: 420000 });
await page.waitForTimeout(4000);
await page.keyboard.press('KeyF');
await until(() => window.__mk.occ.phase === 'seated', 30000);
const st = await until(() => window.__mk.useRadio.getState().index === 0 && document.querySelector('.stories iframe') && window.__mk.useStories?.getState().status === 'playing', 40000);
const info = await page.evaluate(() => ({ status: window.__mk.useStories?.getState().status, ep: window.__mk.useStories?.getState().episode?.title, now: window.__mk.useRadio.getState().now, iframe: !!document.querySelector('.stories iframe') }));
await page.screenshot({ path: `${SP}/stories_1_playing.png` });
check('station plays a real episode in the visible player', !!st, JSON.stringify(info));
await page.waitForTimeout(9000);
const saved1 = await page.evaluate(() => JSON.parse(localStorage.getItem('mk.stories.v1') || '{}'));
check('position is remembered while playing', saved1.t > 0, JSON.stringify(saved1));
await page.keyboard.press('KeyF'); // get out
await until(() => window.__mk.occ.phase === 'walking', 20000);
await page.waitForTimeout(800);
check('player gone after getting out', await page.evaluate(() => !document.querySelector('.stories iframe')));
await page.keyboard.press('KeyF'); // back in
await until(() => window.__mk.occ.phase === 'seated', 30000);
await until(() => window.__mk.useStories?.getState().status === 'playing', 40000);
const again = await page.evaluate(() => window.__mk.useStories?.getState().episode?.youtubeId);
check('resumes the same episode', again === saved1.id, `${again} vs ${saved1.id}`);
await page.screenshot({ path: `${SP}/stories_2_resumed.png` });
console.log('ERRORS', errors.length ? errors.slice(0, 5) : 'none');
await browser.close();
