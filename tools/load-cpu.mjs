#!/usr/bin/env node
// CPU profile of loading (open -> "Tap to enter"): the functions that take the time, with the
// call path that leads to them.  node tools/load-cpu.mjs [url]
import { chromium } from 'playwright';
const URL = process.argv[2] ?? 'http://localhost:4173/';
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
import { devices } from 'playwright';
// PHONE=1: Pixel 7 emulation; CPU=n: CPU slowed n times
const page = process.env.PHONE ? await (await browser.newContext(devices['Pixel 7'])).newPage() : await browser.newPage({ viewport: { width: 1280, height: 720 } });
const cdp = await page.context().newCDPSession(page);
if (process.env.CPU) await cdp.send('Emulation.setCPUThrottlingRate', { rate: +process.env.CPU });
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 2000 });
const AFTER = process.env.AFTER === '1'; // AFTER=1: profile the 15 s after "Tap to enter" instead
if (!AFTER) await cdp.send('Profiler.start'); // (WIN=1 restarts it later)
await page.goto(URL + (process.env.Q ?? ''));
if (process.env.WIN !== '1') await page.getByRole('button', { name: 'Tap to enter' }).waitFor({ timeout: 600000 });
const has = (n) => page.evaluate((n) => performance.getEntriesByName(n).length > 0, n).catch(() => false);
if (process.env.WIN === '1') {
  // WIN=1: profile only the tier measurement (first shader compile done -> frames measured)
  await cdp.send('Profiler.stop');
  while (!(await has('mk:ready:compiled'))) await page.waitForTimeout(50);
  await cdp.send('Profiler.start');
  while (!(await has('mk:ready:measured'))) await page.waitForTimeout(50);
} else if (AFTER) {
  await page.waitForTimeout(1500);
  await cdp.send('Profiler.start');
  await page.getByRole('button', { name: 'Tap to enter' }).click();
  if (process.env.PHONE) await page.locator('.splash2').waitFor({ state: 'detached', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(+(process.env.DUR ?? 15000));
}
const { profile } = await cdp.send('Profiler.stop');
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const parent = new Map();
for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
const self = new Map();
const dt = profile.timeDeltas;
let pick = () => true;
if (process.env.LONG === '1') {
  // LONG=1: only the longest stretch without idle samples (the freeze), not the whole window
  const idle = new Set(profile.nodes.filter((n) => n.callFrame.functionName === '(idle)').map((n) => n.id));
  let best = [0, 0], st = 0, acc = 0;
  profile.samples.forEach((id, i) => {
    if (idle.has(id)) { st = i + 1; acc = 0; return; }
    acc += dt[i] ?? 0;
    if (acc > best[2] || best[2] === undefined) best = [st, i, acc];
  });
  console.log(`longest busy stretch ${(best[2] / 1000).toFixed(0)} ms`);
  pick = (i) => i >= best[0] && i <= best[1];
}
profile.samples.forEach((id, i) => { if (pick(i)) self.set(id, (self.get(id) ?? 0) + (dt[i] ?? 0)); });
// inclusive time per function name (dedupe recursion per sample path)
const incl = new Map();
for (const [id, t] of self) {
  const seen = new Set();
  let cur = id;
  while (cur !== undefined) {
    const n = byId.get(cur);
    const f = n.callFrame;
    const key = `${f.functionName || '(anon)'} ${f.url.split('/').pop()}:${f.lineNumber}`;
    if (!seen.has(key)) { seen.add(key); incl.set(key, (incl.get(key) ?? 0) + t); }
    cur = parent.get(cur);
  }
}
const skip = process.env.LONG === '1' ? /^\(root\)/ : /^\(root\)|^\(program\)|^\(idle\)/;
const top = [...incl.entries()].filter(([k]) => !skip.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 40);
for (const [k, t] of top) console.log((t / 1000).toFixed(0).padStart(7), 'ms', k);
await browser.close();
