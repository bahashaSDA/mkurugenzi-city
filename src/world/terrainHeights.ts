import { carvedHeight, releaseCarveMemo } from './roadSurface';
import { WORLD_HALF } from '../config/world';
import { testPad } from './heights';

// Carved terrain heights, computed once per grid (cached for every later mount) in a worker so
// loading never freezes the page. Falls back to the main thread if workers aren't available.

const cache = new Map<string, Promise<Float32Array>>();
let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, (h: Float32Array) => void>();

function compute(n: number, order: 'visual' | 'physics'): Float32Array {
  const cell = (2 * WORLD_HALF) / n;
  const out = new Float32Array((n + 1) * (n + 1));
  for (let a = 0; a <= n; a++)
    for (let b = 0; b <= n; b++) out[order === 'physics' ? a * (n + 1) + b : b * (n + 1) + a] = carvedHeight(-WORLD_HALF + a * cell, -WORLD_HALF + b * cell, cell);
  releaseCarveMemo();
  return out;
}

export function terrainHeights(n: number, order: 'visual' | 'physics'): Promise<Float32Array> {
  const key = `${order}:${n}`;
  let p = cache.get(key);
  if (p) return p;
  p = new Promise<Float32Array>((resolve) => {
    try {
      worker ??= new Worker(new URL('./terrainWorker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e: MessageEvent<{ id: number; heights: Float32Array }>) => {
        pending.get(e.data.id)?.(e.data.heights);
        pending.delete(e.data.id);
      };
      worker.onerror = () => {
        // the worker failed: compute what's outstanding here instead
        for (const [, done] of pending) done(new Float32Array(0));
      };
      const id = nextId++;
      pending.set(id, (h) => resolve(h.length ? h : compute(n, order)));
      worker.postMessage({ id, n, order, testPad: testPad() });
    } catch {
      resolve(compute(n, order));
    }
  });
  cache.set(key, p);
  return p;
}
