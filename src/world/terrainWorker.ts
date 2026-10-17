// Terrain height grids, off the main thread (session 12). Carving the grids under the roads
// (roadSurface.carvedHeight) costs seconds; done here the page never freezes while it loads.
//   { id, n, order: 'visual' | 'physics' } -> { id, heights: Float32Array }
//   visual : PlaneGeometry rotated flat: vertex ix + (n+1)*iy, x = -H + ix*c, z = -H + iy*c
//   physics: Rapier heightfield: index i*(n+1) + j, i along X, j along Z
import { carvedHeight, releaseCarveMemo } from './roadSurface';
import { WORLD_HALF } from '../config/world';
import { setTestPad } from './heights';

self.onmessage = (e: MessageEvent<{ id: number; n: number; order: 'visual' | 'physics'; testPad: boolean }>) => {
  const { id, n, order } = e.data;
  setTestPad(e.data.testPad); // the page's own height settings (the worker can't read its URL)
  const cell = (2 * WORLD_HALF) / n;
  const out = new Float32Array((n + 1) * (n + 1));
  for (let a = 0; a <= n; a++)
    for (let b = 0; b <= n; b++) {
      const x = -WORLD_HALF + a * cell;
      const z = -WORLD_HALF + b * cell;
      out[order === 'physics' ? a * (n + 1) + b : b * (n + 1) + a] = carvedHeight(x, z, cell);
    }
  releaseCarveMemo();
  (self as unknown as Worker).postMessage({ id, heights: out }, [out.buffer]);
};
