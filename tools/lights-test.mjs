#!/usr/bin/env node
// Traffic lights (session 12): at a CBD junction for ~70 s, every vehicle approaching is tracked:
// none may cross its stop line on red; some must stop at red and go on green.
//   npm run build && npx vite preview --port 4173 ; node tools/lights-test.mjs <shotDir> [junctionId]
import { chromium } from 'playwright';
const SP = process.argv[2] ?? '.';
const JID = Number(process.argv[3] ?? 8);
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:4173/?debug&tier=low');
await page.getByRole('button', { name: 'Tap to enter' }).click({ timeout: 420000 });
await page.waitForTimeout(3000);
const j = await page.evaluate((id) => window.__mk.junctions()[id], JID);
await page.goto(`http://localhost:4173/?debug&tier=low&spawn=${(j.x + 9).toFixed(1)},${(j.z + 9).toFixed(1)}&cam=${(j.x + 22).toFixed(1)},14,${(j.z + 22).toFixed(1)},${j.x.toFixed(1)},0,${j.z.toFixed(1)}`);
await page.getByRole('button', { name: 'Tap to enter' }).click({ timeout: 420000 });
await page.waitForTimeout(5000);
const res = await page.evaluate(async (id) => {
  const mk = window.__mk; const J = mk.junctions()[id];
  const prev = new Map(); const out = { samples: 0, approaches: 0, redRuns: [], stoppedAtRed: 0, wentOnGreen: 0, lights: new Set() };
  const waiting = new Set();
  for (let k = 0; k < 560; k++) { // ~140 s: two full 45 s cycles and then some
    await new Promise((r) => setTimeout(r, 250));
    const t = performance.now() / 1000;
    out.lights.add(mk.lightAt(J, 0, t)); // the signal itself, whether or not anyone is there
    for (const v of mk.vehicles) {
      const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
      const rx = J.x - v.x, rz = J.z - v.z; const ahead = rx * fx + rz * fz;
      if (ahead < -30 || ahead > 50 || Math.abs(rx * fz - rz * fx) > 14) { prev.delete(v.id); continue; }
      const c0 = Math.abs(fx * J.axes[0].dx + fz * J.axes[0].dz), c1 = Math.abs(fx * J.axes[1].dx + fz * J.axes[1].dz);
      if (Math.max(c0, c1) < 0.7) continue;
      const axis = c0 >= c1 ? 0 : 1; const toLine = ahead - J.stop[axis]; const l = mk.lightAt(J, axis, t);
      out.samples++; out.lights.add(l);
      const p = prev.get(v.id);
      if (p && p.toLine >= 0 && toLine < -0.5 && p.light === 'red' && l === 'red') out.redRuns.push({ id: v.id, kind: v.kind, from: +p.toLine.toFixed(1), to: +toLine.toFixed(1) });
      if (l === 'red' && toLine > -0.5 && toLine < 6 && v.v < 0.3 && !waiting.has(v.id)) { waiting.add(v.id); out.stoppedAtRed++; }
      if (waiting.has(v.id) && l === 'green' && v.v > 2) { waiting.delete(v.id); out.wentOnGreen++; }
      if (!p) out.approaches++;
      prev.set(v.id, { toLine, light: l });
    }
  }
  return { ...out, lights: [...out.lights] };
}, JID);
await page.screenshot({ path: `${SP}/lights_junction.png` });
const ok = (n, c, i = '') => console.log(`${c ? 'PASS' : 'FAIL'} ${n}${i ? ` (${i})` : ''}`);
ok('signals cycle through green, amber, red', res.lights.length === 3, res.lights.join(','));
ok('vehicles approached the junction', res.approaches > 0, `${res.approaches} vehicles`);
ok('nobody crossed the stop line on red', res.redRuns.length === 0, JSON.stringify(res.redRuns.slice(0, 3)));
ok('vehicles stop at red and go on green', res.stoppedAtRed > 0 && res.wentOnGreen > 0, `stopped ${res.stoppedAtRed}, went ${res.wentOnGreen}`);
console.log('ERRORS', errors.length ? errors.slice(0, 5) : 'none');
await browser.close();
