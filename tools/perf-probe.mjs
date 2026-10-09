#!/usr/bin/env node
// Draw calls / triangles at a few spots (software GL: fps is meaningless, counts are real).
//   node tools/perf-probe.mjs [tier]
import { chromium } from 'playwright';
const tier = process.argv[2] ?? 'high';
const SPOTS = { mtaa: '7.6,30', market: '-44,46', kibera_lane: '-215,12', cbd: '20,-790', estate: '-960,-660' };
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const [name, spawn] of Object.entries(SPOTS)) {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  await page.goto(`http://localhost:4173/?debug&perf&tier=${tier}${process.env.EXTRA ?? ''}&spawn=${spawn}`);
  await page.getByRole('button', { name: 'Tap to enter' }).click({ timeout: 300000 });
  await page.waitForTimeout(12000);
  const s = await page.evaluate(() => ({ ...window.__mk.perfStats }));
  console.log(`${name.padEnd(12)} calls=${s.calls} tris=${s.tris} fps(sw)=${s.fps?.toFixed?.(1)}`);
  await page.close();
}
await browser.close();
