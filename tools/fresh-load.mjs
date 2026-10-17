#!/usr/bin/env node
// A fresh visit, like a player: splash -> Tap to enter -> the world. Records console errors, how long
// until the first real frame, frame times for 20 s, and screenshots.  node tools/fresh-load.mjs <url> <shotDir>
import { chromium } from 'playwright';
const [URL = 'http://localhost:5173/', SP = '.'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text().slice(0, 200)}`); });
const t0 = Date.now();
await page.goto(URL + (process.env.Q ?? ''));
await page.waitForTimeout(3000);
await page.screenshot({ path: `${SP}/load_1_splash.png` });
const btn = page.getByRole('button', { name: 'Tap to enter' });
await btn.waitFor({ timeout: 420000 });
const tReady = Date.now() - t0;
await btn.click();
const tClick = Date.now();
// after the curtain: is the world on screen (a screenshot, not a canvas read-back), and how smooth
// are the next 15 s of frames (rAF intervals)
await page.waitForTimeout(3000);
const shot = await page.screenshot({ path: `${SP}/load_2_world.png` });
const res = await page.evaluate(async () => {
  const frames = []; let last = performance.now(); const start = last;
  await new Promise((done) => { const step = (t) => { frames.push(t - last); last = t; if (t - start < 15000) requestAnimationFrame(step); else done(); }; requestAnimationFrame(step); });
  frames.sort((a, b) => a - b);
  const q = (f) => +frames[Math.min(frames.length - 1, Math.floor(frames.length * f))].toFixed(1);
  return { frames: frames.length, fps: +(frames.length / 15).toFixed(0), p50: q(0.5), p95: q(0.95), p99: q(0.99), max: q(1), over50ms: frames.filter((f) => f > 50).length };
});
// the screenshot's brightness (a black screen is ~0)
const { PNG } = await import('pngjs').catch(() => ({ PNG: null }));
let bright = null;
if (PNG) { const im = PNG.sync.read(shot); let sum = 0; for (let i = 0; i < im.data.length; i += 16) sum += im.data[i] + im.data[i + 1] + im.data[i + 2]; bright = +(sum / (im.data.length / 16) / 3).toFixed(0); }
res.screenBrightness = bright; res.blackScreen = bright !== null ? bright < 10 : 'unknown';
console.log(JSON.stringify({ splashReadyMs: tReady, ...res }));
console.log('ERRORS', errors.length ? [...new Set(errors)].slice(0, 12) : 'none');
await browser.close();
