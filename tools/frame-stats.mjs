#!/usr/bin/env node
// What one frame in play costs: scene objects (and how many update their matrices every frame),
// draw calls, triangles, physics bodies.  node tools/frame-stats.mjs [query]
import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
await p.goto('http://localhost:4173/?debug' + (process.argv[2] ? '&' + process.argv[2] : ''));
const btn = p.getByRole('button', { name: 'Tap to enter' });
await btn.waitFor({ timeout: 600000 });
await btn.click();
await p.locator('.splash2').waitFor({ state: 'detached', timeout: 20000 });
await p.waitForTimeout(3000);
console.log(JSON.stringify(await p.evaluate(() => {
  const { gl, scene } = window.__mk;
  let objects = 0, auto = 0, meshes = 0, visibleMeshes = 0, skinned = 0, lights = 0;
  const byTop = {};
  scene.traverse((o) => {
    objects++; if (o.matrixAutoUpdate) auto++;
    if (o.isMesh) { meshes++; let v = true; for (let q = o; q; q = q.parent) if (!q.visible) v = false; if (v) visibleMeshes++; if (o.isSkinnedMesh) skinned++; }
    if (o.isLight) lights++;
  });
  for (const c of scene.children) { let n = 0; c.traverse(() => n++); const k = c.name || c.type; byTop[k] = (byTop[k] ?? 0) + n; }
  const top = Object.entries(byTop).sort((a, b) => b[1] - a[1]).slice(0, 12);
  const w = window.__mk.physics; let dyn = 0, awake = 0, kin = 0, fixed = 0; const shapes = {};
  if (w) { w.bodies.forEach((b) => { if (b.isDynamic()) { dyn++; if (!b.isSleeping()) awake++; } else if (b.isKinematic()) kin++; else fixed++; }); w.colliders.forEach((c) => { const t = c.shape.type; shapes[t] = (shapes[t] ?? 0) + 1; }); }
  let stepMs = null; if (w) { const t = performance.now(); for (let i = 0; i < 20; i++) w.step(); stepMs = +((performance.now() - t) / 20).toFixed(2); }
  return { physics: { dyn, awake, kin, fixed, colliders: w?.colliders.len(), shapes, stepMs },
    tier: window.__mk.useGame.getState().tier, objects, matrixAutoUpdate: auto, meshes, visibleMeshes, skinned, lights, calls: gl.info.render.calls, triangles: gl.info.render.triangles, programs: gl.info.programs.length, top };
}), null, 1));
await b.close();
