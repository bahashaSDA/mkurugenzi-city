// node tools/enter-trace.mjs  (W=, H= viewport). Chrome trace of the first 3 s after "Tap to enter": the longest main-thread tasks and what is inside
import { chromium } from 'playwright';
import fs from 'fs';
const b = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: +(process.env.W ?? 1920), height: +(process.env.H ?? 1080) } });
await p.goto('http://localhost:4173/');
const btn = p.getByRole('button', { name: 'Tap to enter' });
await btn.waitFor({ timeout: 600000 });
await p.waitForTimeout(1000);
await b.startTracing(p, { categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'toplevel', 'gpu', 'blink', 'media', 'v8', 'gpu.angle', 'disabled-by-default-gpu.angle', 'disabled-by-default-gpu.service', 'gpu.service'] });
await btn.click();
await p.waitForTimeout(3000);
const buf = await b.stopTracing();
await b.close();
const ev = JSON.parse(buf.toString()).traceEvents;
fs.writeFileSync(process.env.TEMP + '/trace.json', JSON.stringify(ev));
const names = new Map(ev.filter((e) => e.name === 'ThreadName').map((e) => [`${e.pid}:${e.tid}`, e.args.name]));
const long = ev.filter((e) => e.ph === 'X' && e.dur > 150000).sort((a, b) => b.dur - a.dur).slice(0, 25);
for (const e of long) console.log(`${(e.dur / 1000).toFixed(0)} ms  ${names.get(`${e.pid}:${e.tid}`)}  ${e.name}  ${JSON.stringify(e.args ?? {}).slice(0, 120)}`);
