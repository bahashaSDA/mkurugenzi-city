#!/usr/bin/env node
// Visual regression screenshots from fixed cameras (VISUAL_OVERHAUL_SPEC section 58).
//   npm run build && npx vite preview --port 4173      (other terminal)
//   node tools/visual-tests.mjs <version-label>          -> research/visual-tests/<label>/*.png
// Headless software GL: images are for look comparison only, not performance.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const label = process.argv[2] ?? new Date().toISOString().slice(0, 10);
const out = `research/visual-tests/${label}`;
mkdirSync(out, { recursive: true });

// name -> camera "x,y,z,targetX,targetY,targetZ"
const SHOTS = {
  hub_day_street: '0,1.7,30,0,1.6,-20',
  hub_day_wide: '-30,28,70,-10,0,-40',
  hub_shacks_close: '-10.2,1.7,-55,-40,1.4,-58',
  hub_avenue: '14,1.7,45,14,1.5,-20',
  hub_kiosk_close: '-2.2,1.65,-38,-6.6,1.6,-40',
  character_closeup: '0.9,1.55,10.4,0,1.2,8',
};

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const [name, cam] of Object.entries(SHOTS)) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.log(name, 'pageerror', e.message));
  await page.goto(`http://localhost:4173/?tier=high&cam=${cam}`);
  await page.getByRole('button', { name: 'Tap to enter' }).click({ timeout: 90000 });
  await page.waitForTimeout(15000); // software GL is slow; let LODs and shadows settle
  await page.evaluate(() => document.querySelectorAll('.hud, .perf-overlay').forEach((e) => e.remove()));
  await page.screenshot({ path: `${out}/${name}.png`, timeout: 120000 });
  console.log('[visual]', `${out}/${name}.png`);
  await page.close();
}
await browser.close();
