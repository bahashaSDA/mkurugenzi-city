#!/usr/bin/env node
// Every mission briefing line with the voice its speaker uses (from the running game: missions are
// built at runtime). Output JSON for tools/gen-voices.py.
//   node tools/dump-mission-lines.mjs > mission-lines.json
import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage();
await p.goto('http://localhost:4173/?debug&tier=low&minimal');
await p.waitForFunction(() => window.__mk?.MISSIONS && window.__mk?.speakerFor, null, { timeout: 420000 });
const lines = await p.evaluate(() => {
  const mk = window.__mk;
  const out = [];
  const seen = new Set();
  for (const m of mk.MISSIONS) for (const l of m.lines) {
    const who = mk.speakerFor(l.who);
    const k = who + '|' + l.text;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ who, text: l.text });
  }
  return out;
});
process.stdout.write(JSON.stringify(lines));
console.error(`[mission-lines] ${lines.length}`);
await b.close();
