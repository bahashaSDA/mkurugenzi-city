#!/usr/bin/env node
// Commuters boarding at a stage (session 12). node tools/passenger-test.mjs <shotDir>
import { chromium } from 'playwright';
const SP = process.argv[2] ?? '.';
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const check = (n, ok, i = '') => console.log(`${ok ? 'PASS' : 'FAIL'} ${n}${i ? ` (${i})` : ''}`);
await page.goto('http://localhost:4173/?debug&tier=low&spawn=9,100&time=10&freeze');
await page.getByRole('button', { name: 'Tap to enter' }).click({ timeout: 420000 });
await page.waitForTimeout(6000);
let seenWaiting = 0, seenWalking = 0, shot = false;
const t0 = Date.now();
let s;
while (Date.now() - t0 < 120000) {
  s = await page.evaluate(() => ({ ...window.__mk.passengerStats }));
  seenWaiting = Math.max(seenWaiting, s.waiting);
  if (s.walking > 0) { seenWalking++; if (!shot) { await page.waitForTimeout(700); await page.screenshot({ path: `${SP}/passengers_boarding.png` }); shot = true; } }
  if (s.boarded >= 2) break;
  await page.waitForTimeout(400);
}
check('commuters wait at the stage', seenWaiting >= 2, `max waiting ${seenWaiting}`);
check('they walk to the door of a stopped matatu', seenWalking > 0);
check('and board it (passenger count goes up)', s.boarded >= 1, JSON.stringify(s));
console.log('ERRORS', errors.length ? errors.slice(0, 5) : 'none');
await browser.close();
