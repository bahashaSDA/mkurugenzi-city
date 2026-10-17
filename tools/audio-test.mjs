#!/usr/bin/env node
// Record what the player actually hears (the final mix) in several situations, save each as a
// WebM you can listen to, and measure it (tools/audio-analyse.py): level, clipping, the cricket
// band, beat strength (music), syllable rhythm (speech).
//   npm run build && npx vite preview --port 4173
//   node tools/audio-test.mjs <outDir> [scenes...]
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
const OUT = process.argv[2] ?? 'research/session10-audio';
mkdirSync(OUT, { recursive: true });
const want = process.argv.slice(3);
const GL = process.env.GPU ? ['--use-angle=d3d11', '--enable-gpu'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const browser = await chromium.launch({ args: [...GL, '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const errors = [];

async function open(query) {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://localhost:4173/?debug&tier=low&freeze&${query}`);
  await page.getByRole('button', { name: 'Tap to enter' }).click({ timeout: 420000 });
  await page.waitForTimeout(6000);
  return page;
}
async function record(page, name, ms) {
  const b64 = await page.evaluate((m) => window.__mk.recordMix(m), ms);
  writeFileSync(`${OUT}/${name}.webm`, Buffer.from(b64, 'base64'));
  console.log(`[audio] ${name}.webm ${(b64.length * 0.75 / 1024).toFixed(0)} KB`);
}

const scenes = {
  // daytime high street in the mtaa: Nairobi street bed, birds, footsteps when walking
  async day_street() {
    const page = await open('time=10&spawn=8,40');
    await page.keyboard.down('KeyW');
    await record(page, 'day_street', 12000);
    await page.keyboard.up('KeyW');
    await page.close();
  },
  // dawn in the estate: suburban morning, Hadada ibis, roosters
  async dawn_estate() {
    const page = await open('time=6.4&spawn=-1100,-950');
    await record(page, 'dawn_estate', 15000);
    await page.close();
  },
  // night in the estate: crickets, distant night traffic
  async night_estate() {
    const page = await open('time=22&spawn=-1100,-950');
    await record(page, 'night_estate', 12000);
    await page.close();
  },
  // night on the open ridge: Tsavo night insects, wind
  async night_ridge() {
    const page = await open('time=23&spawn=300,430');
    await record(page, 'night_ridge', 12000);
    await page.close();
  },
  // the coast: Diani surf
  async beach() {
    const page = await open('time=15&spawn=1500,0');
    await record(page, 'beach', 10000);
    await page.close();
  },
  // at the matatu stage: engines idling, nganya mix through the body, conductor calls
  async stage() {
    const page = await open('time=11&spawn=20,125');
    await page.waitForTimeout(15000);
    await record(page, 'stage', 20000);
    await page.close();
  },
  // the car radio: Nganya Radio (the real mixes), then The Storyteller (voice)
  async radio() {
    const page = await open('time=12&spawn=8,40');
    await page.evaluate(() => {
      const mk = window.__mk;
      mk.useRadio.setState({ index: 0, on: true, volume: 0.9 });
      mk.radio.enterVehicle();
    });
    await page.waitForTimeout(4000);
    await record(page, 'radio_nganya', 12000);
    await page.evaluate(() => window.__mk.radio.step(4));
    await page.waitForTimeout(1500);
    await record(page, 'radio_storyteller', 15000);
    await page.evaluate(() => window.__mk.radio.exitVehicle());
    await page.close();
  },
  // a conductor's voice (pre-rendered Kenyan clip), close by
  async conductor() {
    const page = await open('time=12&spawn=8,40');
    await page.evaluate(() => {
      const mk = window.__mk;
    });
    await page.waitForTimeout(500);
    const rec = page.evaluate(() => window.__mk.recordMix(6000));
    await page.waitForTimeout(300);
    await page.evaluate(() => window.__mk.sayLine({ who: 'conductor', name: 'Conductor', text: 'CBD! CBD! Kuna space! Panda panda!', en: 'Seats free for CBD' }));
    writeFileSync(`${OUT}/conductor.webm`, Buffer.from(await rec, 'base64'));
    console.log('[audio] conductor.webm');
    await page.close();
  },
};

for (const [name, fn] of Object.entries(scenes)) {
  if (want.length && !want.includes(name)) continue;
  try {
    await fn();
  } catch (e) {
    console.log(`[audio] ${name} FAILED ${e.message.split('\n')[0]}`);
  }
}
console.log('ERRORS', errors.length ? errors.slice(0, 10) : 'none');
await browser.close();
