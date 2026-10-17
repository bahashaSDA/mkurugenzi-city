#!/usr/bin/env node
// Lines the game actually spoke WITHOUT a Kenyan clip (they would fall back to the browser's voice):
// stands at a busy matatu stage, rides along, and plays a few mission briefings.
//   node tools/voice-coverage.mjs [seconds=120]
import { chromium } from 'playwright';
const S = Number(process.argv[2] ?? 120);
const b = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
await p.goto('http://localhost:4173/?debug&tier=low&spawn=9,100');
const btn = p.getByRole('button', { name: 'Tap to enter' });
await btn.waitFor({ timeout: 600000 });
await btn.click();
await p.locator('.splash2').waitFor({ state: 'detached', timeout: 60000 });
// briefings: speak every mission line through the game's own say() (same path as the cutscene)
await p.evaluate(() => { const mk = window.__mk; for (const m of mk.MISSIONS) for (const l of m.lines) mk.sayLine({ who: mk.speakerFor(l.who), name: l.who, text: l.text, subtitle: false }); });
await p.waitForTimeout(S * 1000);
if (process.env.SELFTEST) await p.evaluate(() => window.__mk.sayLine({ who: 'conductor', name: 'x', text: 'selftest line ' + Math.random() }));
const miss = await p.evaluate(() => [...window.__mk.missingVoice.values()]);
console.log(JSON.stringify({ missing: miss.length, lines: miss }, null, 1));
await b.close();
