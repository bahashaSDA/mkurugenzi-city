#!/usr/bin/env node
// Load + play on many screens and devices (Playwright emulation on THIS PC's GPU: screen size,
// pixel ratio, touch, mobile browser and, for the phone profiles, a CPU slowed down 4x like a
// mid-range phone). Every run is a first visit (empty storage). Per device: time to "Tap to enter",
// frame times from the moment the world opens (first 12 s, the start included), page overflow,
// HUD items off screen, touch controls, screenshots.
//   node tools/device-matrix.mjs [url] [shotDir] [only-name-substring]
import { chromium, devices } from 'playwright';
const [URL = 'http://localhost:4173/', SP = '.', ONLY = ''] = process.argv.slice(2);
const D = [
  { name: 'desktop-1920x1080', viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 },
  { name: 'desktop-2560x1440', viewport: { width: 2560, height: 1440 }, deviceScaleFactor: 1 },
  { name: 'laptop-1366x768', viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 },
  { name: 'laptop-hidpi-1440x900@2', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  { name: 'ipad-portrait', ...devices['iPad (gen 7)'] },
  { name: 'ipad-landscape', ...devices['iPad (gen 7) landscape'] },
  { name: 'iphone13-portrait', ...devices['iPhone 13'], cpu: 4 },
  { name: 'iphone13-landscape', ...devices['iPhone 13 landscape'], cpu: 4 },
  { name: 'pixel7-portrait', ...devices['Pixel 7'], cpu: 4 },
  { name: 'galaxyS9-small-landscape', ...devices['Galaxy S9+ landscape'], cpu: 4 },
  { name: 'small-phone-360x640', viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, cpu: 6 },
];
const out = [];
for (const d of D) {
  if (ONLY && !d.name.includes(ONLY)) continue;
  const { name, cpu, defaultBrowserType: _b, ...ctxOpts } = d;
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
  if (cpu && !process.env.NOCPU) { const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: +(process.env.CPU ?? cpu) }); }
  const t0 = Date.now();
  await page.goto(URL);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${SP}/dev_${name}_splash.png` });
  const btn = page.getByRole('button', { name: 'Tap to enter' });
  let r = { name, cpu: cpu ?? 1 };
  try {
    await btn.waitFor({ timeout: 300000 });
    r.readyS = +((Date.now() - t0) / 1000).toFixed(1);
    r.splashOverflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    if (ctxOpts.hasTouch) await btn.tap(); else await btn.click();
    // the curtain stays down until the game draws smoothly; the player sees the world from then
    const tc = Date.now();
    await page.locator('.splash2').waitFor({ state: 'detached', timeout: 20000 });
    r.curtainS = +((Date.now() - tc) / 1000).toFixed(1);
    // frames from the instant the world is visible
    const f = await page.evaluate(async () => {
      const fr = []; let last = performance.now(); const start = last;
      await new Promise((done) => { const step = (t) => { fr.push(t - last); last = t; if (t - start < 12000) requestAnimationFrame(step); else done(); }; requestAnimationFrame(step); });
      const first2 = fr.slice(0, 1 + fr.findIndex((_, i) => fr.slice(0, i + 1).reduce((a, b) => a + b, 0) > 2000));
      const s = [...fr].sort((a, b) => a - b);
      const q = (p) => +s[Math.min(s.length - 1, Math.floor(s.length * p))].toFixed(1);
      return { fps: +(fr.length / 12).toFixed(0), p50: q(0.5), p95: q(0.95), max: q(1), over50: fr.filter((x) => x > 50).length, over100: fr.filter((x) => x > 100).length, maxFirst2s: +Math.max(...first2).toFixed(1) };
    });
    Object.assign(r, f);
    await page.screenshot({ path: `${SP}/dev_${name}_play.png` });
    Object.assign(r, await page.evaluate(() => {
      const W = innerWidth, H = innerHeight;
      const off = [];
      for (const el of document.querySelectorAll('.hud *, .touch-controls *, .prompts *, button')) {
        const b = el.getBoundingClientRect();
        if (b.width === 0 || b.height === 0 || getComputedStyle(el).visibility === 'hidden') continue;
        if (b.right > W + 2 || b.bottom > H + 2 || b.left < -2 || b.top < -2) off.push((el.className || el.tagName).toString().slice(0, 30));
      }
      return {
        tier: (window.__mkStore?.getState?.().tier) ?? localStorage.getItem('mk.tier.learned.v1'),
        overflow: document.documentElement.scrollWidth > W + 1,
        offscreen: [...new Set(off)].slice(0, 6),
        touchUI: !!document.querySelector('.touch-controls, [class*="touch"]'),
      };
    }));
  } catch (e) { r.fail = String(e).slice(0, 120); }
  r.errors = [...new Set(errors)].slice(0, 3);
  console.log(JSON.stringify(r));
  out.push(r);
  await browser.close();
}
