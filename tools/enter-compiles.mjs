// Shaders compiled and long frames in the first seconds of play (after "Tap to enter"): both
// should be ~0 if loading primed everything.  node tools/enter-compiles.mjs
// What is new in the renderer right after "Tap to enter" (programs, textures, canvas size)
import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
await p.goto('http://localhost:4173/?debug');
const btn = p.getByRole('button', { name: 'Tap to enter' });
await btn.waitFor({ timeout: 600000 });
const snap = () => p.evaluate(() => { const g = window.__mk.gl; return { progs: g.info.programs.map((x) => x.name + ':' + x.cacheKey.length + ':' + x.id), tex: g.info.memory.textures, geo: g.info.memory.geometries, w: g.domElement.width, h: g.domElement.height, pr: g.getPixelRatio() }; });
const a = await snap();
await btn.click();
await p.evaluate(() => new Promise((r) => { let last = performance.now(); const f = []; window.__frames = f; const s = (t) => { f.push(Math.round(t - last)); last = t; if (f.length < 240) requestAnimationFrame(s); else r(); }; requestAnimationFrame(s); }));
const c = await snap();
const fr = await p.evaluate(() => window.__frames.map((x, i) => [i, x]).filter(([, x]) => x > 60));
console.log('before', a.progs.length, 'tex', a.tex, 'geo', a.geo, a.w + 'x' + a.h, a.pr);
console.log('after ', c.progs.length, 'tex', c.tex, 'geo', c.geo, c.w + 'x' + c.h, c.pr);
console.log('new programs', c.progs.filter((x) => !a.progs.includes(x)));
console.log(await p.evaluate((ids) => {
  const g = window.__mk.gl; const ctx = g.getContext();
  return g.info.programs.filter((x) => ids.includes(x.id)).map((x) => { const sh = ctx.getAttachedShaders(x.program); const src = sh.map((h) => ctx.getShaderSource(h)); return { id: x.id, key: x.cacheKey, defs: src[1].split(String.fromCharCode(10)).filter((l) => /#define|uniform|void main/.test(l)).slice(0, 25).join(' | ').slice(0, 900) }; });
}, c.progs.filter((x) => !a.progs.includes(x)).map((x) => +x.split(':').pop())));
console.log(await p.evaluate((ids) => {
  const g = window.__mk.gl; const out = [];
  const seen = new Set();
  window.__mk.scene.traverse((o) => { for (const m of [].concat(o.material ?? [])) { if (seen.has(m)) continue; seen.add(m); const pr = g.properties.get(m); const prog = pr?.currentProgram; if (prog && ids.includes(prog.id)) out.push({ obj: o.name || o.type, parent: o.parent?.name || o.parent?.type, mat: m.type, mname: m.name, visible: o.visible, frag: (m.fragmentShader ?? '').slice(0, 80) }); } });
  return out;
}, c.progs.filter((x) => !a.progs.includes(x)).map((x) => +x.split(':').pop())));
console.log('long frames [index, ms]', JSON.stringify(fr));
await b.close();
