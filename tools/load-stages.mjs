#!/usr/bin/env node
// Loading stages (session 12): when the page, the downloads, the world (Ready start), shader compile,
// priming and the tier check finish, and when "Tap to enter" appears.  node tools/load-stages.mjs [url] [fresh]
import { chromium } from 'playwright';
const URL = process.argv[2] ?? 'http://localhost:4173/';
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +(process.env.W ?? 1280), height: +(process.env.H ?? 720) } });
await page.goto(URL);
if (process.argv[3] === 'fresh') { await page.evaluate(() => localStorage.clear()); await page.reload(); }
await page.getByRole('button', { name: 'Tap to enter' }).waitFor({ timeout: 600000 });
const r = await page.evaluate(() => {
  const m = {}; for (const e of performance.getEntriesByType('mark').filter((e) => e.name.startsWith('mk:'))) (m[e.name] ??= []).push(e.detail ? [Math.round(e.startTime), e.detail] : Math.round(e.startTime));
  const res = performance.getEntriesByType('resource');
  return { lastDownload: Math.round(Math.max(...res.map((e) => e.responseEnd))), marks: m, now: Math.round(performance.now()), tier: localStorage.getItem('mk.tier.learned.v1') };
});
console.log(JSON.stringify(r));
if (process.env.TWICE) {
  // a returning player: same browser storage (the learned quality), page opened again
  await page.reload();
  await page.getByRole('button', { name: 'Tap to enter' }).waitFor({ timeout: 600000 });
  console.log('second visit', JSON.stringify(await page.evaluate(() => ({ now: Math.round(performance.now()), primed: performance.getEntriesByName('mk:ready:primed').map((e) => Math.round(e.startTime)) }))));
}
await browser.close();
