#!/usr/bin/env node
// Visual regression screenshots from fixed cameras (VISUAL_OVERHAUL_SPEC section 58).
//   npm run build && npx vite preview --port 4173      (other terminal)
//   node tools/visual-tests.mjs <version-label> [name-regex]        -> research/visual-tests/<label>/*.png
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
  character_closeup: '8.5,1.55,32.4,7.6,1.2,30',
  street_spawn_view: '7.6,2.4,34.5,9,2.0,0',
  street_from_road: '14,1.7,40,14,2.5,-30',
  market_aisle: '-44,1.7,40,-44,1.4,70&spawn=-44,46',
  market_wide: '-10,14,30,-45,0,65&spawn=-40,60',
  matatu_stage: '24,2.4,108,12,1.4,122&spawn=8,104',
  kibera_rooftops: '-175,26,40,-300,8,-20&spawn=-230,15',
  kibera_lane: '-200,9,14,-240,6,10&spawn=-215,12',
  rocky_ridge: '170,22,430,300,8,440',
  expressway: '40,8,-280,10,1,-340',
};
const only = process.argv[3] ? new RegExp(process.argv[3]) : null;

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const [name, cam] of Object.entries(SHOTS)) {
  if (only && !only.test(name)) continue;
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
