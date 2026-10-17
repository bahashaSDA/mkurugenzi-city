#!/usr/bin/env node
// Photograph the whole city from straight above (the game's ?maprender mode) as a grid of tiles,
// for the satellite map. Midday, no fog, full detail, no HUD / people / moving traffic.
//   npm run build && npx vite preview --port 4173
//   node tools/render-map.mjs <outDir> [tiles=16] [px=512] [x0,z0,x1,z1]
// then: python tools/stitch-map.py <outDir>
import { chromium } from 'playwright';
import { mkdirSync, existsSync } from 'node:fs';
const OUT = process.argv[2] ?? 'map-tiles';
const N = Number(process.argv[3] ?? 16);
const PX = Number(process.argv[4] ?? 512);
const [X0, Z0, X1, Z1] = (process.argv[5] ?? '-2000,-2000,2000,2000').split(',').map(Number);
mkdirSync(OUT, { recursive: true });
// GPU=1 renders on the real graphics card (much faster); otherwise software GL (works anywhere)
const GL = process.env.GPU ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const browser = await chromium.launch({ args: GL });
const page = await browser.newPage({ viewport: { width: PX, height: PX } });
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto(`http://localhost:4173/?debug&maprender&tier=${process.env.TIER ?? 'high'}&time=12.5&freeze&noshadow&spawn=0,0`);
await page.getByRole('button', { name: 'Tap to enter' }).click({ timeout: 600000 });
await page.waitForTimeout(8000);
const size = (X1 - X0) / N;
const t0 = Date.now();
for (let j = 0; j < N; j++) {
  for (let i = 0; i < N; i++) {
    const file = `${OUT}/${i}_${j}.png`;
    if (existsSync(file)) continue;
    const x = X0 + (i + 0.5) * size;
    const z = Z0 + (j + 0.5) * size;
    await page.evaluate(([x, z, size]) => {
      const mk = window.__mk;
      window.__maptile = { x, z, size };
      Object.assign(mk.teleport, { x, z, y: mk.heightAt(x, z) + 1.0, facing: 0, pending: true });
    }, [x, z, size]);
    // a frame occasionally comes back blank (all black): an empty tile compresses to a few kB, retry it
    for (let attempt = 0; attempt < 4; attempt++) {
      await page.waitForTimeout(2500 + attempt * 2000);
      const png = await page.locator('canvas').first().screenshot({ path: file, timeout: 600000 });
      if (png.length > 8000) break;
      console.log(`[map] tile ${i},${j} came back blank, retrying`);
    }
    const done = j * N + i + 1;
    console.log(`[map] ${done}/${N * N} tile ${i},${j} (${((Date.now() - t0) / done / 1000).toFixed(1)} s/tile)`);
  }
}
await browser.close();
