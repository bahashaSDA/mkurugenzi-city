// Offline film rendering for marketing footage. The page's clock (performance.now, Date.now) and
// requestAnimationFrame are replaced by a virtual clock: every step() advances the game exactly
// 1/FPS s and renders one frame, however long the GPU takes, so the footage is perfectly smooth
// at any resolution. Frames are screenshotted to JPEG and encoded with ffmpeg.
import { chromium } from 'playwright';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

export const FPS = 30;
// FILM_PREVIEW=1: 960x540 and only every 10th frame saved (framing checks before the 4K render)
export const PREVIEW = !!process.env.FILM_PREVIEW;
export const W = PREVIEW ? 960 : Number(process.env.FILM_W ?? 3840);
export const H = PREVIEW ? 540 : Number(process.env.FILM_H ?? 2160);
const EVERY = PREVIEW ? 10 : 1;
export const BASE = process.env.FILM_BASE ?? 'http://localhost:4173';

const VIRTUAL_TIME = () => {
  const rp = performance.now.bind(performance);
  const rd = Date.now.bind(Date);
  const rRAF = window.requestAnimationFrame.bind(window);
  let on = false;
  let vnow = 0;
  let base = 0;
  let q = [];
  performance.now = () => (on ? vnow : rp());
  Date.now = () => (on ? Math.floor(base + vnow) : rd());
  window.requestAnimationFrame = (cb) => {
    if (!on) return rRAF(cb);
    q.push(cb);
    return q.length;
  };
  window.__film = {
    start() {
      if (on) return;
      vnow = rp();
      base = rd() - vnow;
      on = true;
    },
    step(dtMs) {
      vnow += dtMs;
      const cbs = q;
      q = [];
      for (const cb of cbs) cb(vnow);
      return cbs.length;
    },
    get on() {
      return on;
    },
  };
};

const HIDE_UI = `#root *:not(canvas) { visibility: hidden !important; } canvas { visibility: hidden !important; } canvas[data-engine] { visibility: visible !important; }`;

export async function open({ query = '', spawn, time = 12, weather = 'clear', hud = false } = {}) {
  const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.addInitScript(VIRTUAL_TIME);
  const sp = spawn ? `&spawn=${spawn[0]},${spawn[1]}` : '';
  await page.goto(`${BASE}/?debug&film&tier=high&freeze&time=${time}&weather=${weather}${sp}&${query}`);
  await page.getByRole('button', { name: 'Tap to enter' }).click({ timeout: 900000 });
  await page.waitForSelector('.splash2', { state: 'detached', timeout: 300000 }).catch(() => {});
  await page.waitForTimeout(4000);
  if (!hud) await page.addStyleTag({ content: HIDE_UI });
  else await page.addStyleTag({ content: `.perf, .minimap-perf { display: none !important; }` });
  await page.evaluate(() => window.__film.start());
  const film = new Film(browser, page);
  return film;
}

export class Film {
  constructor(browser, page) {
    this.browser = browser;
    this.page = page;
  }
  /** run JS in the page with window.__mk */
  ev(fn, arg) {
    return this.page.evaluate(fn, arg);
  }
  async step(n = 1) {
    for (let i = 0; i < n; i++) await this.page.evaluate((dt) => window.__film.step(dt), 1000 / FPS);
  }
  /** advance the game without filming, letting streaming / loads catch up in real time */
  async warm(seconds, realMsPerFrame = 25, each) {
    const n = Math.round(seconds * FPS);
    for (let i = 0; i < n; i++) {
      if (each) await each(i / FPS);
      await this.step();
      if (realMsPerFrame) await this.page.waitForTimeout(realMsPerFrame);
    }
  }
  async clock(hours) {
    await this.ev((h) => (window.__mk.clock.hours = h), hours);
  }
  async teleport(x, z, facing = 0) {
    await this.ev(([x, z, f]) => {
      const t = window.__mk.teleport;
      Object.assign(t, { pending: true, x, z, y: window.__mk.surfaceAt(x, z) + 0.95, facing: f });
    }, [x, z, facing]);
    await this.step(2);
  }
  /** camera: fixed world camera (camOverride) or null for the game's own camera */
  async cam(c) {
    await this.ev((c) => {
      const o = window.__mk.camOverride;
      if (!c) {
        o.on = false;
        return;
      }
      Object.assign(o, { on: true, x: c[0], y: c[1], z: c[2], lx: c[3], ly: c[4], lz: c[5] });
    }, c);
  }
  /** camera with heights above the ground under the camera and under the look point */
  async camRel(c) {
    await this.ev((c) => {
      const h = window.__mk.heightAt;
      Object.assign(window.__mk.camOverride, { on: true, x: c[0], y: h(c[0], c[2]) + c[1], z: c[2], lx: c[3], ly: h(c[3], c[5]) + c[4], lz: c[5] });
    }, c);
  }
  async key(code, down = true) {
    if (down) await this.page.keyboard.down(code);
    else await this.page.keyboard.up(code);
  }
  async press(code) {
    await this.page.keyboard.press(code);
  }
  /**
   * Film a shot: `seconds` long; before each frame `each(t, k)` (t seconds into the shot, k = 0..1)
   * may move the camera or drive the game. Frames go to dir/00000.jpg...
   */
  async shot(dir, seconds, each) {
    if (existsSync(dir)) rmSync(dir, { recursive: true });
    mkdirSync(dir, { recursive: true });
    const n = Math.round(seconds * FPS);
    const t0 = Date.now();
    for (let i = 0; i < n; i++) {
      if (each) await each(i / FPS, n > 1 ? i / (n - 1) : 0);
      await this.step();
      if (i % EVERY === 0) await this.page.screenshot({ path: `${dir}/${String(i / EVERY).padStart(5, '0')}.jpg`, type: 'jpeg', quality: PREVIEW ? 80 : 94 });
      if (i % 60 === 0) console.log(`  ${dir.split(/[\/]/).pop()} ${i}/${n} (${((Date.now() - t0) / Math.max(1, i)).toFixed(0)} ms/frame)`);
    }
    return n;
  }
  async close() {
    await this.browser.close();
  }
}

/** frames -> 4K H.264 (high quality, web-ready); deletes the frames */
export function encode(dir, out, keep = false) {
  if (PREVIEW || !existsSync(dir)) return; // (a shot cut from the script leaves a gap in the numbering)
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', `${dir}/%05d.jpg`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: 'inherit' });
  if (!keep) rmSync(dir, { recursive: true });
}

// --- camera helpers ---
export const lerp = (a, b, k) => a + (b - a) * k;
/** smooth ease in/out */
export const ease = (k) => k * k * (3 - 2 * k);
/** interpolate two camera keys [x,y,z,lx,ly,lz] */
export const camLerp = (a, b, k) => a.map((v, i) => lerp(v, b[i], k));
/** orbit round (cx, cz) at radius r, height y, looking at (cx, ly, cz), angle in radians */
export const orbit = (cx, cz, r, y, ly, ang) => [cx + Math.cos(ang) * r, y, cz + Math.sin(ang) * r, cx, ly, cz];
