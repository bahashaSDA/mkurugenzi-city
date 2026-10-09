#!/usr/bin/env node
// Note: under software GL the simulation runs ~10x slower than real time, hence the long waits.
// End-to-end matatu test: stand at the roadside, wave (H), board (F), ride, get off (F).
//   npm run build && npx vite preview --port 4173   (other terminal)
//   node tools/ride-test.mjs [screenshotDir]
import { chromium } from 'playwright';
const SP = process.argv[2] ?? '.';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:4173/?debug&tier=low&spawn=9,100');
await page.getByRole('button', { name: 'Tap to enter' }).click({ timeout: 90000 });
await page.waitForTimeout(4000);
const st = () => page.evaluate(() => ({
  ride: window.__mk.ride.vehicle, prompt: window.__mk.usePrompt.getState().current?.label ?? '',
  money: window.__mk.useEconomy.getState().money, toasts: window.__mk.useEconomy.getState().toasts.map((t) => t.text),
  p: { ...window.__mk.playerPosition },
}));
let ok = { hail: false, board: false, alight: false };
for (let t = 0; t < 90 && !ok.board; t++) {
  if (t % 25 === 0) await page.keyboard.press('KeyH');
  await page.waitForTimeout(3000);
  const s = await st();
  if (s.toasts.some((x) => x.includes('coming') || x.includes('Panda'))) ok.hail = true;
  if (s.prompt.startsWith('Board')) {
    await page.screenshot({ path: `${SP}/ride_0_door.png` });
    await page.keyboard.press('KeyF');
    await page.waitForTimeout(1500);
    const a = await st();
    ok.board = a.ride >= 0;
    console.log('boarded:', ok.board, a.toasts.join(' | '), 'money', a.money);
  } else if (t % 5 === 0) console.log(`t=${t} prompt="${s.prompt}" toasts=${s.toasts.join(' | ')}`);
}
let moved = 0;
if (ok.board) {
  await page.waitForTimeout(8000);
  await page.screenshot({ path: `${SP}/ride_1_inside.png` });
  const start = await st();
  for (let t = 0; t < 160 && !ok.alight; t++) {
    const now = await st();
    moved = Math.max(moved, Math.hypot(now.p.x - start.p.x, now.p.z - start.p.z));
    if (moved > 40) await page.keyboard.press('KeyF'); // ride a while, then get off at the next stop
    await page.waitForTimeout(2500);
    const s = await st();
    ok.alight = s.ride < 0;
    if (t % 4 === 0) console.log(`riding t=${t} p=(${s.p.x.toFixed(0)},${s.p.z.toFixed(0)}) ${s.toasts.slice(-1)}`);
  }
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${SP}/ride_2_off.png` });
}
console.log('RESULT', JSON.stringify(ok), 'rode', Math.round(typeof moved === 'number' ? moved : 0), 'm', 'errors:', errors.length ? errors : 'none');
await browser.close();
