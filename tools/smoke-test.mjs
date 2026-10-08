#!/usr/bin/env node
// Browser smoke test: movement + collision checks in headless Chromium against a running build.
//   npm run build && npx vite preview --port 4173   (in another terminal)
//   npx playwright install chromium                 (first time only)
//   node tools/smoke-test.mjs [screenshotDir]
// Note: FPS printed here comes from software rendering (SwiftShader) and is NOT a perf measurement.
// Use ?benchmark on real devices for performance (SPEC 10.12).
import { chromium } from 'playwright';
const SP = process.argv[2] ?? '.';
const base = 'http://localhost:4173/';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
const results = [];

async function run(name, query, keys, ms, check) {
  const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${name} console: ${m.text()}`); });
  await page.goto(base + '?debug&perf&tier=low&' + query);
  const btn = page.getByRole('button', { name: 'Tap to enter' });
  await btn.waitFor({ timeout: 60000 });
  await btn.click();
  await page.waitForTimeout(1500);
  const before = await page.evaluate(() => ({ ...window.__mk.playerPosition }));
  await page.evaluate(() => { window.__maxY = -1e9; const loop = () => { window.__maxY = Math.max(window.__maxY, window.__mk.playerPosition.y); requestAnimationFrame(loop); }; loop(); });
  for (const k of keys) await page.keyboard.down(k);
  await page.waitForTimeout(ms);
  for (const k of keys) await page.keyboard.up(k);
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => ({ ...window.__mk.playerPosition, maxY: window.__maxY }));
  const stats = await page.evaluate(() => ({ ...window.__mk.perfStats }));
  await page.screenshot({ path: `${SP}/${name}.png` });
  const f = (v) => `(${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)})`;
  const verdict = check(before, after);
  results.push(verdict);
  console.log(`${name}: ${f(before)} -> ${f(after)} maxY=${after.maxY.toFixed(2)}  ${verdict}  fps=${stats.fps.toFixed(1)} calls=${stats.calls} tris=${stats.tris}`);
  await page.close();
}

await run('spawn_walk_letters', '', ['KeyW'], 9000, (b, a) => (a.z < b.z - 3 ? 'PASS moved north' : 'FAIL did not move'));
await run('wall_block', 'spawn=-14,-3', ['KeyW'], 9000, (b, a) => (a.z > -5.7 ? 'PASS wall held (z>-5.7)' : 'FAIL passed through wall'));
await run('step_030', 'spawn=-16,9', ['KeyW'], 9000, (b, a) => (a.maxY > b.y + 0.25 ? 'PASS stepped up 0.30 m' : 'FAIL no step-up'));
await run('step_045', 'spawn=-13.5,9', ['KeyW'], 9000, (b, a) => (a.maxY < b.y + 0.1 && a.z > 6.9 ? 'PASS blocked by 0.45 m' : 'FAIL climbed/passed 0.45 m'));
await run('ramp_55', 'spawn=-36,12', ['KeyW'], 9000, (b, a) => (a.maxY < b.y + 1.0 ? 'PASS could not climb 55°' : 'FAIL climbed 55° ramp'));
await run('ramp_30', 'spawn=-32,12', ['KeyW'], 9000, (b, a) => (a.maxY > b.y + 3.0 ? 'PASS climbed 30° ramp' : 'FAIL could not climb 30° ramp'));
console.log('ERRORS:', errors.length ? errors.join(' | ') : 'none');
const failed = results.filter((r) => r.startsWith("FAIL")).length;
console.log(failed ? `${failed} check(s) FAILED` : "ALL CHECKS PASSED");
process.exitCode = failed || errors.length ? 1 : 0;
await browser.close();
