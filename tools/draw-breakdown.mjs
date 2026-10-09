#!/usr/bin/env node
// Which objects cost the draw calls: visible meshes grouped by kit piece / kind.
//   node tools/draw-breakdown.mjs <tier> <spawn x,z>
import { chromium } from 'playwright';
const tier = process.argv[2] ?? 'low';
const spawn = process.argv[3] ?? '7.6,30';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
await page.goto(`http://localhost:4173/?debug&perf&tier=${tier}&spawn=${spawn}`);
await page.getByRole('button', { name: 'Tap to enter' }).click({ timeout: 300000 });
await page.waitForTimeout(12000);
const r = await page.evaluate(() => {
  const { scene } = window.__mk;
  const cats = {};
  scene.traverseVisible((o) => {
    if (!o.isMesh || (o.isInstancedMesh && o.count === 0)) return;
    const g = o.geometry;
    const tri = ((g.index ? g.index.count : g.attributes.position.count) / 3) * (o.isInstancedMesh ? o.count : 1);
    const cat = o.isInstancedMesh ? 'inst:' + (o.name.split('_LOD')[0] || 'vehicle') : o.isSkinnedMesh ? 'skinned' : 'mesh:' + (o.name || o.material?.name || o.parent?.name || '?').slice(0, 20);
    const c = (cats[cat] ??= { calls: 0, tris: 0, shadow: 0 });
    c.calls += 1;
    c.tris += tri;
    if (o.castShadow) c.shadow += 1;
  });
  const rows = Object.entries(cats).sort((a, b) => b[1].calls - a[1].calls);
  return rows.slice(0, 22).map(([k, v]) => `${k.padEnd(28)} calls=${String(v.calls).padStart(4)} shadow=${String(v.shadow).padStart(3)} tris=${Math.round(v.tris)}`).join('\n');
});
console.log(r);
await browser.close();
