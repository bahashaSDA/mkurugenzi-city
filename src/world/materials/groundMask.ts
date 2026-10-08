import * as THREE from 'three';
import type { Placement } from '../kit/KitInstances';

// Ground mask for the hub area, generated from the layout (no download):
//   R = worn, compacted red-brown murram (lane, footpaths, kiosk fronts, doorways)
//   G = grass / weeds (open ground away from buildings and paths)
//   B = macro variation noise (breaks up texture tiling over tens of metres)
// Colours and where wear appears follow research/visual-references (PALETTES.md, Kibera photos).

export const MASK_SIZE_M = 420; // square, centred on the spawn
export const MASK_PX = 1024; // ~0.41 m per pixel

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Value noise (smooth), octaves summed: cheap fBm on the CPU, once at startup. */
function makeNoise(seed: number) {
  const r = rng(seed);
  const N = 256;
  const grid = new Float32Array(N * N).map(() => r());
  const at = (x: number, y: number) => grid[((y & (N - 1)) * N + (x & (N - 1))) >>> 0]!;
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const v = (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const tx = smooth(x - xi);
    const ty = smooth(y - yi);
    const a = at(xi, yi) + (at(xi + 1, yi) - at(xi, yi)) * tx;
    const b = at(xi, yi + 1) + (at(xi + 1, yi + 1) - at(xi, yi + 1)) * tx;
    return a + (b - a) * ty;
  };
  return (x: number, y: number, oct = 4) => {
    let sum = 0;
    let amp = 0.5;
    let f = 1;
    for (let i = 0; i < oct; i++) {
      sum += v(x * f, y * f) * amp;
      amp *= 0.5;
      f *= 2;
    }
    return sum;
  };
}

export function buildGroundMask(placements: Placement[]): THREE.DataTexture {
  const px = MASK_PX;
  const mpp = MASK_SIZE_M / px; // metres per pixel
  const toPx = (m: number) => (m + MASK_SIZE_M / 2) / mpp;
  const data = new Uint8Array(px * px * 4);
  const worn = new Float32Array(px * px);
  const occupied = new Float32Array(px * px);
  const noise = makeNoise(254);

  const stamp = (buf: Float32Array, cx: number, cz: number, radiusM: number, strength: number) => {
    const r = radiusM / mpp;
    const x0 = Math.max(0, Math.floor(toPx(cx) - r));
    const x1 = Math.min(px - 1, Math.ceil(toPx(cx) + r));
    const y0 = Math.max(0, Math.floor(toPx(cz) - r));
    const y1 = Math.min(px - 1, Math.ceil(toPx(cz) + r));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x - toPx(cx), y - toPx(cz)) / r;
        if (d < 1) buf[y * px + x] = Math.max(buf[y * px + x]!, strength * (1 - d * d));
      }
    }
  };

  // Market lane: worn along its whole length, noisy edges, heaviest in the middle.
  for (let z = -170; z <= 120; z += 1.2) {
    const wobble = (noise(0.3, z * 0.05) - 0.5) * 3;
    stamp(worn, wobble, z, 5.5 + noise(1, z * 0.1) * 2, 0.95);
  }
  // Doorways, kiosk fronts and shack footpaths: wear where people actually walk.
  for (const p of placements) {
    stamp(occupied, p.x, p.z, p.piece === 'block_flat' ? 9 : 3.4, 1);
    if (p.piece.startsWith('kiosk')) stamp(worn, p.x + Math.sin(p.rotY) * 2, p.z + Math.cos(p.rotY) * 2, 2.8, 0.9);
    if (p.piece.startsWith('shack')) stamp(worn, p.x + Math.sin(p.rotY) * 2.3, p.z + Math.cos(p.rotY) * 2.3, 2.2, 0.75);
  }

  for (let y = 0; y < px; y++) {
    for (let x = 0; x < px; x++) {
      const i = y * px + x;
      const wx = x * mpp - MASK_SIZE_M / 2;
      const wz = y * mpp - MASK_SIZE_M / 2;
      const macro = noise(wx * 0.02, wz * 0.02, 5);
      // Worn ground breaks up with noise so edges are never clean shapes.
      const w = Math.min(1, worn[i]! * (0.75 + noise(wx * 0.25, wz * 0.25) * 0.5));
      // Grass survives only on open ground: away from buildings and paths, in patchy clumps.
      const open = 1 - Math.max(occupied[i]!, w);
      const grass = Math.max(0, Math.min(1, (noise(wx * 0.08 + 31, wz * 0.08 + 7, 4) - 0.48) * 4)) * open;
      data[i * 4] = w * 255;
      data[i * 4 + 1] = grass * 255;
      data[i * 4 + 2] = macro * 255;
      data[i * 4 + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, px, px, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}
