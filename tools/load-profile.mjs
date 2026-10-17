#!/usr/bin/env node
// Where the loading time goes (session 12): downloads (size, when they finish) and long main-thread
// tasks, from page open until "Tap to enter".  node tools/load-profile.mjs [url]
import { chromium } from 'playwright';
const URL = process.argv[2] ?? 'http://localhost:4173/';
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.addInitScript(() => {
  window.__long = [];
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ entryTypes: ['longtask'] });
});
const t0 = Date.now();
await page.goto(URL);
await page.getByRole('button', { name: 'Tap to enter' }).waitFor({ timeout: 600000 });
const total = Date.now() - t0;
const r = await page.evaluate(() => {
  const res = performance.getEntriesByType('resource').map((e) => ({ n: e.name.replace(location.origin, '').slice(0, 70), kb: Math.round((e.transferSize || e.encodedBodySize) / 1024), end: Math.round(e.responseEnd), dur: Math.round(e.duration) }));
  res.sort((a, b) => b.end - a.end);
  const long = window.__long;
  const busy = long.reduce((a, [, d]) => a + d, 0);
  long.sort((a, b) => b[1] - a[1]);
  return { lastDownloads: res.slice(0, 12), totalMB: +(res.reduce((a, e) => a + e.kb, 0) / 1024).toFixed(1), count: res.length, busyMs: busy, longest: long.slice(0, 12) };
});
console.log(JSON.stringify({ totalMs: total, ...r }, null, 1));
await browser.close();
