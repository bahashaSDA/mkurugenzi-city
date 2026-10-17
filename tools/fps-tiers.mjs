// Frame rate, draw calls and triangles per quality tier on this machine's GPU (uncapped).
//   node tools/fps-tiers.mjs [low,mid,high]    (EXTRA="&noshadow" etc. for experiments)
import { chromium } from 'playwright';
const b = await chromium.launch({ headless: process.env.HEADED ? false : true, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
for (const tier of (process.argv[2] ?? 'low,mid,high').split(',')) {
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await p.goto(`http://localhost:4173/?debug&tier=${tier}&time=11&spawn=20,120${process.env.EXTRA ?? ""}`);
  await p.getByRole('button', { name: 'Tap to enter' }).click({ timeout: 420000 });
  await p.waitForTimeout(6000);
  const r = await p.evaluate(async () => {
    const gl = window.__mk.gl;
    const ts = [];
    await new Promise((res) => { const f = (t) => { ts.push(t); if (ts.length < 180) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
    const d = ts.slice(1).map((t, i) => t - ts[i]).sort((a, b) => a - b);
    return { fps: +(1000 / d[d.length >> 1]).toFixed(1), p95ms: +d[Math.floor(d.length * 0.95)].toFixed(1), calls: gl.info.render.calls, tris: gl.info.render.triangles, dpr: devicePixelRatio, gpu: (() => { const c = gl.getContext(); const e = c.getExtension('WEBGL_debug_renderer_info'); return e ? c.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?'; })() };
  });
  console.log(tier, JSON.stringify(r));
  await p.close();
}
await b.close();
