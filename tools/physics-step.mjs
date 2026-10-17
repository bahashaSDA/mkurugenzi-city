// Cost of one physics step, and with kinematic / dynamic bodies or far colliders switched off.
//   node tools/physics-step.mjs
import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
await p.goto('http://localhost:4173/?debug');
const btn = p.getByRole('button', { name: 'Tap to enter' });
await btn.waitFor({ timeout: 600000 });
await btn.click();
await p.locator('.splash2').waitFor({ state: 'detached', timeout: 20000 });
await p.waitForTimeout(2000);
console.log(JSON.stringify(await p.evaluate(() => {
  const w = window.__mk.physics;
  const time = () => { for (let i = 0; i < 40; i++) w.step(); const t = performance.now(); for (let i = 0; i < 30; i++) w.step(); return +((performance.now() - t) / 30).toFixed(2); };
  const r = { base: time() };
  const kin = [], dyn = [];
  w.bodies.forEach((b) => { if (b.isKinematic()) kin.push(b); else if (b.isDynamic()) dyn.push(b); });
  kin.forEach((b) => b.setEnabled(false)); r.noKinematic = time();
  dyn.forEach((b) => b.setEnabled(false)); r.noKinNoDyn = time();
  kin.forEach((b) => b.setEnabled(true)); dyn.forEach((b) => b.setEnabled(true));
  const pp = window.__mk.playerPosition; const far = [];
  w.colliders.forEach((c) => { const t = c.translation(); const pb = c.parent(); if (pb && !pb.isFixed()) return; if (c.shape.type === 7 || c.shape.type === 6) return; if (Math.hypot(t.x - pp.x, t.z - pp.z) > 150) far.push(c); });
  far.forEach((c) => c.setEnabled(false)); r.farDisabled = far.length; r.withFarOff = time();
  far.forEach((c) => c.setEnabled(true)); r.restored = time();
  r.integration = { ...w.integrationParameters && { iters: w.integrationParameters.numSolverIterations } };
  r.dynColliders = dyn.map((b) => b.numColliders()); r.kinColliders = kin.reduce((a, b) => a + b.numColliders(), 0);
  return r;
})));
await b.close();
