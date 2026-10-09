#!/usr/bin/env node
// Missions: start one at its marker (E), check the objective HUD, the radar and the full map (M).
//   node tools/mission-test.mjs [screenshotDir]
import { chromium } from 'playwright';
const SP = process.argv[2] ?? '.';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:4173/?debug&tier=low&spawn=10.5,38');
await page.getByRole('button', { name: 'Tap to enter' }).click({ timeout: 300000 });
let prompt = '';
for (let t = 0; t < 40 && !prompt.startsWith('Start mission'); t++) {
  await page.waitForTimeout(1000);
  prompt = await page.evaluate(() => window.__mk.usePrompt.getState().current?.label ?? '');
}
console.log('prompt:', prompt);
await page.keyboard.press('KeyE');
await page.waitForTimeout(3000);
const m = await page.evaluate(() => ({ ...window.__mk.useMissions.getState(), begin: undefined }));
console.log('active:', m.active, 'step:', m.step, 'dialogue:', m.dialogue?.name, '-', m.dialogue?.text?.slice(0, 60));
await page.screenshot({ path: `${SP}/mission_1.png`, timeout: 120000 });
await page.keyboard.press('KeyM');
await page.waitForTimeout(3000);
await page.screenshot({ path: `${SP}/mission_2_map.png`, timeout: 120000 });
console.log('RESULT started:', m.active === 'chai', 'errors:', errors.length ? errors : 'none');
await browser.close();
