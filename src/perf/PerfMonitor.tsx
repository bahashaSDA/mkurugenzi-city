import { useEffect, useRef } from 'react';
import { LITE_DPR, lite } from './lite';
import { useFrame, useThree } from '@react-three/fiber';
import { useGame } from '../app/store';
import { BUDGETS, DPR_MIN, FRAME_HITCH_MS } from './budgets';

// Shared live stats (written in the render loop, read by the DOM overlay; no React re-renders).
export const perfStats = { fps: 0, frameMs: 0, calls: 0, tris: 0, geos: 0, texs: 0, hitches: 0, heapMB: 0 };


/**
 * Collects renderer stats and runs adaptive quality (SPEC 10.8):
 * FPS under target for 3 s → lower DPR in 0.25 steps (down to DPR_MIN). The tier is picked while
 * loading (app/Game Ready), never changed automatically in play.
 * Not judged in the first 20 s of play (streaming in, first sights), and a second that contained a
 * one-off stall (> 300 ms) doesn't count: a hitch is not a slow machine (a tier change itself
 * rebuilds the world and every shader, so it must never be triggered by one).
 * FPS comfortably above target for 10 s → raise DPR back up to the tier max.
 */
export function PerfMonitor() {
  const gl = useThree((s) => s.gl);
  const setDpr = useThree((s) => s.setDpr);
  const acc = useRef({ frames: 0, time: 0, below: 0, above: 0, lastNow: 0, worst: 0, playingSince: 0, dprDrops: 0 });

  useFrame((_, dt) => {
    const a = acc.current;
    const now = performance.now();
    if (a.lastNow) {
      const ms = now - a.lastNow;
      perfStats.frameMs = ms;
      if (ms > FRAME_HITCH_MS) perfStats.hitches++;
      a.worst = Math.max(a.worst, ms);
    }
    a.lastNow = now;
    a.frames++;
    a.time += dt;
    // With post-processing a frame is several render passes (shadows, scene, AO, bloom...), and
    // three resets gl.info per pass by default. Count the whole frame: auto-reset off, reset here.
    gl.info.autoReset = false;
    perfStats.calls = gl.info.render.calls;
    perfStats.tris = gl.info.render.triangles;
    gl.info.reset();
    if (a.time < 1) return;

    perfStats.fps = a.frames / a.time;
    perfStats.geos = gl.info.memory.geometries;
    perfStats.texs = gl.info.memory.textures;
    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    if (mem) perfStats.heapMB = mem.usedJSHeapSize / 1048576;
    a.frames = 0;
    a.time = 0;
    const stalled = a.worst > 300;
    a.worst = 0;

    const g = useGame.getState();
    if (g.phase !== 'playing') a.playingSince = 0;
    else if (!a.playingSince) a.playingSince = now;
    if (g.quality !== 'auto' || g.phase !== 'playing' || now - a.playingSince < 20000 || stalled) return;
    const budget = BUDGETS[g.tier];
    if (perfStats.fps < budget.targetFps - 2) {
      a.below++;
      a.above = 0;
    } else if (perfStats.fps > budget.targetFps * 1.25) {
      a.above++;
      a.below = 0;
    } else {
      a.below = a.above = 0;
    }
    if (a.below >= 3 && g.dpr > DPR_MIN + 0.01) {
      a.below = 0;
      const d = Math.max(DPR_MIN, g.dpr - 0.25);
      g.setDpr(d);
      setDpr(d);
    } else if (a.below >= 3) {
      // the tier itself is chosen while loading (app/Game Ready: measured frames, behind the
      // splash); in play only the resolution adapts: a tier change rebuilds the world and froze
      // the game for 7-9 s. Choosing a tier by hand (the quality menu) still works.
      a.below = 0;
    } else if (a.above >= 10) {
      a.above = 0;
      const max = Math.min(lite.on ? LITE_DPR : budget.dprMax, window.devicePixelRatio);
      if (g.dpr < max - 0.01) {
        const d = Math.min(max, g.dpr + 0.25);
        g.setDpr(d);
        setDpr(d);
      }
    }
  });
  return null;
}

/** DOM overlay: dev builds, or any build with ?perf. Turns red when over budget. */
export function PerfOverlay() {
  const ref = useRef<HTMLPreElement>(null);
  useEffect(() => {
    const id = setInterval(() => {
      const el = ref.current;
      if (!el) return;
      const g = useGame.getState();
      const b = BUDGETS[g.tier];
      const over = perfStats.calls > b.maxDrawCalls || perfStats.tris > b.maxTriangles || perfStats.fps < b.targetFps;
      el.dataset.over = over ? '1' : '0';
      el.textContent =
        `FPS ${perfStats.fps.toFixed(0)} (target ${b.targetFps})\n` +
        `calls ${perfStats.calls}/${b.maxDrawCalls}\n` +
        `tris ${(perfStats.tris / 1000).toFixed(0)}k/${(b.maxTriangles / 1000).toFixed(0)}k\n` +
        `geo ${perfStats.geos} tex ${perfStats.texs}\n` +
        (perfStats.heapMB ? `heap ${perfStats.heapMB.toFixed(0)} MB\n` : '') +
        `hitches>50ms ${perfStats.hitches}\n` +
        `tier ${g.tier} (${g.quality}) dpr ${g.dpr.toFixed(2)}\n` +
        `cells ${g.activeCells.length}`;
    }, 500);
    return () => clearInterval(id);
  }, []);
  return <pre ref={ref} className="perf-overlay" />;
}
