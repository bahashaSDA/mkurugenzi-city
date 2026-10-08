import * as THREE from 'three';

// Phase 0 procedural textures (no external assets). Replaced by KTX2 PBR sets from
// Poly Haven / ambientCG in Phase 1 (logged as placeholders in PROGRESS.md).

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function canvas(size: number) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  return { c, ctx };
}

function finish(c: HTMLCanvasElement, repeat: number, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let murram: THREE.Texture | null = null;
export function murramTexture(): THREE.Texture {
  if (murram) return murram;
  const { c, ctx } = canvas(256);
  ctx.fillStyle = '#9C4A2A';
  ctx.fillRect(0, 0, 256, 256);
  const r = rng(7);
  for (let i = 0; i < 4000; i++) {
    const v = r();
    ctx.fillStyle = v < 0.5 ? `rgba(110,52,32,${r() * 0.35})` : `rgba(184,112,63,${r() * 0.35})`;
    const s = 1 + r() * 4;
    ctx.fillRect(r() * 256, r() * 256, s, s);
  }
  // pebbles
  for (let i = 0; i < 120; i++) {
    ctx.fillStyle = `rgba(200,180,160,${0.3 + r() * 0.3})`;
    ctx.beginPath();
    ctx.arc(r() * 256, r() * 256, 0.6 + r() * 1.4, 0, Math.PI * 2);
    ctx.fill();
  }
  murram = finish(c, 1);
  return murram;
}

let tarmac: THREE.Texture | null = null;
export function tarmacTexture(): THREE.Texture {
  if (tarmac) return tarmac;
  const { c, ctx } = canvas(256);
  ctx.fillStyle = '#3A3A3C';
  ctx.fillRect(0, 0, 256, 256);
  const r = rng(11);
  for (let i = 0; i < 6000; i++) {
    const g = 40 + r() * 50;
    ctx.fillStyle = `rgba(${g},${g},${g + 2},0.5)`;
    ctx.fillRect(r() * 256, r() * 256, 1, 1);
  }
  // red murram dust creeping in from the edges
  const grad = ctx.createLinearGradient(0, 0, 256, 0);
  grad.addColorStop(0, 'rgba(156,74,42,0.45)');
  grad.addColorStop(0.12, 'rgba(156,74,42,0)');
  grad.addColorStop(0.88, 'rgba(156,74,42,0)');
  grad.addColorStop(1, 'rgba(156,74,42,0.45)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  // faded centre dashes
  ctx.fillStyle = 'rgba(230,225,210,0.55)';
  ctx.fillRect(126, 20, 4, 90);
  ctx.fillRect(126, 148, 4, 90);
  tarmac = finish(c, 1);
  return tarmac;
}

let kerb: THREE.Texture | null = null;
/** Black-and-white painted kerb stripes (about 1 m per band). */
export function kerbTexture(): THREE.Texture {
  if (kerb) return kerb;
  const { c, ctx } = canvas(64);
  ctx.fillStyle = '#e8e4da';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#1b1b1b';
  ctx.fillRect(0, 0, 32, 64);
  ctx.fillStyle = 'rgba(156,74,42,0.35)';
  ctx.fillRect(0, 48, 64, 16);
  kerb = finish(c, 1);
  kerb.magFilter = THREE.NearestFilter;
  return kerb;
}
